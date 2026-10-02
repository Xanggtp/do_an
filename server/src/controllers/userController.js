import { prisma } from '../config/prisma.js';
import { safeUser } from '../utils/auth.js';

export function getProfile(request, response) {
  response.json({ user: safeUser(request.user) });
}

export async function updateProfile(request, response) {
  const updates = {};
  if (request.body.name !== undefined) {
    const name = String(request.body.name).trim();
    if (name.length < 2 || name.length > 80) return response.status(400).json({ message: 'Name must be between 2 and 80 characters.' });
    updates.name = name;
  }
  if (request.body.bio !== undefined) {
    const bio = String(request.body.bio).trim();
    if (bio.length > 280) return response.status(400).json({ message: 'Bio cannot exceed 280 characters.' });
    updates.bio = bio;
  }

  const user = await prisma.user.update({ where: { id: request.user.id }, data: updates });
  response.json({ user: safeUser(user) });
}
