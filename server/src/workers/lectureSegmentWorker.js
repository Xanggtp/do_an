import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';

// Optional: Configure custom ffmpeg / ffprobe binaries from environment variables
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}
if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
}

/**
 * Parses FFmpeg timemark strings (HH:MM:SS.ms) into total seconds.
 * @param {string} timemark
 * @returns {number}
 */
function parseTimemark(timemark) {
  if (!timemark || typeof timemark !== 'string') return 0;
  const parts = timemark.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Step 1: Validation
 * Uses ffprobe to verify that the file exists, is accessible, has valid streams,
 * and is not corrupted. Throws descriptive error if validation fails.
 *
 * @param {string} inputSource - Local file path or HTTP/HTTPS URL
 * @returns {Promise<{duration: number, resolution: string, videoCodec: string, formatName: string}>}
 */
export async function validateMediaFile(inputSource) {
  // Check local file accessibility if not a remote URL
  const isRemote = /^https?:\/\//i.test(inputSource);
  if (!isRemote) {
    const resolvedPath = path.resolve(inputSource);
    try {
      await fs.promises.access(resolvedPath, fs.constants.R_OK);
    } catch {
      throw new Error(`Validation failed: Local file "${resolvedPath}" does not exist or is not readable.`);
    }
  }

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputSource, (err, metadata) => {
      if (err) {
        return reject(
          new Error(`Validation failed: Media file is inaccessible or corrupted. ffprobe error: ${err.message}`)
        );
      }

      if (!metadata || !metadata.format || !metadata.streams || metadata.streams.length === 0) {
        return reject(
          new Error('Validation failed: Media file contains no valid format or stream data.')
        );
      }

      const duration = Number(metadata.format.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        return reject(
          new Error(`Validation failed: Invalid or missing media duration (${metadata.format.duration}).`)
        );
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) {
        return reject(
          new Error('Validation failed: No video stream found in media file.')
        );
      }

      resolve({
        duration,
        resolution: videoStream.width && videoStream.height ? `${videoStream.width}x${videoStream.height}` : 'unknown',
        videoCodec: videoStream.codec_name || 'unknown',
        formatName: metadata.format.format_name || 'unknown'
      });
    });
  });
}

/**
 * Step 2: Segmentation
 * Slices the video into exactly 2-minute (120-second) MP4 segments without
 * re-encoding (-c copy), named sequentially (segment_001.mp4, segment_002.mp4, ...).
 *
 * @param {object} params
 * @param {string} params.inputSource - Local path or URL
 * @param {string} params.outputDir - Target directory for segments
 * @param {number} params.totalDuration - Total video duration in seconds
 * @param {import('bullmq').Job} [params.job] - BullMQ job instance for logging/progress
 * @returns {Promise<string[]>} Array of absolute paths to generated segment files
 */
export async function sliceVideoIntoSegments({ inputSource, outputDir, totalDuration, job }) {
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPattern = path.join(outputDir, 'segment_%03d.mp4');

  await new Promise((resolve, reject) => {
    const command = ffmpeg(inputSource)
      .outputOptions([
        '-c copy',                 // Stream copy (fast, zero quality loss, no re-encoding)
        '-f segment',              // Segment muxer
        '-segment_time 120',       // 120-second (2 minutes) chunks
        '-reset_timestamps 1',     // Reset timestamps so each segment starts at 00:00:00
        '-segment_start_number 1'  // Start numbering at 1 (segment_001.mp4)
      ])
      .output(outputPattern)
      .on('start', (commandLine) => {
        if (job) job.log(`[FFmpeg] Process started: ${commandLine}`);
      })
      .on('progress', (progress) => {
        if (!job) return;
        let segmentProgress = null;

        if (typeof progress.percent === 'number' && !Number.isNaN(progress.percent) && progress.percent > 0) {
          segmentProgress = progress.percent;
        } else if (progress.timemark && totalDuration > 0) {
          const currentSeconds = parseTimemark(progress.timemark);
          segmentProgress = Math.min(100, (currentSeconds / totalDuration) * 100);
        }

        if (segmentProgress !== null) {
          // Scale segmentation phase from 20% to 90% overall BullMQ job progress
          const overallProgress = Math.min(90, Math.max(20, Math.round(20 + segmentProgress * 0.7)));
          job.updateProgress(overallProgress).catch(() => {});
        }
      })
      .on('error', (err, stdout, stderr) => {
        const errorDetails = stderr ? ` | FFmpeg stderr: ${stderr.slice(-400)}` : '';
        const message = `Segmentation failed: ${err.message}${errorDetails}`;
        if (job) job.log(`[FFmpeg Error] ${message}`);
        reject(new Error(message));
      })
      .on('end', () => {
        if (job) job.log('[FFmpeg] Segmentation completed successfully.');
        resolve();
      });

    command.run();
  });

  // Verify and collect created segment files
  const directoryEntries = await fs.promises.readdir(outputDir);
  const segmentFiles = directoryEntries
    .filter((file) => /^segment_\d+\.mp4$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (segmentFiles.length === 0) {
    throw new Error(`Segmentation finished but no segment files were found in "${outputDir}".`);
  }

  const verifiedPaths = [];
  for (const fileName of segmentFiles) {
    const fullPath = path.resolve(outputDir, fileName);
    const stat = await fs.promises.stat(fullPath);
    if (stat.size === 0) {
      throw new Error(`Validation error: Generated segment is 0 bytes: ${fullPath}`);
    }
    verifiedPaths.push(fullPath);
  }

  return verifiedPaths;
}

/**
 * BullMQ Job Processor
 * Orchestrates validation, segmentation, progress tracking, and returns segment paths.
 *
 * @param {import('bullmq').Job} job
 * @returns {Promise<string[]>} Array of local file paths for generated segments
 */
export async function processLectureJob(job) {
  const inputSource = job.data?.filePath || job.data?.inputPath || job.data?.url || job.data?.fileUrl;

  if (!inputSource) {
    throw new Error('Invalid job payload: Missing video path or URL. Expected "filePath", "inputPath", "url", or "fileUrl".');
  }

  const baseOutputDir = job.data?.outputDir || path.resolve('./uploads/segments');
  const jobOutputDir = path.join(baseOutputDir, `job_${job.id || Date.now()}`);

  await job.log(`[Job ${job.id}] Initialized processing for: ${inputSource}`);
  await job.updateProgress(5);

  try {
    // 1. Validation step
    await job.log(`[Job ${job.id}] Step 1/3: Validating media integrity via ffprobe...`);
    const mediaInfo = await validateMediaFile(inputSource);
    await job.log(
      `[Job ${job.id}] Validation passed. Duration: ${mediaInfo.duration.toFixed(1)}s, Codec: ${mediaInfo.videoCodec}, Resolution: ${mediaInfo.resolution}`
    );
    await job.updateProgress(20);

    // 2. Segmentation step
    await job.log(`[Job ${job.id}] Step 2/3: Slicing video into 120s segments (-c copy)...`);
    const segmentPaths = await sliceVideoIntoSegments({
      inputSource,
      outputDir: jobOutputDir,
      totalDuration: mediaInfo.duration,
      job
    });
    await job.updateProgress(95);

    // 3. Return array of local file paths for the next job / GPT-4o Vision step
    await job.log(`[Job ${job.id}] Step 3/3: Completed. Generated ${segmentPaths.length} segment(s).`);
    await job.updateProgress(100);

    return segmentPaths;
  } catch (err) {
    await job.log(`[Job ${job.id} FAILED] ${err.message}`);
    // Optional: Clean up partial segment directory on failure if desired
    try {
      await fs.promises.rm(jobOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
    throw err; // Re-throw to allow BullMQ to handle retries and mark the job as failed
  }
}

/**
 * Creates and starts the BullMQ Worker instance.
 *
 * @param {object} [config]
 * @param {string} [config.queueName='lecture-segmentation']
 * @param {object} [config.connection] - Redis connection options or IORedis instance
 * @param {number} [config.concurrency=2]
 * @returns {Worker}
 */
export function createLectureSegmentWorker(config = {}) {
  const queueName = config.queueName || 'lecture-segmentation';
  const connection = config.connection || {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null
  };

  const worker = new Worker(queueName, processLectureJob, {
    connection,
    concurrency: config.concurrency || 2,
    lockDuration: 300000 // 5 minutes lock duration for long-running video tasks
  });

  worker.on('active', (job) => {
    console.log(`[Worker] Started job ${job.id}`);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[Worker] Job ${job.id} progress: ${progress}%`);
  });

  worker.on('completed', (job, result) => {
    console.log(`[Worker] Job ${job.id} completed successfully with ${result.length} segments.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id || 'unknown'} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error('[Worker] Fatal queue/connection error:', err);
  });

  return worker;
}

// Optional auto-start if run directly: node src/workers/lectureSegmentWorker.js
const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFilePath)) {
  console.log('[Worker] Launching lecture segmentation worker...');
  const worker = createLectureSegmentWorker();

  const handleShutdown = async (signal) => {
    console.log(`\n[Worker] Received ${signal}. Closing gracefully...`);
    await worker.close();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}
