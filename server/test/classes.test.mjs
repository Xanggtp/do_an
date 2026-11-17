import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClass, registerTeacher, startTestApp } from './setup.mjs';

let ctx;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx?.stop(); });

describe('semesters and classes', () => {
  test('routes require login', async () => {
    assert.equal((await ctx.agent().get('/api/semesters')).status, 401);
    assert.equal((await ctx.agent().post('/api/classes').send({})).status, 401);
  });

  test('create semester and class, reject invalid input and duplicates', async () => {
    const agent = ctx.agent();
    await registerTeacher(agent);
    assert.equal((await agent.post('/api/semesters').send({ code: '2026-1' })).status, 400);
    const cls = await createClass(agent);
    assert.equal(cls.name, 'Giải tích 1');
    assert.equal((await agent.post('/api/semesters').send({ code: '2026.1' })).status, 409);
    const duplicate = await agent.post('/api/classes').send({ name: 'Giải tích 1', classCode: 'OTHER', subject: 'Toán', semester: '2026.1' });
    assert.equal(duplicate.status, 409);
    const noSemester = await agent.post('/api/classes').send({ name: 'Lý 1', classCode: 'PHY1', subject: 'Lý', semester: '2027.2' });
    assert.equal(noSemester.status, 404);
  });

  test('teachers cannot see or delete each other\'s classes', async () => {
    const owner = ctx.agent();
    await registerTeacher(owner);
    const cls = await createClass(owner, { classCode: 'OWN1' });

    const stranger = ctx.agent();
    await registerTeacher(stranger);
    assert.equal((await stranger.get(`/api/classes/${cls.id}/videos`)).status, 404);
    assert.equal((await stranger.delete(`/api/classes/${cls.id}`)).status, 404);
    assert.equal((await owner.get(`/api/classes/${cls.id}/videos`)).status, 200);
  });

  test('legacy classes (semester string only) get linked to a Semester record once', async () => {
    const agent = ctx.agent();
    const { user } = await registerTeacher(agent);
    const teacher = await ctx.prisma.teacher.findUnique({ where: { userId: user.id } });
    await ctx.prisma.class.create({ data: { name: 'Lớp cũ', subject: 'Văn', semester: '2025.2', teacherId: teacher.id } });

    const first = await agent.get('/api/semesters');
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.semesters.map((item) => item.code), ['2025.2']);
    const legacy = await ctx.prisma.class.findFirst({ where: { teacherId: teacher.id, name: 'Lớp cũ' } });
    assert.equal(legacy.semesterId, first.body.semesters[0].id);

    const second = await agent.get('/api/semesters');
    assert.equal(second.body.semesters.length, 1, 'no duplicate semesters on repeated calls');
  });

  test('deleting a semester removes its classes', async () => {
    const agent = ctx.agent();
    await registerTeacher(agent);
    const cls = await createClass(agent, { semester: '2026.2', classCode: 'DEL1' });
    const semesters = (await agent.get('/api/semesters')).body.semesters;
    const semester = semesters.find((item) => item.code === '2026.2');
    assert.equal((await agent.delete(`/api/semesters/${semester.id}`)).status, 200);
    assert.equal(await ctx.prisma.class.count({ where: { id: cls.id } }), 0);
  });
});
