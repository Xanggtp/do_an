import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { registerTeacher, startTestApp } from './setup.mjs';

let ctx;
before(async () => { ctx = await startTestApp({ RECOVERY_RATE_LIMIT: '6' }); });
after(async () => { await ctx?.stop(); });

describe('auth', () => {
  test('register, me, logout', async () => {
    const agent = ctx.agent();
    const teacher = await registerTeacher(agent);
    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, teacher.email);
    assert.equal(me.body.user.passwordHash, undefined, 'password hash must never be returned');
    await agent.post('/api/auth/logout');
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });

  test('duplicate email is rejected', async () => {
    const { user, ...teacher } = await registerTeacher(ctx.agent());
    const response = await ctx.agent().post('/api/auth/register').send(teacher);
    assert.equal(response.status, 409);
  });

  test('login: wrong password and unknown email give the same answer', async () => {
    const teacher = await registerTeacher(ctx.agent());
    const wrong = await ctx.agent().post('/api/auth/login').send({ email: teacher.email, password: 'wrong-password' });
    const unknown = await ctx.agent().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
    const ok = await ctx.agent().post('/api/auth/login').send({ email: teacher.email.toUpperCase(), password: teacher.password });
    assert.equal(ok.status, 200);
  });

  test('security headers are set (helmet)', async () => {
    const response = await request(ctx.app).get('/api/health');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.ok(response.headers['strict-transport-security']);
    assert.equal(response.headers['x-powered-by'], undefined);
  });

  test('changing the password signs out other sessions', async () => {
    const first = ctx.agent();
    const teacher = await registerTeacher(first);
    const second = ctx.agent();
    assert.equal((await second.post('/api/auth/login').send({ email: teacher.email, password: teacher.password })).status, 200);

    const changed = await first.post('/api/auth/change-password').send({ currentPassword: teacher.password, newPassword: 'new-password-456' });
    assert.equal(changed.status, 200);
    assert.equal((await first.get('/api/auth/me')).status, 200, 'the session that changed the password stays signed in');
    assert.equal((await second.get('/api/auth/me')).status, 401, 'other sessions are signed out');
  });

  test('users created before tokenVersion existed can still sign in', async () => {
    const agent = ctx.agent();
    const teacher = await registerTeacher(agent);
    await ctx.prisma.$runCommandRaw({ update: 'User', updates: [{ q: { email: teacher.email }, u: { $unset: { tokenVersion: '' } } }] });
    assert.equal((await agent.get('/api/auth/me')).status, 200);
    assert.equal((await ctx.agent().post('/api/auth/login').send({ email: teacher.email, password: teacher.password })).status, 200);
  });

  test('password recovery does not reveal which emails exist, and reset revokes old sessions', async () => {
    const agent = ctx.agent();
    const teacher = await registerTeacher(agent);

    const real = await ctx.agent().post('/api/auth/forgot-password/question').send({ email: teacher.email });
    assert.equal(real.status, 200);
    assert.equal(real.body.securityQuestion, teacher.securityQuestion);

    const fake = await ctx.agent().post('/api/auth/forgot-password/question').send({ email: 'ghost@example.com' });
    const fakeAgain = await ctx.agent().post('/api/auth/forgot-password/question').send({ email: 'ghost@example.com' });
    assert.equal(fake.status, 200, 'unknown email must not return 404');
    assert.ok(fake.body.securityQuestion);
    assert.equal(fake.body.securityQuestion, fakeAgain.body.securityQuestion, 'decoy question is stable per email');

    const wrong = await ctx.agent().post('/api/auth/forgot-password/reset').send({ email: teacher.email, securityAnswer: 'nope', newPassword: 'another-pass-1' });
    assert.equal(wrong.status, 400);
    const reset = await ctx.agent().post('/api/auth/forgot-password/reset').send({ email: teacher.email, securityAnswer: ' HUE ', newPassword: 'another-pass-1' });
    assert.equal(reset.status, 200);
    assert.equal((await agent.get('/api/auth/me')).status, 401, 'old session is revoked after reset');
    assert.equal((await ctx.agent().post('/api/auth/login').send({ email: teacher.email, password: 'another-pass-1' })).status, 200);
  });

  test('password recovery is rate limited per IP', async () => {
    // The previous test used 5 recovery requests and the limit for this run is 6.
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await ctx.agent().post('/api/auth/forgot-password/question').send({ email: `probe${i}@example.com` })).status);
    }
    assert.deepEqual(statuses, [200, 429, 429]);
  });
});
