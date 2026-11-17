import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.js';

const s3 = config.uploadProvider === 's3' ? new S3Client({ region: config.s3Region }) : null;

function safeExtension(filename) {
  const extension = path.extname(filename).toLowerCase();
  return extension === '.mp4' ? extension : '.mp4';
}

function localPath(objectKey) {
  const root = path.resolve(config.uploadDirectory);
  const resolved = path.resolve(root, objectKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw Object.assign(new Error('Invalid storage key.'), { statusCode: 400 });
  }
  return resolved;
}

export function createObjectKey(filename) {
  return `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${safeExtension(filename)}`;
}

export function segmentPrefix(videoId) {
  return `segments/${videoId}/`;
}

/** Video.fileUrl historically held either a storage key or a /api/videos/media/<key> URL. */
export function objectKeyFromFileUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  return fileUrl.startsWith('/api/videos/media/') ? decodeURIComponent(fileUrl.split('/').pop()) : fileUrl;
}

async function moveFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.copyFile(source, destination);
    await fs.rm(source, { force: true });
  }
}

/** Stores a local file under objectKey. The source file is moved (local) or uploaded as a stream (S3). */
export async function persistFile(sourcePath, objectKey, contentType = 'video/mp4') {
  if (config.uploadProvider === 'local') {
    await moveFile(sourcePath, localPath(objectKey));
    return { fileUrl: objectKey, storageKey: objectKey };
  }

  const { size } = await fs.stat(sourcePath);
  await s3.send(new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: objectKey,
    Body: createReadStream(sourcePath),
    ContentLength: size,
    ContentType: contentType
  }));
  await fs.rm(sourcePath, { force: true });
  return { fileUrl: objectKey, storageKey: objectKey };
}

export async function persistUpload(file, objectKey) {
  return persistFile(file.path, objectKey, file.mimetype || 'video/mp4');
}

export async function removeObject(objectKey) {
  if (!objectKey) return;
  if (config.uploadProvider === 'local') {
    await fs.rm(localPath(objectKey), { force: true });
    return;
  }
  await s3.send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: objectKey }));
}

/** Removes every object whose key starts with prefix (e.g. all segments of a video). */
export async function removePrefix(prefix) {
  if (!prefix) return;
  if (config.uploadProvider === 'local') {
    await fs.rm(localPath(prefix), { recursive: true, force: true });
    return;
  }
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: config.s3Bucket, Prefix: prefix, ContinuationToken: token }));
    const objects = (page.Contents || []).map((item) => ({ Key: item.Key }));
    if (objects.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: config.s3Bucket, Delete: { Objects: objects, Quiet: true } }));
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

/**
 * Gives `task` a local filesystem path for objectKey. For S3 the object is downloaded
 * to a temp file first and removed afterwards.
 */
export async function withLocalFile(objectKey, task) {
  if (config.uploadProvider === 'local') return task(localPath(objectKey));

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'classmind-'));
  const tempPath = path.join(tempDir, path.basename(objectKey));
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: objectKey }));
    await pipeline(object.Body, createWriteStream(tempPath));
    return await task(tempPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function getObjectResponse(objectKey) {
  if (config.uploadProvider === 'local') {
    return { path: localPath(objectKey) };
  }
  return { url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: config.s3Bucket, Key: objectKey }), { expiresIn: 900 }) };
}
