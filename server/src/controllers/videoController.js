import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { prisma } from '../config/prisma.js';
import { config } from '../config/env.js';
import { enqueueVideoProcessing } from '../queues/videoQueue.js';
import { createObjectKey, getObjectResponse, persistUpload, removeObject } from '../storage/storage.js';
import { processVideo } from '../workers/aiProcessor.js';

const stagingDirectory = path.resolve(config.uploadDirectory, '.staging');
await fs.promises.mkdir(stagingDirectory, { recursive: true });

export const uploadVideo = multer({
  dest: stagingDirectory,
  limits: { fileSize: config.maxVideoBytes },
  fileFilter: (request, file, callback) => {
    if (file.mimetype === 'video/mp4' || path.extname(file.originalname).toLowerCase() === '.mp4') return callback(null, true);
    callback(Object.assign(new Error('Only MP4 video files are supported.'), { statusCode: 400 }));
  }
}).single('video');

async function teacherForUser(userId) {
  const teacher = await prisma.teacher.findUnique({ where: { userId } });
  if (!teacher) throw Object.assign(new Error('Teacher profile not found.'), { statusCode: 404 });
  return teacher;
}

async function ownedVideo(videoId, userId) {
  const teacher = await teacherForUser(userId);
  const video = await prisma.video.findFirst({
    where: { id: videoId, class: { teacherId: teacher.id } },
    include: { class: true, feedback: { orderBy: { timestamp: 'asc' } }, analytics: true }
  });
  if (!video) throw Object.assign(new Error('Video not found.'), { statusCode: 404 });
  return video;
}

function serializeVideo(video) {
  return {
    id: video.id,
    filename: video.filename,
    fileUrl: video.fileUrl,
    duration: video.duration,
    status: video.status,
    classId: video.classId,
    createdAt: video.createdAt,
    processedAt: video.processedAt
  };
}

export async function getDashboard(request, response) {
  const teacher = await teacherForUser(request.user.id);
  if (request.params.teacherId !== teacher.id) throw Object.assign(new Error('Teacher not found.'), { statusCode: 404 });
  const user = await prisma.user.findUnique({ where: { id: request.user.id } });
  const classes = await prisma.class.findMany({
    where: { teacherId: teacher.id },
    orderBy: { createdAt: 'asc' },
    include: { videos: { orderBy: { createdAt: 'desc' }, take: 10 } }
  });
  response.json({ teacher: { id: teacher.id, name: user.name, email: user.email }, classes });
}

export async function createClass(request, response) {
  const teacher = await teacherForUser(request.user.id);
  const name = String(request.body.name || '').trim();
  const subject = String(request.body.subject || '').trim();
  const gradeLevel = String(request.body.gradeLevel || '').trim();
  if (!name || !subject || !gradeLevel) return response.status(400).json({ message: 'Name, subject, and grade level are required.' });
  const record = await prisma.class.create({ data: { name, subject, gradeLevel, teacherId: teacher.id } });
  response.status(201).json({ class: record });
}

export async function uploadObservation(request, response) {
  if (!request.file) return response.status(400).json({ message: 'An MP4 video file is required.' });
  const teacher = await teacherForUser(request.user.id);
  const classId = String(request.body.classId || '');
  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacher.id } });
  if (!classRecord) return response.status(404).json({ message: 'Class not found.' });

  const objectKey = createObjectKey(request.file.originalname);
  let video;
  try {
    const stored = await persistUpload(request.file, objectKey);
    video = await prisma.video.create({ data: { filename: request.file.originalname, fileUrl: stored.fileUrl, classId, status: 'PENDING' } });
    video = await prisma.video.update({ where: { id: video.id }, data: { status: 'PROCESSING' } });
    if (config.workerMode === 'queue') await enqueueVideoProcessing(video.id);
    else void processVideo(video.id);
    response.status(202).json({ videoId: video.id, status: video.status });
  } catch (error) {
    await removeObject(objectKey).catch(() => {});
    if (video) await prisma.video.delete({ where: { id: video.id } }).catch(() => {});
    throw error;
  }
}

export async function getVideoStatus(request, response) {
  const video = await ownedVideo(request.params.videoId, request.user.id);
  response.json({ videoId: video.id, status: video.status, duration: video.duration, error: video.error });
}

export async function getObservation(request, response) {
  const video = await ownedVideo(request.params.videoId, request.user.id);
  if (video.status !== 'COMPLETED') return response.status(video.status === 'FAILED' ? 422 : 202).json({ videoId: video.id, status: video.status, error: video.error });
  response.json({ video: serializeVideo(video), feedback: video.feedback, analytics: video.analytics });
}

export async function streamVideo(request, response) {
  const video = await ownedVideo(request.params.videoId, request.user.id);
  const objectKey = video.fileUrl.startsWith('/api/videos/media/') ? decodeURIComponent(video.fileUrl.split('/').pop()) : video.fileUrl;
  const object = await getObjectResponse(objectKey);
  if (object.url) return response.redirect(object.url);
  return response.sendFile(object.path);
}