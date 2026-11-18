// Shared test harness: in-memory MongoDB replica set + schema push + the Express app.
// Nothing here touches the team's Atlas database or the real uploads folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Progress lines on CI so a slow MongoDB download or a stuck step is visible in the log.
const step = (message) => { if (process.env.CI) console.log(`[test-setup] ${new Date().toISOString()} ${message}`); };

export async function startTestApp(envOverrides = {}) {
  step('starting in-memory MongoDB (first run downloads the binary)');
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'classmind-test-'));

  Object.assign(process.env, {
    NODE_ENV: 'test',
    // Connect straight to the single member: on Linux runners replica-set discovery can stall Prisma.
    DATABASE_URL: `${replSet.getUri('classmind_test')}&directConnection=true`,
    JWT_SECRET: 'test-secret-do-not-use',
    UPLOAD_PROVIDER: 'local',
    UPLOAD_DIRECTORY: uploadDirectory,
    WORKER_MODE: 'inline',
    GEMINI_API_KEY: '',
    ...envOverrides
  });

  step(`MongoDB ready at ${process.env.DATABASE_URL}; pushing Prisma schema`);
  try {
    execFileSync(process.execPath, [path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js'), 'db', 'push', '--skip-generate'], {
      cwd: serverRoot,
      env: process.env,
      stdio: 'pipe',
      timeout: 90000
    });
  } catch (error) {
    error.message += `
prisma db push stdout:
${error.stdout ?? ''}
stderr:
${error.stderr ?? ''}`;
    throw error;
  }
  step('schema pushed; loading app');

  const { default: app } = await import('../src/app.js');
  const { prisma } = await import('../src/config/prisma.js');

  return {
    app,
    prisma,
    uploadDirectory,
    agent: () => request.agent(app),
    async stop() {
      await prisma.$disconnect();
      await replSet.stop();
      fs.rmSync(uploadDirectory, { recursive: true, force: true });
    }
  };
}

let userCounter = 0;
export async function registerTeacher(agent, overrides = {}) {
  userCounter += 1;
  const body = {
    name: 'Test Teacher',
    email: `teacher${userCounter}-${Date.now()}@example.com`,
    password: 'password123',
    securityQuestion: 'What city were you born in?',
    securityAnswer: 'Hue',
    ...overrides
  };
  const response = await agent.post('/api/auth/register').send(body);
  if (response.status !== 201) throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  return { ...body, user: response.body.user };
}

export async function createClass(agent, { semester = '2026.1', name = 'Giải tích 1', classCode = 'MATH101', subject = 'Toán' } = {}) {
  await agent.post('/api/semesters').send({ code: semester });
  const response = await agent.post('/api/classes').send({ name, classCode, subject, semester });
  if (response.status !== 201) throw new Error(`create class failed: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.class;
}

/** Synthetic lecture video (test pattern + tone) made with the bundled ffmpeg. */
export async function makeTestVideo(target, seconds = 70) {
  const { default: ffmpeg } = await import('../src/config/ffmpeg.js');
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(`testsrc=size=160x120:rate=10:duration=${seconds}`).inputFormat('lavfi')
      .input(`sine=frequency=440:duration=${seconds}`).inputFormat('lavfi')
      .outputOptions(['-c:v libx264', '-preset ultrafast', '-pix_fmt yuv420p', '-g 10', '-c:a aac', '-shortest'])
      .on('end', resolve)
      .on('error', reject)
      .save(target);
  });
  return target;
}

export async function waitFor(check, { timeoutMs = 60000, intervalMs = 300 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('waitFor timed out');
}
