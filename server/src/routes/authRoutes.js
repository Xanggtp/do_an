import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, recoveryLimiter } from '../middleware/rateLimit.js';
import {
  changePassword,
  currentUser,
  getSecurityQuestion,
  login,
  logout,
  register,
  resetPassword
} from '../controllers/authController.js';

const router = Router();
router.post('/register', authLimiter, asyncHandler(register));
router.post('/login', authLimiter, asyncHandler(login));
router.post('/logout', logout);
router.get('/me', requireAuth, currentUser);
router.post('/change-password', requireAuth, authLimiter, asyncHandler(changePassword));
router.post('/forgot-password/question', recoveryLimiter, asyncHandler(getSecurityQuestion));
router.post('/forgot-password/reset', recoveryLimiter, asyncHandler(resetPassword));

export default router;
