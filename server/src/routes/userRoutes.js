import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { deleteAiKey, getAiSettings, getProfile, updateAiSettings, updateProfile } from '../controllers/userController.js';

const router = Router();
router.use(requireAuth);
router.get('/profile', getProfile);
router.patch('/profile', asyncHandler(updateProfile));
router.get('/ai-settings', getAiSettings);
// Saving a key calls Google to verify it, so it shares the auth rate limit.
router.put('/ai-settings', authLimiter, asyncHandler(updateAiSettings));
router.delete('/ai-settings/key', asyncHandler(deleteAiKey));

export default router;
