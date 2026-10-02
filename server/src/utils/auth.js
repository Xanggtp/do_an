import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export const cookieName = 'account_dashboard_token';

export function createToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '7d' });
}

export function setAuthCookie(response, token) {
  response.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(response) {
  response.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: config.nodeEnv === 'production' });
}

export function safeUser(user) {
  return {
    id: String(user.id ?? user._id),
    name: user.name,
    email: user.email,
    bio: user.bio,
    securityQuestion: user.securityQuestion,
    createdAt: user.createdAt
  };
}
