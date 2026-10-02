import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createClass,
  getDashboard,
  getObservation,
  getVideoStatus,
  streamVideo,
  uploadObservation,
  uploadVideo
} from '../controllers/videoController.js';

const router = Router();
router.use(requireAuth);
router.get('/teachers/:teacherId/dashboard', asyncHandler(getDashboard));
router.post('/classes', asyncHandler(createClass));
router.post('/videos/upload', uploadVideo, asyncHandler(uploadObservation));
router.post('/videos', uploadVideo, asyncHandler(uploadObservation));
router.get('/videos/:videoId/status', asyncHandler(getVideoStatus));
router.get('/videos/:videoId/observation', asyncHandler(getObservation));
router.get('/videos/:videoId/media', asyncHandler(streamVideo));

export default router;