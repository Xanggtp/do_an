import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
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
router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/logout', logout);
router.get('/me', requireAuth, currentUser);
router.post('/change-password', requireAuth, asyncHandler(changePassword));
router.post('/forgot-password/question', asyncHandler(getSecurityQuestion));
router.post('/forgot-password/reset', asyncHandler(resetPassword));

export default router;
