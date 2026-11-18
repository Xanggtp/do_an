import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClass, makeTestVideo, registerTeacher, startTestApp, waitFor } from './setup.mjs';

let ctx;
let videoPath;

before(async () => {
  ctx = await startTestApp({ SEGMENT_SECONDS: '30' });
  videoPath = path.join(ctx.uploadDirectory, '..', `${path.basename(ctx.uploadDirectory)}-report.mp4`);
  await makeTestVideo(videoPath, 70);
});
after(async () => {
  if (videoPath) fs.rmSync(videoPath, { force: true });
  await ctx?.stop();
});

async function uploadAndWait(agent, classId) {
  const upload = await agent.post('/api/videos/upload').field('classId', classId).attach('video', videoPath, { filename: 'lesson.mp4', contentType: 'video/mp4' });
  assert.equal(upload.status, 202);
  return waitFor(async () => {
    const response = await agent.get(`/api/videos/${upload.body.videoId}/status`);
    return response.body.stage === 'COMPLETED' ? response.body : null;
  });
}

describe('reports overview', () => {
  test('requires login', async () => {
    assert.equal((await ctx.agent().get('/api/reports/overview')).status, 401);
  });

  test('empty account returns zeros, not errors', async () => {
    const agent = ctx.agent();
    await registerTeacher(agent);
    const response = await agent.get('/api/reports/overview');
    assert.equal(response.status, 200);
    assert.equal(response.body.totals.lessons, 0);
    assert.equal(response.body.totals.strengthShare, null);
    assert.deepEqual(response.body.trend, []);
  });

  test('aggregates lessons across classes and filters by semester', async () => {
    const agent = ctx.agent();
    await registerTeacher(agent);
    const math = await createClass(agent, { semester: '2026.1', name: 'Giải tích', classCode: 'M1' });
    const physics = await createClass(agent, { semester: '2026.2', name: 'Vật lý', classCode: 'P1' });
    await uploadAndWait(agent, math.id);
    await uploadAndWait(agent, math.id);
    await uploadAndWait(agent, physics.id);

    const all = (await agent.get('/api/reports/overview')).body;
    assert.equal(all.totals.classes, 2);
    assert.equal(all.totals.lessons, 3);
    assert.equal(all.totals.analyzedLessons, 3);
    assert.ok(Math.abs(all.totals.analyzedSeconds - 210) < 3, `analyzed ${all.totals.analyzedSeconds}s`);
    assert.equal(all.trend.length, 3);
    assert.equal(all.totals.strengths + all.totals.growth, all.danielson.reduce((sum, item) => sum + item.strengths + item.growth, 0));
    assert.ok(all.danielson.every((item) => /^[1-4][a-f]$/.test(item.component)));
    assert.equal(all.bloom.length, 6);
    assert.ok(all.copus.length > 0);
    assert.ok(Math.abs(all.copus.reduce((sum, item) => sum + item.share, 0) - 100) < 1, 'COPUS shares add up to 100%');
    const mathRow = all.classes.find((row) => row.id === math.id);
    assert.equal(mathRow.analyzedLessons, 2);

    const semester = all.semesters.find((item) => item.code === '2026.2');
    const filtered = (await agent.get(`/api/reports/overview?semesterId=${semester.id}`)).body;
    assert.equal(filtered.totals.classes, 1);
    assert.equal(filtered.totals.lessons, 1);
    assert.equal(filtered.classes[0].id, physics.id);

    const stranger = ctx.agent();
    await registerTeacher(stranger);
    const theirs = (await stranger.get(`/api/reports/overview?semesterId=${semester.id}`)).body;
    assert.equal(theirs.totals.lessons, 0, 'never includes another teacher\'s data');
  });
});
