import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config/env.js';
import { cookieName } from '../utils/auth.js';

export async function requireAuth(request, response, next) {
  try {
    const token = request.cookies[cookieName];
    if (!token) return response.status(401).json({ message: 'Authentication required.' });

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.userId);
    if (!user) return response.status(401).json({ message: 'Authentication required.' });

    request.user = user;
    next();
  } catch {
    response.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}
