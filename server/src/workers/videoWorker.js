import { Worker } from 'bullmq';
import { config } from '../config/env.js';
import { disconnectDatabase } from '../config/prisma.js';
import { processVideo } from './aiProcessor.js';
import { redisConnection, videoQueueName } from '../queues/videoQueue.js';

if (config.workerMode !== 'queue') {
  console.log(`Worker not started because WORKER_MODE=${config.workerMode}.`);
  await disconnectDatabase();
  process.exit(0);
}

const worker = new Worker(videoQueueName, async (job) => processVideo(job.data.videoId), { connection: redisConnection, concurrency: 1 });
worker.on('completed', (job) => console.log(`Video ${job.data.videoId} processed.`));
worker.on('failed', (job, error) => console.error(`Video ${job?.data.videoId || 'unknown'} failed: ${error.message}`));

async function shutdown() {
  await worker.close();
  await redisConnection.quit();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);