import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';

const windowMs = 15 * 60 * 1000;

function limiter(limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !config.rateLimitEnabled,
    handler: (request, response) => response.status(429).json({ message })
  });
}

// Login / register: slows down password guessing per IP.
export const authLimiter = limiter(config.authRateLimit, 'Too many attempts. Please wait a few minutes and try again.');

// Password recovery: security answers are short, so this limit is stricter.
export const recoveryLimiter = limiter(config.recoveryRateLimit, 'Too many password recovery attempts. Please wait 15 minutes and try again.');
