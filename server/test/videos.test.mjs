import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClass, makeTestVideo, registerTeacher, startTestApp, waitFor } from './setup.mjs';

let ctx;
let videoPath;

// 70s synthetic lecture split into 30s segments => 3 segments.
before(async () => {
  ctx = await startTestApp({ SEGMENT_SECONDS: '30' });
  videoPath = path.join(ctx.uploadDirectory, '..', `${path.basename(ctx.uploadDirectory)}-lecture.mp4`);
  await makeTestVideo(videoPath, 70);
});
after(async () => {
  if (videoPath) fs.rmSync(videoPath, { force: true });
  await ctx?.stop();
});

const finished = (agent, videoId) => waitFor(async () => {
  const response = await agent.get(`/api/videos/${videoId}/status`);
  return ['COMPLETED', 'FAILED'].includes(response.body.stage) ? response.body : null;
});

describe('video pipeline (inline mode, stub AI)', () => {
  test('upload -> validate -> segment -> analyze -> observation -> delete', async () => {
    const agent = ctx.agent();
    await registerTeacher(agent);
    const cls = await createClass(agent);

    const upload = await agent.post('/api/videos/upload').field('classId', cls.id).attach('video', videoPath, { filename: 'bai-giang.mp4', contentType: 'video/mp4' });
    assert.equal(upload.status, 202);
    const { videoId } = upload.body;

    const status = await finished(agent, videoId);
    assert.equal(status.stage, 'COMPLETED', status.error);
    assert.equal(status.progress, 100);
    assert.equal(Math.round(status.duration), 70);
    assert.equal(status.resolution, '160x120');
    assert.equal(status.segments.length, 3);
    assert.ok(status.segments.every((segment) => segment.review?.content_review));

    const observation = await agent.get(`/api/videos/${videoId}/observation`);
    assert.equal(observation.status, 200);
    assert.ok(observation.body.feedback.length > 0);
    assert.equal(observation.body.segments.length, 3);

    const media = await agent.get(`/api/videos/${videoId}/media`).set('Range', 'bytes=0-99');
    assert.equal(media.status, 206);

    const reprocess = await agent.post(`/api/videos/${videoId}/reprocess`);
    assert.equal(reprocess.status, 202);
    const again = await finished(agent, videoId);
    assert.equal(again.stage, 'COMPLETED');
    assert.equal(await ctx.prisma.videoSegment.count({ where: { videoId } }), 3, 'reprocess must not duplicate segments');

    const segmentDir = path.join(ctx.uploadDirectory, 'segments', videoId);
    assert.ok(fs.existsSync(segmentDir));
    assert.equal((await agent.delete(`/api/videos/${videoId}`)).status, 200);
    assert.equal(fs.existsSync(segmentDir), false, 'segment files removed');
    assert.equal((await agent.get(`/api/videos/${videoId}/status`)).status, 404);
    assert.equal(await ctx.prisma.videoSegment.count({ where: { videoId } }), 0);
  });

  test('a corrupted file fails cleanly', async () => {
    const agent = ctx.agent();
    await registerTeacher(agent);
    const cls = await createClass(agent, { classCode: 'BAD1' });
    const upload = await agent.post('/api/videos/upload').field('classId', cls.id).attach('video', Buffer.from('not a video'), { filename: 'broken.mp4', contentType: 'video/mp4' });
    assert.equal(upload.status, 202);
    const status = await finished(agent, upload.body.videoId);
    assert.equal(status.stage, 'FAILED');
    assert.match(status.error, /Validation failed/);
    assert.equal((await agent.get(`/api/videos/${upload.body.videoId}/observation`)).status, 422);
  });

  test('uploads are checked: login, class ownership, file type', async () => {
    const owner = ctx.agent();
    await registerTeacher(owner);
    const cls = await createClass(owner, { classCode: 'OWN2' });

    // Small body: the server answers 401 before reading the upload, which would reset a large stream.
    const anonymous = await ctx.agent().post('/api/videos/upload').field('classId', cls.id).attach('video', Buffer.from('x'), { filename: 'x.mp4', contentType: 'video/mp4' });
    assert.equal(anonymous.status, 401);

    const stranger = ctx.agent();
    await registerTeacher(stranger);
    const foreign = await stranger.post('/api/videos/upload').field('classId', cls.id).attach('video', videoPath, { filename: 'x.mp4', contentType: 'video/mp4' });
    assert.equal(foreign.status, 404);

    const notVideo = await owner.post('/api/videos/upload').field('classId', cls.id).attach('video', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
    assert.equal(notVideo.status, 400);
  });
});
