import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.js';
import { decryptSecret } from '../utils/secretBox.js';

const API_ROOT = 'https://generativelanguage.googleapis.com';
const FILE_READY_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

/** Default Gemini model for new uploads and fallback. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/** Models a teacher can pick in Settings. */
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];

/** Retired models previously stored in DB/.env mapped to active equivalents. */
const LEGACY_MODEL_MAP = {
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.5-pro': 'gemini-3.8-flash',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-1.5-flash': 'gemini-3.8-flash',
  'gemini-1.5-pro': 'gemini-3.8-flash'
};

const EXCLUDED_MODEL_PATTERN = /(tts|live|embedding|imagen|veo|aqa|bison|gecko|robotics|computer-use|learnlm)/i;

export function normalizeGeminiModel(model) {
  const value = typeof model === 'string' ? model.trim() : '';
  if (!value) return DEFAULT_GEMINI_MODEL;
  return LEGACY_MODEL_MAP[value] || value;
}

/**
 * Which Gemini credentials analyze a teacher's videos:
 * 1. the key the teacher saved in Settings (works in every WORKER_MODE),
 * 2. otherwise the server-wide GEMINI_API_KEY (not in WORKER_MODE=stub),
 * 3. otherwise null -> deterministic stub analysis.
 */
export function resolveGeminiCredentials(user) {
  if (user?.geminiApiKeyEnc) {
    const apiKey = decryptSecret(user.geminiApiKeyEnc);
    if (!apiKey) throw new Error('The saved Gemini API key can no longer be read. Please enter it again in Settings.');
    return { apiKey, model: normalizeGeminiModel(user.geminiModel || config.geminiModel), source: 'user' };
  }
  if (config.geminiApiKey && config.workerMode !== 'stub') {
    return { apiKey: config.geminiApiKey, model: normalizeGeminiModel(config.geminiModel), source: 'server' };
  }
  return null;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const FALLBACK_STATUSES = new Set([404, 429, 503]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response) {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(15000, seconds * 1000);
  const dateMs = Date.parse(header) - Date.now();
  return Number.isFinite(dateMs) && dateMs > 0 ? Math.min(15000, dateMs) : null;
}

async function geminiFetch(credentials, url, options = {}) {
  const { retries = 0, timeoutMs, ...fetchOptions } = options;
  const baseDelayMs = Number(process.env.GEMINI_RETRY_DELAY_MS || 2000);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      ...fetchOptions,
      headers: { 'x-goog-api-key': credentials.apiKey, ...(fetchOptions.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs || REQUEST_TIMEOUT_MS)
    });
    if (response.ok) return response;

    const body = await response.text().catch(() => '');
    const retryable = RETRYABLE_STATUSES.has(response.status);
    if (retryable && attempt < retries) {
      const retryAfter = parseRetryAfterMs(response);
      const delayMs = retryAfter ?? Math.min(15000, baseDelayMs * (2 ** attempt));
      await sleep(delayMs);
      continue;
    }
    throw Object.assign(
      new Error(`Gemini API ${response.status}: ${body.slice(0, 300)}`),
      { geminiStatus: response.status, geminiBody: body }
    );
  }
}

/**
 * Checks a key and model against Gemini without spending tokens (model metadata lookup).
 * Resolves on success; rejects with a user-facing message otherwise.
 */
export async function verifyGeminiKey(apiKey, model) {
  try {
    await geminiFetch({ apiKey }, `${API_ROOT}/v1beta/models/${encodeURIComponent(model)}`, { timeoutMs: 15000 });
  } catch (error) {
    if ([400, 401, 403].includes(error.geminiStatus)) throw Object.assign(new Error('Google rejected this API key. Check that you copied the whole key from Google AI Studio.'), { statusCode: 400 });
    if (error.geminiStatus === 404) throw Object.assign(new Error(`The model ${model} is not available for this key.`), { statusCode: 400 });
    if (error.geminiStatus === 429) throw Object.assign(new Error('This key has hit its Gemini quota. Try again later or use another key.'), { statusCode: 400 });
    throw Object.assign(new Error('Could not reach Google to check the key. Check the internet connection and try again.'), { statusCode: 502 });
  }
}

/** Uploads a local video through the Gemini File API (resumable protocol) and waits until it is ACTIVE. */
async function uploadFile(credentials, filePath, mimeType = 'video/mp4') {
  const { size } = await fs.promises.stat(filePath);
  const start = await geminiFetch(credentials, `${API_ROOT}/upload/v1beta/files`, {
    method: 'POST',
    retries: 2,
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: path.basename(filePath) } })
  });
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini File API did not return an upload URL.');

  const uploaded = await geminiFetch(credentials, uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: await fs.openAsBlob(filePath)
  });
  let { file } = await uploaded.json();

  const deadline = Date.now() + FILE_READY_TIMEOUT_MS;
  while (file.state === 'PROCESSING') {
    if (Date.now() > deadline) throw new Error('Gemini file processing timed out.');
    await sleep(3000);
    file = await (await geminiFetch(credentials, `${API_ROOT}/v1beta/${file.name}`, { retries: 2 })).json();
  }
  if (file.state !== 'ACTIVE') throw new Error(`Gemini file is not usable (state: ${file.state}).`);
  return file;
}

async function deleteFile(credentials, name) {
  await geminiFetch(credentials, `${API_ROOT}/v1beta/${name}`, { method: 'DELETE' }).catch(() => {});
}

const scoreSchema = { type: 'INTEGER', description: 'Score from 1 (poor) to 5 (excellent)' };

/** JSON contract returned for each segment (matches the review card on the upload page). */
export const segmentResponseSchema = {
  type: 'OBJECT',
  properties: {
    quality_scores: {
      type: 'OBJECT',
      properties: { audio_quality: scoreSchema, video_quality: scoreSchema, content_clarity: scoreSchema, processing_confidence: scoreSchema },
      required: ['audio_quality', 'video_quality', 'content_clarity', 'processing_confidence']
    },
    content_review: {
      type: 'OBJECT',
      properties: {
        main_topic: { type: 'STRING' },
        summary: { type: 'STRING' },
        key_points: { type: 'ARRAY', items: { type: 'STRING' } },
        important_visuals: { type: 'ARRAY', items: { type: 'STRING' } },
        continuity_notes: { type: 'STRING' }
      },
      required: ['main_topic', 'summary', 'key_points', 'important_visuals', 'continuity_notes']
    },
    issues_detected: { type: 'ARRAY', items: { type: 'STRING' } },
    recommendation: { type: 'STRING', enum: ['continue', 'review', 'reupload'] },
    transcript: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { start: { type: 'NUMBER' }, end: { type: 'NUMBER' }, text: { type: 'STRING' } },
        required: ['start', 'end', 'text']
      }
    },
    feedback: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          timestamp: { type: 'NUMBER', description: 'Seconds from the start of THIS segment' },
          category: { type: 'STRING', enum: ['STRENGTH', 'GROWTH_OPPORTUNITY'] },
          rubricDimension: { type: 'STRING', enum: ['Danielson 2b', 'Danielson 3b', 'Danielson 3c', 'Danielson 3d'] },
          title: { type: 'STRING' },
          description: { type: 'STRING' }
        },
        required: ['timestamp', 'category', 'rubricDimension', 'title', 'description']
      }
    },
    copus: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          timestamp: { type: 'NUMBER', description: 'Seconds from the start of THIS segment' },
          code: { type: 'STRING', enum: ['T-L', 'T-Ask', 'T-CG', 'T-PQ', 'T-MG', 'SG', 'Ind', 'S-Ask', 'S-AnQ', 'WC'] },
          actor: { type: 'STRING', enum: ['teacher', 'students'] },
          label: { type: 'STRING' }
        },
        required: ['timestamp', 'code', 'actor', 'label']
      }
    },
    blooms: {
      type: 'OBJECT',
      properties: {
        Remember: { type: 'INTEGER' },
        Understand: { type: 'INTEGER' },
        Apply: { type: 'INTEGER' },
        Analyze: { type: 'INTEGER' },
        Evaluate: { type: 'INTEGER' },
        Create: { type: 'INTEGER' }
      },
      required: ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']
    }
  },
  required: ['quality_scores', 'content_review', 'issues_detected', 'recommendation', 'transcript', 'feedback', 'copus', 'blooms']
};

function buildPrompt({ index, total, startSec, endSec, className, subject, previousSummary }) {
  const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return [
    'Bạn là chuyên gia dự giờ, đánh giá chất lượng giảng dạy đại học.',
    `Đây là phân đoạn ${index}/${total} (${clock(startSec)} - ${clock(endSec)}) của một bản ghi bài giảng.`,
    className || subject ? `Lớp: ${className || '-'}; Môn học: ${subject || '-'}.` : '',
    previousSummary ? `Tóm tắt phân đoạn trước: ${previousSummary}` : 'Đây là phân đoạn đầu tiên.',
    '',
    'Hãy xem và nghe phân đoạn, rồi trả về JSON đúng schema:',
    '- quality_scores: chấm 1-5 chất lượng âm thanh, hình ảnh, độ rõ ràng nội dung và độ tin cậy của phân tích.',
    '- content_review: chủ đề chính, tóm tắt, ý chính, hình ảnh/slide quan trọng, ghi chú tính liên tục với phân đoạn trước/sau.',
    '- issues_detected: vấn đề kỹ thuật (mất tiếng, mờ hình...) nếu có; recommendation: continue / review / reupload.',
    '- transcript: lời nói có mốc thời gian (giây tính từ đầu phân đoạn này), giữ nguyên ngôn ngữ gốc.',
    '- feedback: 0-3 nhận xét theo khung Danielson (2b môi trường học tập, 3b đặt câu hỏi & thảo luận, 3c thu hút người học, 3d đánh giá trong giờ học), chỉ nêu khi có bằng chứng trong phân đoạn.',
    '- copus: các thay đổi hoạt động theo mã COPUS kèm mốc thời gian.',
    '- blooms: số lượng câu hỏi/hoạt động thuộc từng mức Bloom quan sát được trong phân đoạn.',
    'Viết toàn bộ phần văn bản mô tả bằng tiếng Việt. Không suy đoán ngoài những gì quan sát được.'
  ].filter(Boolean).join('\n');
}

function extractSuggestedModels(errorText, failedModel) {
  const matches = [...String(errorText || '').matchAll(/models\/([a-z0-9._-]+)/gi)]
    .map((match) => match[1])
    .filter((name) => name && name !== failedModel && !EXCLUDED_MODEL_PATTERN.test(name));
  return [...new Set(matches)];
}

async function discoverGeminiModels(credentials) {
  try {
    const response = await geminiFetch(credentials, `${API_ROOT}/v1beta/models?pageSize=100`, { timeoutMs: 15000 });
    const data = await response.json();
    const candidates = (data.models || [])
      .filter((item) =>
        Array.isArray(item.supportedGenerationMethods) &&
        item.supportedGenerationMethods.includes('generateContent') &&
        typeof item.name === 'string' &&
        item.name.startsWith('models/gemini-')
      )
      .map((item) => item.name.replace(/^models\//, ''))
      .filter((name) => !EXCLUDED_MODEL_PATTERN.test(name));

    const rank = (name) => {
      if (name === DEFAULT_GEMINI_MODEL) return 0;
      if (name.includes('flash') && !name.includes('lite')) return 1;
      if (name.includes('flash-lite')) return 2;
      if (name.includes('pro')) return 3;
      return 4;
    };
    return candidates.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

/** Sends one local segment file to Gemini and returns the parsed JSON review. */
export async function analyzeSegmentWithGemini(credentials, filePath, context) {
  const file = await uploadFile(credentials, filePath);
  const requestBody = JSON.stringify({
    contents: [{
      role: 'user',
      parts: [
        { file_data: { mime_type: file.mimeType || 'video/mp4', file_uri: file.uri } },
        { text: buildPrompt(context) }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: segmentResponseSchema
    }
  });

  try {
    const tried = new Set();
    const queue = [normalizeGeminiModel(credentials.model)];
    let discovered = false;
    let lastFallbackError = null;

    while (queue.length > 0) {
      const model = queue.shift();
      if (!model || tried.has(model)) continue;
      tried.add(model);

      try {
        const response = await geminiFetch(credentials, `${API_ROOT}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          retries: 2,
          headers: { 'Content-Type': 'application/json' },
          body: requestBody
        });
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
        if (!text) throw new Error(`Gemini returned no content (finishReason: ${data.candidates?.[0]?.finishReason || 'unknown'}).`);
        // Persist the working model on credentials so remaining segments skip unavailable/overloaded models
        credentials.model = model;
        return JSON.parse(text);
      } catch (error) {
        if (!FALLBACK_STATUSES.has(error.geminiStatus)) throw error;
        lastFallbackError = error;

        // Try any replacement model recommended by Google's 404 message, then other active models
        const suggested = error.geminiStatus === 404 ? extractSuggestedModels(error.geminiBody || error.message, model) : [];
        for (const candidate of [...suggested, ...GEMINI_MODELS]) {
          if (!tried.has(candidate) && !queue.includes(candidate)) queue.push(candidate);
        }

        // If all known models failed with 404/503/429, query Google's models list dynamically
        if (queue.every((candidate) => tried.has(candidate)) && !discovered) {
          discovered = true;
          const available = await discoverGeminiModels(credentials);
          let added = 0;
          for (const candidate of available) {
            if (!tried.has(candidate) && !queue.includes(candidate)) {
              queue.push(candidate);
              added += 1;
              if (added >= 5) break;
            }
          }
        }
      }
    }

    throw lastFallbackError || new Error('No compatible Gemini model is available for this API key.');
  } finally {
    await deleteFile(credentials, file.name);
  }
}
