import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env.js';

export const videoQueueName = 'classmind-video-processing';
export const redisConnection = config.workerMode === 'queue' ? new IORedis(config.redisUrl, { maxRetriesPerRequest: null }) : null;
export const videoQueue = redisConnection ? new Queue(videoQueueName, { connection: redisConnection }) : null;

export async function enqueueVideoProcessing(videoId, { force = false } = {}) {
  if (!videoQueue) throw Object.assign(new Error('Video queue is not configured.'), { statusCode: 503 });
  const jobId = `video-${videoId}`;
  // A finished job with the same id would block re-adding it (e.g. reprocessing a failed video)
  if (force) await videoQueue.remove(jobId).catch(() => {});
  await videoQueue.add('process-video', { videoId }, {
    jobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 100
  });
}