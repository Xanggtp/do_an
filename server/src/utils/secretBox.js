import crypto from 'node:crypto';
import { config } from '../config/env.js';

// AES-256-GCM for small secrets stored in the database (e.g. a teacher's Gemini API key).
// Key: SETTINGS_ENCRYPTION_KEY (any string) or, if unset, derived from JWT_SECRET.
// Changing that value makes stored secrets unreadable; users then simply re-enter their key.
const key = crypto.createHash('sha256').update(`classmind-settings:${config.settingsEncryptionKey || config.jwtSecret}`).digest();
const VERSION = 'v1';

export function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

/** Returns the plain text, or null when the value is missing or cannot be decrypted with the current key. */
export function decryptSecret(stored) {
  if (!stored) return null;
  try {
    const [version, iv, tag, data] = stored.split(':');
    if (version !== VERSION) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
