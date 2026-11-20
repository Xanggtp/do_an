import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { prisma } from '../config/prisma.js';
import { config } from '../config/env.js';
import { enqueueVideoProcessing } from '../queues/videoQueue.js';
import { createObjectKey, getObjectResponse, objectKeyFromFileUrl, persistUpload, removeObject, removePrefix, segmentPrefix } from '../storage/storage.js';
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
    include: { class: true, feedback: { orderBy: { timestamp: 'asc' } }, analytics: true, segments: { orderBy: { index: 'asc' } } }
  });
  if (!video) throw Object.assign(new Error('Video not found.'), { statusCode: 404 });
  return video;
}

function parseLectureDate(value) {
  if (!value) return new Date();
  const raw = String(value).trim();
  if (!raw) return new Date();
  // Anchor YYYY-MM-DD inputs at 12:00 UTC so local timezone conversions never shift the calendar day
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(candidate.getTime())) {
    throw Object.assign(new Error('Invalid lecture date.'), { statusCode: 400 });
  }
  return candidate;
}

function serializeVideo(video) {
  return {
    id: video.id,
    filename: video.filename,
    fileUrl: video.fileUrl,
    duration: video.duration,
    status: video.status,
    stage: video.stage,
    progress: video.progress,
    resolution: video.resolution,
    videoCodec: video.videoCodec,
    classId: video.classId,
    class: video.class ? { id: video.class.id, name: video.class.name, classCode: video.class.classCode, subject: video.class.subject, semester: video.class.semester } : undefined,
    lectureDate: video.lectureDate || video.createdAt,
    createdAt: video.createdAt,
    processedAt: video.processedAt
  };
}

function serializeSegment(segment) {
  return { index: segment.index, startSec: segment.startSec, endSec: segment.endSec, review: segment.review };
}

/**
 * Deletes videos (and their feedback, analytics, segments) in one transaction,
 * then removes the media files. Optionally deletes classes / a semester in the same transaction.
 */
async function deleteVideosCascade({ videoWhere, extraOperations = [] }) {
  const videos = await prisma.video.findMany({ where: videoWhere, select: { id: true, fileUrl: true } });
  const videoIds = videos.map((v) => v.id);
  await prisma.$transaction([
    prisma.feedback.deleteMany({ where: { videoId: { in: videoIds } } }),
    prisma.analytics.deleteMany({ where: { videoId: { in: videoIds } } }),
    prisma.videoSegment.deleteMany({ where: { videoId: { in: videoIds } } }),
    prisma.video.deleteMany({ where: { id: { in: videoIds } } }),
    ...extraOperations
  ]);
  for (const video of videos) {
    await removeObject(objectKeyFromFileUrl(video.fileUrl)).catch((error) => console.error(`Could not remove video file ${video.id}: ${error.message}`));
    await removePrefix(segmentPrefix(video.id)).catch((error) => console.error(`Could not remove segments of ${video.id}: ${error.message}`));
  }
}

function startProcessing(videoId) {
  processVideo(videoId).catch((error) => console.error(`Video ${videoId} processing failed: ${error.message}`));
}

const semesterPattern = /^\d{4}\.[123]$/;

/**
 * Older classes only stored the semester as a string. This links them to Semester records.
 * It runs on every GET /semesters, so it reads once and only writes when something is unlinked.
 */
async function syncLegacySemesters(teacher) {
  const [records, classes] = await Promise.all([
    prisma.semester.findMany({ where: { teacherId: teacher.id }, orderBy: { createdAt: 'asc' } }),
    prisma.class.findMany({ where: { teacherId: teacher.id }, select: { id: true, semester: true, semesterId: true } })
  ]);
  const unlinked = classes.filter((item) => !item.semesterId && semesterPattern.test(item.semester));
  if (!unlinked.length) return records;

  const byCode = new Map(records.map((item) => [item.code, item]));
  for (const code of new Set(unlinked.map((item) => item.semester))) {
    if (byCode.has(code)) continue;
    const created = await prisma.semester.create({ data: { code, teacherId: teacher.id } }).catch((error) => {
      if (error.code !== 'P2002') throw error;
      return prisma.semester.findFirst({ where: { teacherId: teacher.id, code } });
    });
    byCode.set(code, created);
  }
  for (const [code, semester] of byCode) {
    const ids = unlinked.filter((item) => item.semester === code).map((item) => item.id);
    if (ids.length) await prisma.class.updateMany({ where: { id: { in: ids } }, data: { semesterId: semester.id } });
  }
  return prisma.semester.findMany({ where: { teacherId: teacher.id }, orderBy: { createdAt: 'asc' } });
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

  await deleteVideosCascade({
    videoWhere: { classId },
    extraOperations: [prisma.class.delete({ where: { id: classId } })]
  });

  response.json({ message: 'Class deleted successfully.', id: classId });
}

export async function deleteSemester(request, response) {
  const teacher = await teacherForUser(request.user.id);
  const identifier = String(request.params.id || request.params.code || '').trim();
  if (!identifier) {
    return response.status(400).json({ message: 'Semester ID or code is required.' });
  }

  const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
  const semester = await prisma.semester.findFirst({
    where: {
      teacherId: teacher.id,
      OR: [
        ...(isObjectId ? [{ id: identifier }] : []),
        { code: identifier }
      ]
    }
  });

  if (!semester) {
    return response.status(404).json({ message: 'Semester not found.' });
  }

  const classes = await prisma.class.findMany({
    where: {
      teacherId: teacher.id,
      OR: [
        { semesterId: semester.id },
        { semester: semester.code }
      ]
    },
    select: { id: true }
  });

  const classIds = classes.map((c) => c.id);

  await deleteVideosCascade({
    videoWhere: { classId: { in: classIds } },
    extraOperations: [
      prisma.class.deleteMany({ where: { id: { in: classIds } } }),
      prisma.semester.delete({ where: { id: semester.id } })
    ]
  });

  response.json({ message: 'Semester deleted successfully.', id: semester.id, code: semester.code });
}

export async function uploadObservation(request, response) {
  if (!request.file) return response.status(400).json({ message: 'An MP4 video file is required.' });
  const teacher = await teacherForUser(request.user.id);
  const classId = String(request.body.classId || '');
  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacher.id } });
  if (!classRecord) return response.status(404).json({ message: 'Class not found.' });

  const lectureDate = parseLectureDate(request.body.lectureDate);
  const supportsLectureDate = Boolean(prisma._runtimeDataModel?.models?.Video?.fields?.some((field) => field.name === 'lectureDate'));
  const objectKey = createObjectKey(request.file.originalname);
  let video;
  try {
    const stored = await persistUpload(request.file, objectKey);
    video = await prisma.video.create({
      data: {
        filename: request.file.originalname,
        fileUrl: stored.fileUrl,
        classId,
        ...(supportsLectureDate ? { lectureDate } : { createdAt: lectureDate }),
        status: 'PROCESSING',
        stage: 'UPLOADED',
        progress: 0,
        sizeBytes: request.file.size
      }
    });
    if (config.workerMode === 'queue') await enqueueVideoProcessing(video.id);
    else startProcessing(video.id);
    response.status(202).json({ videoId: video.id, status: video.status, stage: video.stage });
  } catch (error) {
    await removeObject(objectKey).catch(() => {});
    if (video) await prisma.video.delete({ where: { id: video.id } }).catch(() => {});
    throw error;
  }
}

export async function getVideoStatus(request, response) {
  const video = await ownedVideo(request.params.videoId, request.user.id);
  response.json({
    videoId: video.id,
    status: video.status,
    stage: video.stage,
    progress: video.progress,
    duration: video.duration,
    resolution: video.resolution,
    videoCodec: video.videoCodec,
    error: video.error,
    segments: video.segments.map(serializeSegment)
  });
}

export async function getObservation(request, response) {
  const video = await ownedVideo(request.params.videoId, request.user.id);
  if (video.status !== 'COMPLETED') {
    return response.status(video.status === 'FAILED' ? 422 : 202).json({ videoId: video.id, status: video.status, stage: video.stage, progress: video.progress, error: video.error });
  }
  response.json({ video: serializeVideo(video), feedback: video.feedback, analytics: video.analytics, segments: video.segments.map(serializeSegment) });
}

export async function streamVideo(request, response) {
  const video = await ownedVideo(request.params.videoId, request.user.id);
  const object = await getObjectResponse(objectKeyFromFileUrl(video.fileUrl));
  if (object.url) return response.redirect(object.url);
  return response.sendFile(object.path);
}
export async function reprocessVideo(request, response) {
  const video = await ownedVideo(request.params.videoId, request.user.id);
  if (video.status === 'PROCESSING' && !['FAILED', 'COMPLETED'].includes(video.stage)) {
    return response.status(409).json({ message: 'This video is already being processed.' });
  }
  await prisma.video.update({ where: { id: video.id }, data: { status: 'PROCESSING', stage: 'UPLOADED', progress: 0, error: null } });
  if (config.workerMode === 'queue') await enqueueVideoProcessing(video.id, { force: true });
  else startProcessing(video.id);
  response.status(202).json({ videoId: video.id, status: 'PROCESSING', stage: 'UPLOADED' });
}

export async function deleteVideo(request, response) {
  const video = await ownedVideo(request.params.videoId, request.user.id);
  await deleteVideosCascade({ videoWhere: { id: video.id } });
  response.json({ message: 'Video deleted successfully.', id: video.id });
}

export async function getClassVideos(request, response) {
  const teacher = await teacherForUser(request.user.id);
  const classId = String(request.params.id || '');
  if (!/^[0-9a-fA-F]{24}$/.test(classId)) return response.status(404).json({ message: 'Class not found.' });
  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacher.id } });
  if (!classRecord) return response.status(404).json({ message: 'Class not found.' });
  const videos = await prisma.video.findMany({
    where: { classId },
    orderBy: { createdAt: 'desc' },
    include: { segments: { where: { index: 1 }, select: { review: true } } }
  });
  videos.sort((a, b) => new Date(b.lectureDate || b.createdAt) - new Date(a.lectureDate || a.createdAt));
  response.json({
    videos: videos.map((video) => ({
      ...serializeVideo(video),
      error: video.error,
      summary: video.segments[0]?.review?.content_review?.summary || null
    }))
  });
}
