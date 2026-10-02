import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

function normalizeDatabaseUrl(value) {
  if (!value) return value;
  const url = new URL(value);
  if (url.protocol === 'mongodb:' || url.protocol === 'mongodb+srv:') {
    if (!url.pathname || url.pathname === '/') url.pathname = '/account_dashboard';
  }
  return url.toString();
}

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || process.env.MONGODB_URI);
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const required = ['JWT_SECRET', 'DATABASE_URL'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 5000),
  databaseUrl,
  jwtSecret: process.env.JWT_SECRET,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  uploadProvider: process.env.UPLOAD_PROVIDER || 'local',
  uploadDirectory: process.env.UPLOAD_DIRECTORY || './uploads',
  maxVideoBytes: Number(process.env.MAX_VIDEO_BYTES || 2 * 1024 * 1024 * 1024),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  workerMode: process.env.WORKER_MODE || 'stub',
  s3Bucket: process.env.S3_BUCKET,
  s3Region: process.env.S3_REGION || 'us-east-1'
};

if (!['local', 's3'].includes(config.uploadProvider)) throw new Error('UPLOAD_PROVIDER must be local or s3.');
if (!['stub', 'inline', 'queue'].includes(config.workerMode)) throw new Error('WORKER_MODE must be stub, inline, or queue.');
if (config.uploadProvider === 's3' && !config.s3Bucket) throw new Error('S3_BUCKET is required when UPLOAD_PROVIDER=s3.');
if (config.workerMode === 'queue' && !process.env.REDIS_URL) throw new Error('REDIS_URL is required when WORKER_MODE=queue.');
