import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { clearAuthCookie, createToken, safeUser, setAuthCookie } from '../utils/auth.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Compared against when the account does not exist, so a wrong email takes as long as a wrong password.
const dummyHash = bcrypt.hashSync('not-a-real-password', 12);

// Questions offered on the register page (en + vi). Unknown emails get one of these, picked
// deterministically, so the recovery flow does not reveal which emails are registered.
const decoyQuestions = [
  'What was the name of your first school?',
  'What city were you born in?',
  'What was your childhood nickname?',
  'Tên ngôi trường đầu tiên của bạn là gì?',
  'Bạn sinh ra ở thành phố nào?',
  'Biệt danh thời thơ ấu của bạn là gì?'
];

function decoyQuestion(email) {
  const digest = crypto.createHmac('sha256', config.jwtSecret).update(email).digest();
  return decoyQuestions[digest.readUInt32BE(0) % decoyQuestions.length];
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 72;
}

function validateRegistration(body) {
  const name = String(body.name || '').trim();
  const email = normalizeEmail(body.email);
  const password = body.password;
  const securityQuestion = String(body.securityQuestion || '').trim();
  const securityAnswer = String(body.securityAnswer || '').trim();

  if (name.length < 2 || name.length > 80) throw Object.assign(new Error('Name must be between 2 and 80 characters.'), { statusCode: 400 });
  if (!emailPattern.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { statusCode: 400 });
  if (!validatePassword(password)) throw Object.assign(new Error('Password must be between 8 and 72 characters.'), { statusCode: 400 });
  if (securityQuestion.length < 5 || securityQuestion.length > 160) throw Object.assign(new Error('Choose or enter a security question.'), { statusCode: 400 });
  if (securityAnswer.length < 2 || securityAnswer.length > 160) throw Object.assign(new Error('Security answer must be between 2 and 160 characters.'), { statusCode: 400 });

  return { name, email, password, securityQuestion, securityAnswer };
}

export async function register(request, response) {
  const fields = validateRegistration(request.body);
  const existingUser = await prisma.user.findUnique({ where: { email: fields.email } });
  if (existingUser) return response.status(409).json({ message: 'An account with this email already exists.' });

  const [passwordHash, securityAnswerHash] = await Promise.all([
    bcrypt.hash(fields.password, 12),
    bcrypt.hash(fields.securityAnswer.toLowerCase(), 12)
  ]);
  const user = await prisma.user.create({
    data: {
      name: fields.name,
      email: fields.email,
      passwordHash,
      securityQuestion: fields.securityQuestion,
      securityAnswerHash,
      teacher: { create: {} }
    }
  });
  setAuthCookie(response, createToken(user));
  response.status(201).json({ user: safeUser(user) });
}

export async function login(request, response) {
  const email = normalizeEmail(request.body.email);
  const password = request.body.password;
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(String(password || ''), user?.passwordHash || dummyHash);
  if (!user || !valid) return response.status(401).json({ message: 'Email or password is incorrect.' });

  setAuthCookie(response, createToken(user));
  response.json({ user: safeUser(user) });
}

export function logout(request, response) {
  clearAuthCookie(response);
  response.json({ message: 'You are logged out.' });
}

export function currentUser(request, response) {
  response.json({ user: safeUser(request.user) });
}

export async function changePassword(request, response) {
  const { currentPassword, newPassword } = request.body;
  if (!validatePassword(newPassword)) return response.status(400).json({ message: 'New password must be between 8 and 72 characters.' });

  const user = await prisma.user.findUnique({ where: { id: request.user.id } });
  const valid = await bcrypt.compare(String(currentPassword || ''), user.passwordHash);
  if (!valid) return response.status(400).json({ message: 'Current password is incorrect.' });

  // Bumping tokenVersion signs out every other session; this one gets a fresh token.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), tokenVersion: (user.tokenVersion ?? 0) + 1 }
  });
  setAuthCookie(response, createToken(updated));
  response.json({ message: 'Password updated successfully.' });
}

export async function getSecurityQuestion(request, response) {
  const email = normalizeEmail(request.body.email);
  const user = await prisma.user.findUnique({ where: { email }, select: { securityQuestion: true } });
  if (!emailPattern.test(email)) return response.status(400).json({ message: 'Enter a valid email address.' });
  // Same response shape for unknown emails; the reset step then fails with the usual "incorrect answer".
  response.json({ securityQuestion: user?.securityQuestion || decoyQuestion(email) });
}

export async function resetPassword(request, response) {
  const email = normalizeEmail(request.body.email);
  const securityAnswer = String(request.body.securityAnswer || '').trim().toLowerCase();
  const newPassword = request.body.newPassword;
  if (!validatePassword(newPassword)) return response.status(400).json({ message: 'New password must be between 8 and 72 characters.' });

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(securityAnswer, user?.securityAnswerHash || dummyHash);
  if (!user || !valid) return response.status(400).json({ message: 'Security answer is incorrect.' });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), tokenVersion: (user.tokenVersion ?? 0) + 1 }
  });
  clearAuthCookie(response);
  response.json({ message: 'Password reset successfully. You can now log in.' });
}
