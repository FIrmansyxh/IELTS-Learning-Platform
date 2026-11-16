/* eslint-disable @typescript-eslint/no-explicit-any */
// SPEC-013 addendum 2026-11-11 (ADR-004 Addendum 3): rekaman Speaking dinilai lokal juga di Simulasi tes.
// Regresi: unggahan rekaman pada attempt MOCK_TEST dulu memeriksa section WRITING (salin-tempel), sehingga
// simulasi Speaking-saja selalu ditolak SECTION_NOT_ACTIVE.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { users, submissions } from '@/db/schema';
import { POST as createSimRoute } from '@/app/api/v1/simulations/route';
import { GET as getSectionRoute } from '@/app/api/v1/simulations/[attempt_id]/sections/[section]/route';
import { POST as startSectionRoute } from '@/app/api/v1/simulations/[attempt_id]/sections/[section]/start/route';
import { POST as speakingRoute } from '@/app/api/v1/submissions/speaking/route';
import { call, callMultipart, learnerSession } from './helpers';
import { seedSimulationFixtures } from '../fixtures/sim-fixtures';

const db = getDb();
// Header EBML (WebM) + isi pengganti >= 1 KB; ffprobe/STT tidak dipanggil (job berjalan terpisah).
const fakeWebm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2048, 1)]);

describe('Speaking lokal di Simulasi (MOCK_TEST)', () => {
  const prev = process.env.SPEAKING_AI_ENABLED;
  beforeEach(async () => {
    process.env.SPEAKING_AI_ENABLED = 'true';
    await seedSimulationFixtures();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.SPEAKING_AI_ENABLED;
    else process.env.SPEAKING_AI_ENABLED = prev;
  });

  it('simulasi Speaking-saja menerima rekaman Part 1 dan penilai melihat semua pertanyaan Part 1', async () => {
    const u = await learnerSession();
    await db.update(users).set({ consentRecordingAt: new Date() }).where(eq(users.id, u.user.id));

    const created = await call(createSimRoute, 'POST', '/api/v1/simulations', { cookie: u.cookie, body: { sections: ['SPEAKING'] } });
    expect(created.status).toBe(201);
    const attemptId = created.json.data.attempt_id as string;
    const params = { attempt_id: attemptId, section: 'SPEAKING' };
    expect((await call(startSectionRoute, 'POST', `/api/v1/simulations/${attemptId}/sections/SPEAKING/start`, { cookie: u.cookie, params, body: {} })).status).toBe(200);
    const detail = await call(getSectionRoute, 'GET', `/api/v1/simulations/${attemptId}/sections/SPEAKING`, { cookie: u.cookie, params });
    const p1 = detail.json.data.questions.filter((q: any) => q.ai_task?.part === 1);
    expect(p1.length).toBeGreaterThan(1);

    const res = await callMultipart(speakingRoute, '/api/v1/submissions/speaking', {
      cookie: u.cookie,
      fields: [
        ['kind', 'SPEAKING_PART1'],
        ['attempt_id', attemptId],
        ['question_id', p1[0].question_id],
      ],
      files: [{ name: 'audio', filename: 'answer.webm', data: fakeWebm, type: 'audio/webm' }],
    });
    expect(res.status, JSON.stringify(res.json)).toBe(202);
    expect(res.json.data.submission.kind).toBe('SPEAKING_PART1');

    const [row] = await db.select({ prompt: submissions.promptSnapshot }).from(submissions).where(eq(submissions.id, res.json.data.submission.id));
    for (const q of p1) expect(row!.prompt).toContain(q.prompt);
  });
});
