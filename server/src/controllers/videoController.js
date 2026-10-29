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

const semesterPattern = /^\d{4}\.[123]$/;

async function syncLegacySemesters(teacher) {
  const [records, legacyClasses] = await Promise.all([
    prisma.semester.findMany({ where: { teacherId: teacher.id }, orderBy: { createdAt: 'asc' } }),
    prisma.class.findMany({ where: { teacherId: teacher.id }, select: { semester: true } })
  ]);
  const knownCodes = new Set(records.map((item) => item.code));
  const legacyCodes = [...new Set(legacyClasses.map((item) => item.semester))]
    .filter((code) => semesterPattern.test(code) && !knownCodes.has(code));
  if (legacyCodes.length) {
    await Promise.all(legacyCodes.map((code) => prisma.semester.create({ data: { code, teacherId: teacher.id } }).catch((error) => {
      if (error.code !== 'P2002') throw error;
      return null;
    })));
  }
  const allSemesters = await prisma.semester.findMany({ where: { teacherId: teacher.id }, orderBy: { createdAt: 'asc' } });
  for (const sem of allSemesters) {
    await prisma.class.updateMany({
      where: { teacherId: teacher.id, semester: sem.code, semesterId: null },
      data: { semesterId: sem.id }
    });
  }
  return allSemesters;
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
  const classCode = String(request.body.classCode || '').trim();
  const subject = String(request.body.subject || '').trim();
  const semester = String(request.body.semester || '').trim();
  if (!name || !classCode || !subject || !semesterPattern.test(semester)) {
    return response.status(400).json({ message: 'Class, class ID, subject, and a valid semester (YYYY.1, YYYY.2, or YYYY.3) are required.' });
  }
  const semesterRecord = await prisma.semester.findFirst({ where: { teacherId: teacher.id, code: semester } });
  if (!semesterRecord) return response.status(404).json({ message: 'Create the semester before adding classes to it.' });
  const existing = await prisma.class.findFirst({
    where: { teacherId: teacher.id, semester, OR: [{ name }, { classCode }] }
  });
  if (existing) return response.status(409).json({ message: 'The class name or class ID already exists in the selected semester.' });
  const record = await prisma.class.create({ data: { name, classCode, subject, semester, semesterId: semesterRecord.id, teacherId: teacher.id } });
  response.status(201).json({ class: record });
}

export async function getSemesters(request, response) {
  const teacher = await teacherForUser(request.user.id);
  const semesters = await syncLegacySemesters(teacher);
  response.json({ semesters });
}

export async function createSemester(request, response) {
  const teacher = await teacherForUser(request.user.id);
  const code = String(request.body.code || '').trim();
  if (!semesterPattern.test(code)) return response.status(400).json({ message: 'Use a semester code in YYYY.1, YYYY.2, or YYYY.3 format.' });
  const existing = await prisma.semester.findFirst({ where: { teacherId: teacher.id, code } });
  if (existing) return response.status(409).json({ message: 'This semester already exists.' });
  const semester = await prisma.semester.create({ data: { code, teacherId: teacher.id } });
  response.status(201).json({ semester });
}

export async function getClasses(request, response) {
  const teacher = await teacherForUser(request.user.id);
  const semester = String(request.query.semester || '').trim();
  if (!semester) {
    const classes = await prisma.class.findMany({
      where: { teacherId: teacher.id },
      orderBy: { createdAt: 'asc' }
    });
    return response.json({ classes });
  }
  if (!semesterPattern.test(semester)) {
    return response.status(400).json({ message: 'A valid semester (YYYY.1, YYYY.2, or YYYY.3) is required.' });
  }
  const semesterRecord = await prisma.semester.findFirst({ where: { teacherId: teacher.id, code: semester } });
  if (!semesterRecord) return response.status(404).json({ message: 'Semester not found.' });
  const classes = await prisma.class.findMany({
    where: { teacherId: teacher.id, semester },
    orderBy: { createdAt: 'asc' }
  });
  response.json({ classes });
}

export async function updateClass(request, response) {
  const teacher = await teacherForUser(request.user.id);
  const classId = request.params.id || request.params.classId;
  if (!classId || !/^[0-9a-fA-F]{24}$/.test(classId)) {
    return response.status(404).json({ message: 'Class not found.' });
  }
  const existing = await prisma.class.findFirst({
    where: { id: classId, teacherId: teacher.id }
  });
  if (!existing) {
    return response.status(404).json({ message: 'Class not found.' });
  }

  const name = request.body.name !== undefined ? String(request.body.name || '').trim() : existing.name;
  const classCode = request.body.classCode !== undefined ? String(request.body.classCode || '').trim() : existing.classCode;
  const subject = request.body.subject !== undefined ? String(request.body.subject || '').trim() : existing.subject;
  const semester = request.body.semester !== undefined ? String(request.body.semester || '').trim() : existing.semester;

  if (!name || !classCode || !subject || !semesterPattern.test(semester)) {
    return response.status(400).json({ message: 'Class, class ID, subject, and a valid semester (YYYY.1, YYYY.2, or YYYY.3) are required.' });
  }

  const semesterRecord = await prisma.semester.findFirst({ where: { teacherId: teacher.id, code: semester } });
  if (!semesterRecord) return response.status(404).json({ message: 'Create the semester before adding classes to it.' });

  const duplicate = await prisma.class.findFirst({
    where: {
      teacherId: teacher.id,
      semester,
      id: { not: classId },
      OR: [{ name }, { classCode }]
    }
  });
  if (duplicate) {
    return response.status(409).json({ message: 'The class name or class ID already exists in the selected semester.' });
  }

  const updated = await prisma.class.update({
    where: { id: classId },
    data: {
      name,
      classCode,
      subject,
      semester,
      semesterId: semesterRecord.id
    }
  });
  response.json({ class: updated });
}

export async function deleteClass(request, response) {
  const teacher = await teacherForUser(request.user.id);
  const classId = request.params.id || request.params.classId;
  if (!classId || !/^[0-9a-fA-F]{24}$/.test(classId)) {
    return response.status(404).json({ message: 'Class not found.' });
  }
  const existing = await prisma.class.findFirst({
    where: { id: classId, teacherId: teacher.id }
  });
  if (!existing) {
    return response.status(404).json({ message: 'Class not found.' });
  }

  const videos = await prisma.video.findMany({ where: { classId }, select: { id: true, fileUrl: true } });
  for (const v of videos) {
    if (v.fileUrl && typeof v.fileUrl === 'string') {
      const objectKey = v.fileUrl.startsWith('/api/videos/media/') ? decodeURIComponent(v.fileUrl.split('/').pop()) : v.fileUrl;
      await removeObject(objectKey).catch(() => {});
    }
    await prisma.feedback.deleteMany({ where: { videoId: v.id } }).catch(() => {});
    await prisma.analytics.deleteMany({ where: { videoId: v.id } }).catch(() => {});
  }
  await prisma.video.deleteMany({ where: { classId } }).catch(() => {});
  await prisma.class.delete({ where: { id: classId } });

  response.json({ message: 'Class deleted successfully.', id: classId });
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