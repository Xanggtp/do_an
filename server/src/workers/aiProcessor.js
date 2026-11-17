import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '../config/prisma.js';
import { config } from '../config/env.js';
import { objectKeyFromFileUrl, persistFile, removePrefix, segmentPrefix, withLocalFile } from '../storage/storage.js';
import { sliceVideoIntoSegments, validateMediaFile } from './lectureSegmentWorker.js';
import { analyzeSegmentWithGemini, isGeminiEnabled } from './geminiClient.js';

/*
 * Lecture processing pipeline:
 *   VALIDATING (ffprobe) -> SEGMENTING (120s, -c copy) -> ANALYZING (Gemini or stub, per segment) -> COMPLETED
 * Progress (0-100) and stage are written to the Video record so the upload page can poll them.
 */

const PROGRESS = { validating: 5, segmentingStart: 10, segmentingEnd: 30, analyzingEnd: 95 };

const stubFeedback = [
  { category: 'STRENGTH', rubricDimension: 'Danielson 3b', title: 'Câu hỏi gợi mở mở rộng tư duy sinh viên', description: 'Giảng viên đặt câu hỏi "tại sao" để sinh viên giải thích lập luận của mình.' },
  { category: 'GROWTH_OPPORTUNITY', rubricDimension: 'Danielson 3c', title: 'Tăng trao đổi giữa sinh viên với nhau', description: 'Mời sinh viên phản hồi trực tiếp ý kiến của bạn trước khi giảng viên tổng hợp.' },
  { category: 'STRENGTH', rubricDimension: 'Danielson 3d', title: 'Kiểm tra mức độ hiểu bài kịp thời', description: 'Hoạt động so sánh nhanh cho bằng chứng về mức độ hiểu trước khi chuyển sang luyện tập.' },
  { category: 'GROWTH_OPPORTUNITY', rubricDimension: 'Danielson 2b', title: 'Nhắc lại quy tắc thảo luận', description: 'Nhắc lại quy tắc lắng nghe trước phần chia sẻ chung tiếp theo.' }
];

const stubCopus = [
  { code: 'T-L', actor: 'teacher', label: 'Lecturing' },
  { code: 'T-Ask', actor: 'teacher', label: 'Asking questions' },
  { code: 'SG', actor: 'students', label: 'Small group work' },
  { code: 'T-CG', actor: 'teacher', label: 'Whole group discussion' },
  { code: 'Ind', actor: 'students', label: 'Individual work' }
];

/** Deterministic stand-in used when WORKER_MODE=stub or GEMINI_API_KEY is empty. */
export function stubAnalyzeSegment({ index, startSec, endSec }) {
  const length = Math.max(1, endSec - startSec);
  const feedback = stubFeedback[(index - 1) % stubFeedback.length];
  const copus = stubCopus[(index - 1) % stubCopus.length];
  return {
    quality_scores: { audio_quality: 5, video_quality: 5, content_clarity: 4, processing_confidence: 3 },
    content_review: {
      main_topic: index === 1 ? 'Khởi động tiết học & đặt vấn đề' : `Nội dung trọng tâm – phần ${index}`,
      summary: 'Kết quả mô phỏng (chưa bật Gemini). Điền GEMINI_API_KEY và đặt WORKER_MODE=inline hoặc queue để có phân tích thật.',
      key_points: ['Giảng viên đặt câu hỏi gợi mở.', 'Sinh viên thảo luận theo nhóm nhỏ.'],
      important_visuals: ['Slide trình chiếu nội dung bài học.'],
      continuity_notes: index === 1 ? 'Phân đoạn mở đầu bài học.' : `Tiếp nối nội dung phân đoạn ${index - 1}.`
    },
    issues_detected: [],
    recommendation: 'continue',
    transcript: [],
    feedback: [{ ...feedback, timestamp: Math.min(30, length / 2) }],
    copus: [{ ...copus, timestamp: 0 }],
    blooms: { Remember: 1, Understand: 1 + (index % 2), Apply: index % 3, Analyze: index % 2, Evaluate: 0, Create: 0 }
  };
}

const bloomLevels = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

/** Merges per-segment results into lecture-level feedback, COPUS timeline and Bloom distribution. */
export function summarizeLecture(segments, duration) {
  const clamp = (seconds) => Math.max(0, Math.min(duration || Infinity, seconds));
  const feedback = [];
  const copusTimeline = [];
  const bloomsDistribution = Object.fromEntries(bloomLevels.map((level) => [level, 0]));

  for (const segment of segments) {
    const review = segment.review || {};
    for (const item of review.feedback || []) {
      feedback.push({
        timestamp: clamp(segment.startSec + Number(item.timestamp || 0)),
        category: item.category === 'STRENGTH' ? 'STRENGTH' : 'GROWTH_OPPORTUNITY',
        rubricDimension: String(item.rubricDimension || 'Danielson 3b'),
        title: String(item.title || '').slice(0, 200),
        description: String(item.description || '').slice(0, 2000)
      });
    }
    for (const item of review.copus || []) {
      copusTimeline.push({ timestamp: clamp(segment.startSec + Number(item.timestamp || 0)), code: item.code, actor: item.actor, label: item.label });
    }
    for (const level of bloomLevels) bloomsDistribution[level] += Math.max(0, Number(review.blooms?.[level]) || 0);
  }

  feedback.sort((a, b) => a.timestamp - b.timestamp);
  copusTimeline.sort((a, b) => a.timestamp - b.timestamp);
  // Collapse consecutive entries with the same COPUS code (e.g. lecturing across a segment boundary)
  const timeline = copusTimeline.filter((item, i) => i === 0 || item.code !== copusTimeline[i - 1].code);
  return { feedback, copusTimeline: timeline, bloomsDistribution };
}

async function setProgress(videoId, data) {
  await prisma.video.update({ where: { id: videoId }, data });
}

export async function processVideo(videoId) {
  const segmentsKeyPrefix = segmentPrefix(videoId);
  const workDir = path.join(os.tmpdir(), `classmind-${videoId}`);
  await setProgress(videoId, { status: 'PROCESSING', stage: 'VALIDATING', progress: PROGRESS.validating, error: null });

  try {
    const video = await prisma.video.findUniqueOrThrow({ where: { id: videoId }, include: { class: true } });

    // Make retries idempotent: drop segments from any previous attempt
    await prisma.videoSegment.deleteMany({ where: { videoId } });
    await removePrefix(segmentsKeyPrefix);
    await fs.rm(workDir, { recursive: true, force: true });

    const segmentRows = await withLocalFile(objectKeyFromFileUrl(video.fileUrl), async (inputPath) => {
      // 1. Validation (ffprobe)
      const media = await validateMediaFile(inputPath);
      await setProgress(videoId, {
        stage: 'SEGMENTING',
        progress: PROGRESS.segmentingStart,
        duration: media.duration,
        resolution: media.resolution,
        videoCodec: media.videoCodec
      });

      // 2. Lossless segmentation
      let lastReported = PROGRESS.segmentingStart;
      const segmentPaths = await sliceVideoIntoSegments({
        inputSource: inputPath,
        outputDir: workDir,
        totalDuration: media.duration,
        segmentSeconds: config.segmentSeconds,
        onProgress: (percent) => {
          const value = Math.round(PROGRESS.segmentingStart + (percent / 100) * (PROGRESS.segmentingEnd - PROGRESS.segmentingStart));
          if (value - lastReported >= 4) {
            lastReported = value;
            setProgress(videoId, { progress: value }).catch(() => {});
          }
        }
      });

      // 3. Store segments with their real start/end times (-c copy cuts on keyframes)
      const rows = [];
      let cursor = 0;
      for (const [i, segmentPath] of segmentPaths.entries()) {
        const info = await validateMediaFile(segmentPath).catch(() => null);
        const length = info?.duration || Math.min(config.segmentSeconds, media.duration - cursor);
        const storageKey = `${segmentsKeyPrefix}${path.basename(segmentPath)}`;
        await persistFile(segmentPath, storageKey);
        rows.push({ videoId, index: i + 1, startSec: cursor, endSec: Math.min(media.duration, cursor + length), storageKey });
        cursor += length;
      }
      await prisma.videoSegment.createMany({ data: rows });
      return { rows, duration: media.duration };
    });

    // 4. Per-segment AI analysis
    await setProgress(videoId, { stage: 'ANALYZING', progress: PROGRESS.segmentingEnd });
    const useGemini = isGeminiEnabled();
    const analyzed = [];
    let previousSummary = '';
    for (const row of segmentRows.rows) {
      const context = {
        index: row.index,
        total: segmentRows.rows.length,
        startSec: row.startSec,
        endSec: row.endSec,
        className: video.class?.name,
        subject: video.class?.subject,
        previousSummary
      };
      const review = useGemini
        ? await withLocalFile(row.storageKey, (segmentPath) => analyzeSegmentWithGemini(segmentPath, context))
        : stubAnalyzeSegment(context);
      const stored = { ...review, status: 'success', chunk_id: `segment_${String(row.index).padStart(3, '0')}`, provider: useGemini ? config.geminiModel : 'stub' };
      await prisma.videoSegment.update({ where: { videoId_index: { videoId, index: row.index } }, data: { review: stored } });
      analyzed.push({ ...row, review: stored });
      previousSummary = review.content_review?.summary || '';
      const progress = Math.round(PROGRESS.segmentingEnd + (analyzed.length / segmentRows.rows.length) * (PROGRESS.analyzingEnd - PROGRESS.segmentingEnd));
      await setProgress(videoId, { progress });
    }

    // 5. Lecture-level analytics
    const analysis = summarizeLecture(analyzed, segmentRows.duration);
    await prisma.$transaction([
      prisma.feedback.deleteMany({ where: { videoId } }),
      prisma.analytics.deleteMany({ where: { videoId } }),
      prisma.feedback.createMany({ data: analysis.feedback.map((item) => ({ ...item, videoId })) }),
      prisma.analytics.create({ data: { videoId, copusTimeline: analysis.copusTimeline, bloomsDistribution: analysis.bloomsDistribution } }),
      prisma.video.update({ where: { id: videoId }, data: { status: 'COMPLETED', stage: 'COMPLETED', progress: 100, processedAt: new Date(), error: null } })
    ]);
  } catch (error) {
    await prisma.video.update({ where: { id: videoId }, data: { status: 'FAILED', stage: 'FAILED', error: error.message.slice(0, 500) } }).catch(() => {});
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
