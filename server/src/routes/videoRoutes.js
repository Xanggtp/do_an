import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getReportsOverview } from '../controllers/reportController.js';
import {
  createClass,
  createSemester,
  deleteClass,
  deleteSemester,
  deleteVideo,
  getClasses,
  getClassVideos,
  getSemesters,
  getDashboard,
  getObservation,
  getVideoStatus,
  reprocessVideo,
  streamVideo,
  updateClass,
  uploadObservation,
  uploadVideo
} from '../controllers/videoController.js';

const router = Router();
router.use(requireAuth);
router.get('/teachers/:teacherId/dashboard', asyncHandler(getDashboard));
router.post('/classes', asyncHandler(createClass));
router.get('/classes', asyncHandler(getClasses));
router.put('/classes/:id', asyncHandler(updateClass));
router.delete('/classes/:id', asyncHandler(deleteClass));
router.get('/classes/:id/videos', asyncHandler(getClassVideos));
router.get('/semesters', asyncHandler(getSemesters));
router.get('/reports/overview', asyncHandler(getReportsOverview));
router.post('/semesters', asyncHandler(createSemester));
router.delete('/semesters/:id', asyncHandler(deleteSemester));
router.post('/videos/upload', uploadVideo, asyncHandler(uploadObservation));
router.post('/videos', uploadVideo, asyncHandler(uploadObservation));
router.get('/videos/:videoId/status', asyncHandler(getVideoStatus));
router.get('/videos/:videoId/observation', asyncHandler(getObservation));
router.get('/videos/:videoId/media', asyncHandler(streamVideo));
router.post('/videos/:videoId/reprocess', asyncHandler(reprocessVideo));
router.delete('/videos/:videoId', asyncHandler(deleteVideo));

export default router;
