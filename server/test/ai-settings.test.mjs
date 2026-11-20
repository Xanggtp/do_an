import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClass, makeTestVideo, registerTeacher, startTestApp, waitFor } from './setup.mjs';

const GOOD_KEY = 'AIzaSyTEST-good-key-1234567890abcd';
const OTHER_KEY = 'AIzaSyTEST-second-key-0987654321wxyz';

let ctx;
let videoPath;
let stubAnalyzeSegment;
const realFetch = globalThis.fetch;
let geminiCalls = [];

/**
 * Fake Gemini REST API. Keys starting with "AIzaSyTEST-" are valid; anything else gets 400.
 * Records each call (method, path, key header) so tests can check which key was used.
 */
function installFakeGemini() {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.hostname !== 'generativelanguage.googleapis.com' && url.hostname !== 'upload.fake-gemini.test') return realFetch(input, init);
    const headers = new Headers(init.headers);
    const apiKey = headers.get('x-goog-api-key');
    geminiCalls.push({ method: init.method || 'GET', path: url.pathname, apiKey });
    const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });

    if (!apiKey?.startsWith('AIzaSyTEST-')) return json({ error: { message: 'API key not valid' } }, 400);
    if (url.pathname === '/v1beta/models') {
      return json({
        models: [
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }
        ]
      });
    }
    if (url.pathname.startsWith('/v1beta/models/') && !url.pathname.includes(':')) {
      return url.pathname.endsWith('gemini-3.8-flash') || url.pathname.endsWith('gemini-3.5-flash-lite') || url.pathname.endsWith('gemini-3.5-flash')
        ? json({ name: url.pathname.slice(8) }) : json({ error: {} }, 404);
    }
    if (url.pathname === '/upload/v1beta/files') return json({}, 200, { 'x-goog-upload-url': 'https://upload.fake-gemini.test/session/1' });
    if (url.hostname === 'upload.fake-gemini.test') return json({ file: { name: 'files/abc', uri: 'https://fake/files/abc', mimeType: 'video/mp4', state: 'ACTIVE' } });
    if (url.pathname.endsWith(':generateContent')) {
      if (url.pathname.includes('gemini-3.5-flash:generateContent') && apiKey === 'AIzaSyTEST-new-user-404-fallback-9999') {
        return json({
          error: {
            code: 404,
            message: 'This model models/gemini-3.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements.'
          }
        }, 404);
      }
      const review = { ...stubAnalyzeSegment({ index: 1, startSec: 0, endSec: 30 }), content_review: { main_topic: 'Gemini topic', summary: 'Gemini summary', key_points: [], important_visuals: [], continuity_notes: '' } };
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(review) }] } }] });
    }
    if (init.method === 'DELETE') return json({});
    return json({ error: 'unexpected' }, 500);
  };
}

before(async () => {
  ctx = await startTestApp({ SEGMENT_SECONDS: '30', WORKER_MODE: 'stub', RATE_LIMIT_ENABLED: 'false' });
  ({ stubAnalyzeSegment } = await import('../src/workers/aiProcessor.js'));
  videoPath = path.join(ctx.uploadDirectory, '..', `${path.basename(ctx.uploadDirectory)}-ai.mp4`);
  await makeTestVideo(videoPath, 40);
  installFakeGemini();
});
afterEach(() => { geminiCalls = []; });
after(async () => {
  globalThis.fetch = realFetch;
  if (videoPath) fs.rmSync(videoPath, { force: true });
  await ctx?.stop();
});

describe('AI settings (personal Gemini key)', () => {
  test('requires login', async () => {
    assert.equal((await ctx.agent().get('/api/user/ai-settings')).status, 401);
    assert.equal((await ctx.agent().put('/api/user/ai-settings').send({ apiKey: GOOD_KEY })).status, 401);
  });

  test('defaults to stub analysis when no key is set', async () => {
    const agent = ctx.agent();
    await registerTeacher(agent);
    const response = await agent.get('/api/user/ai-settings');
    assert.equal(response.status, 200);
    assert.equal(response.body.settings.hasPersonalKey, false);
    assert.equal(response.body.settings.activeProvider, 'stub');
    assert.ok(response.body.settings.models.includes('gemini-3.8-flash'));
  });

  test('rejects malformed input and keys Google refuses', async () => {
    const agent = ctx.agent();
    await registerTeacher(agent);
    assert.equal((await agent.put('/api/user/ai-settings').send({ apiKey: 'short' })).status, 400);
    assert.equal((await agent.put('/api/user/ai-settings').send({ model: 'gpt-4o' })).status, 400);
    const refused = await agent.put('/api/user/ai-settings').send({ apiKey: 'AIzaSyWRONG-key-that-google-refuses-123' });
    assert.equal(refused.status, 400);
    assert.match(refused.body.message, /rejected/);
    assert.equal((await agent.get('/api/user/ai-settings')).body.settings.hasPersonalKey, false, 'nothing saved');
  });

  test('saves a verified key encrypted and never returns it', async () => {
    const agent = ctx.agent();
    const { user } = await registerTeacher(agent);
    const saved = await agent.put('/api/user/ai-settings').send({ apiKey: `  ${GOOD_KEY}  `, model: 'gemini-3.5-flash' });
    assert.equal(saved.status, 200);
    assert.deepEqual(
      { has: saved.body.settings.hasPersonalKey, hint: saved.body.settings.keyHint, model: saved.body.settings.model, active: saved.body.settings.activeProvider },
      { has: true, hint: 'abcd', model: 'gemini-3.5-flash', active: 'user' }
    );
    assert.ok(geminiCalls.some((call) => call.path === '/v1beta/models/gemini-3.5-flash' && call.apiKey === GOOD_KEY), 'key verified with Google');

    const everything = JSON.stringify([saved.body, (await agent.get('/api/user/ai-settings')).body, (await agent.get('/api/auth/me')).body, (await agent.get('/api/user/profile')).body]);
    assert.ok(!everything.includes(GOOD_KEY), 'API responses must never contain the key');

    const row = await ctx.prisma.user.findUnique({ where: { id: user.id } });
    assert.ok(row.geminiApiKeyEnc && !row.geminiApiKeyEnc.includes(GOOD_KEY), 'stored encrypted');
    const { decryptSecret } = await import('../src/utils/secretBox.js');
    assert.equal(decryptSecret(row.geminiApiKeyEnc), GOOD_KEY);
  });

  test('uploads are analyzed with the uploader\'s own key, and removing it falls back to stub', async () => {
    const agent = ctx.agent();
    await registerTeacher(agent);
    assert.equal((await agent.put('/api/user/ai-settings').send({ apiKey: OTHER_KEY, model: 'gemini-3.5-flash-lite' })).status, 200);
    const cls = await createClass(agent, { classCode: 'AI1' });

    const upload = await agent.post('/api/videos/upload').field('classId', cls.id).attach('video', videoPath, { filename: 'ai.mp4', contentType: 'video/mp4' });
    assert.equal(upload.status, 202);
    const status = await waitFor(async () => {
      const response = await agent.get(`/api/videos/${upload.body.videoId}/status`);
      return ['COMPLETED', 'FAILED'].includes(response.body.stage) ? response.body : null;
    });
    assert.equal(status.stage, 'COMPLETED', status.error);
    assert.ok(status.segments.length >= 2);
    assert.ok(status.segments.every((segment) => segment.review.provider === 'gemini-3.5-flash-lite'));
    assert.equal(status.segments[0].review.content_review.summary, 'Gemini summary');

    const generate = geminiCalls.filter((call) => call.path.endsWith(':generateContent'));
    assert.equal(generate.length, status.segments.length);
    assert.ok(generate.every((call) => call.apiKey === OTHER_KEY && call.path.includes('gemini-3.5-flash-lite')));
    assert.ok(geminiCalls.some((call) => call.method === 'DELETE'), 'uploaded Gemini files are cleaned up');

    const removed = await agent.delete('/api/user/ai-settings/key');
    assert.equal(removed.body.settings.activeProvider, 'stub');
    assert.equal(removed.body.settings.hasPersonalKey, false);
  });

  test('falls back automatically when a model returns 404 for new users or legacy DB settings', async () => {
    const agent = ctx.agent();
    const { user } = await registerTeacher(agent);
    const fallbackKey = 'AIzaSyTEST-new-user-404-fallback-9999';
    assert.equal((await agent.put('/api/user/ai-settings').send({ apiKey: fallbackKey, model: 'gemini-3.5-flash' })).status, 200);
    const cls = await createClass(agent, { classCode: 'AI3' });

    const upload = await agent.post('/api/videos/upload').field('classId', cls.id).attach('video', videoPath, { filename: 'fallback.mp4', contentType: 'video/mp4' });
    assert.equal(upload.status, 202);
    const status = await waitFor(async () => {
      const response = await agent.get(`/api/videos/${upload.body.videoId}/status`);
      return ['COMPLETED', 'FAILED'].includes(response.body.stage) ? response.body : null;
    });
    assert.equal(status.stage, 'COMPLETED', status.error);
    assert.ok(status.segments.every((segment) => segment.review.provider === 'gemini-3.8-flash'));

    // Also verify legacy gemini-2.5-flash saved directly in DB normalizes to gemini-3.8-flash
    await ctx.prisma.user.update({ where: { id: user.id }, data: { geminiModel: 'gemini-2.5-flash' } });
    const settingsRes = await agent.get('/api/user/ai-settings');
    assert.equal(settingsRes.body.settings.model, 'gemini-3.8-flash');
  });

  test('a key that can no longer be decrypted fails the video with a clear message', async () => {
    const agent = ctx.agent();
    const { user } = await registerTeacher(agent);
    await ctx.prisma.user.update({ where: { id: user.id }, data: { geminiApiKeyEnc: 'v1:broken:broken:broken', geminiKeyHint: 'xxxx' } });
    const cls = await createClass(agent, { classCode: 'AI2' });
    const upload = await agent.post('/api/videos/upload').field('classId', cls.id).attach('video', videoPath, { filename: 'ai.mp4', contentType: 'video/mp4' });
    const status = await waitFor(async () => {
      const response = await agent.get(`/api/videos/${upload.body.videoId}/status`);
      return ['COMPLETED', 'FAILED'].includes(response.body.stage) ? response.body : null;
    });
    assert.equal(status.stage, 'FAILED');
    assert.match(status.error, /enter it again in Settings/);
  });
});
