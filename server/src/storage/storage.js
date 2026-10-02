import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.js';

const s3 = config.uploadProvider === 's3' ? new S3Client({ region: config.s3Region }) : null;

function safeExtension(filename) {
  const extension = path.extname(filename).toLowerCase();
  return extension === '.mp4' ? extension : '.mp4';
}

export function createObjectKey(filename) {
  return `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${safeExtension(filename)}`;
}

export async function persistUpload(file, objectKey) {
  if (config.uploadProvider === 'local') {
    const destination = path.resolve(config.uploadDirectory, objectKey);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(file.path, destination);
    await fs.rm(file.path, { force: true });
    return { fileUrl: objectKey, storageKey: objectKey };
  }

  await s3.send(new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: objectKey,
    Body: await fs.readFile(file.path),
    ContentType: file.mimetype
  }));
  await fs.rm(file.path, { force: true });
  return { fileUrl: objectKey, storageKey: objectKey };
}

export async function removeObject(objectKey) {
  if (!objectKey) return;
  if (config.uploadProvider === 'local') {
    await fs.rm(path.resolve(config.uploadDirectory, objectKey), { force: true });
    return;
  }
  await s3.send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: objectKey }));
}

export async function getObjectResponse(objectKey) {
  if (config.uploadProvider === 'local') {
    return { path: path.resolve(config.uploadDirectory, objectKey) };
  }
  return { url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: config.s3Bucket, Key: objectKey }), { expiresIn: 900 }) };
}