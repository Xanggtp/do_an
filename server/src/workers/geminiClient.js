import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.js';

const API_ROOT = 'https://generativelanguage.googleapis.com';
const FILE_READY_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export function isGeminiEnabled() {
  return Boolean(config.geminiApiKey) && config.workerMode !== 'stub';
}

async function geminiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'x-goog-api-key': config.geminiApiKey, ...(options.headers || {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini API ${response.status}: ${body.slice(0, 300)}`);
  }
  return response;
}

/** Uploads a local video through the Gemini File API (resumable protocol) and waits until it is ACTIVE. */
async function uploadFile(filePath, mimeType = 'video/mp4') {
  const { size } = await fs.promises.stat(filePath);
  const start = await geminiFetch(`${API_ROOT}/upload/v1beta/files`, {
    method: 'POST',
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

  const uploaded = await geminiFetch(uploadUrl, {
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
    await new Promise((resolve) => setTimeout(resolve, 3000));
    file = await (await geminiFetch(`${API_ROOT}/v1beta/${file.name}`)).json();
  }
  if (file.state !== 'ACTIVE') throw new Error(`Gemini file is not usable (state: ${file.state}).`);
  return file;
}

async function deleteFile(name) {
  await geminiFetch(`${API_ROOT}/v1beta/${name}`, { method: 'DELETE' }).catch(() => {});
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

/** Sends one local segment file to Gemini and returns the parsed JSON review. */
export async function analyzeSegmentWithGemini(filePath, context) {
  const file = await uploadFile(filePath);
  try {
    const response = await geminiFetch(`${API_ROOT}/v1beta/models/${config.geminiModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      })
    });
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    if (!text) throw new Error(`Gemini returned no content (finishReason: ${data.candidates?.[0]?.finishReason || 'unknown'}).`);
    return JSON.parse(text);
  } finally {
    await deleteFile(file.name);
  }
}
