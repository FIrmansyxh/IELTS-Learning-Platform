/** SPEC-010 (Backend): kontrak data Reading yang dipakai ReadingWorkspace: passage_markdown apa adanya + passage_no per soal. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets } from '@/db/schema';
import { AttemptResponseSchema } from '@/contracts/attempts';
import { setClockForTest } from '@/server/clock';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { assessmentTypeHandlers } from '@/server/attempts/handlers';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as resultRoute } from '@/app/api/v1/attempts/[attempt_id]/result/route';
import { call, learnerSession } from './helpers';
import { addDrill, markLearnDone, resetLearning, seedMaterial } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

const db = getDb();
const realSkipHandler = assessmentTypeHandlers.SKIP_MODULE_TEST!;
afterAll(async () => {
  await resetLearning();
  await closeDb();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type L = Awaited<ReturnType<typeof learnerSession>>;

/** Teks mentah sengaja memuat label, pemisah, HTML mentah, tabel, dan Unicode: server tidak boleh mengubahnya. */
const PASSAGE = [
  '# Judul Satu\n\n[A] Paragraf <b>satu</b> & "kutip" — café 日本語.\n\n[B] Paragraf dua.',
  '# Judul Dua\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[A] Label A di teks dua.',
  'Teks tiga tanpa judul.\n\n<script>alert(1)</script>',
].join('\n===PASSAGE===\n');

/** n soal: 4 di teks 1, 4 di teks 2, 1 di teks 3, sisanya tanpa passage_no (n=10 = batas drill.question_count). Benar = `right-i`. */
const questions = (n = 10) =>
  Array.from({ length: n }, (_, i) =>
    Q.mcq({
      question_id: `Q-R${i + 1}`,
      skill: 'READING',
      prompt: `P${i + 1}`,
      options: [`right-${i + 1}`, 'x', 'y', 'z'],
      correct_answers: [`right-${i + 1}`],
      ...(i < 4 ? { passage_no: 1 } : i < 8 ? { passage_no: 2 } : i < 9 ? { passage_no: 3 } : {}),
    }),
  );

const start = (u: L, setId: string) => call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: setId } });
const get = (u: L, id: string) => call(getRoute, 'GET', `/api/v1/attempts/${id}`, { cookie: u.cookie, params: { attempt_id: id } });
const put = (u: L, id: string, qid: string, response: unknown) =>
  call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response } });

async function setup(passage: string | null = PASSAGE, qs: unknown[] = questions()) {
  await seedMaterial('1.1.1');
  const set = await addDrill('1.1.1', qs, passage === null ? {} : { readingPassageMarkdown: passage });
  const u = await learnerSession();
  await markLearnDone(u.user.id, '1.1.1');
  return { u, set };
}

beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
});
afterEach(() => {
  setClockForTest(null);
  assessmentTypeHandlers.SKIP_MODULE_TEST = realSkipHandler;
});

describe('AttemptDTO.passage_markdown (SPEC-010)', () => {
  it('dikirim apa adanya (byte per byte) pada start, resume, dan GET; skema kontrak valid', async () => {
    const { u, set } = await setup();
    const s = await start(u, set.id);
    expect(s.status).toBe(201);
    expect(AttemptResponseSchema.safeParse(s.json).success).toBe(true);
    expect(s.json.data.passage_markdown).toBe(PASSAGE);
    const g = await get(u, s.json.data.id);
    expect(g.json.data.passage_markdown).toBe(PASSAGE);
    const again = await start(u, set.id); // resume attempt aktif
    expect(again.status).toBe(200);
    expect(again.json.data.passage_markdown).toBe(PASSAGE);
  });

  it('perubahan teks oleh admin saat attempt berjalan tercermin pada GET berikutnya (klien membuang sorotan yang kedaluwarsa)', async () => {
    const { u, set } = await setup();
    const id = (await start(u, set.id)).json.data.id;
    await db.update(assessmentSets).set({ readingPassageMarkdown: 'Teks baru yang lebih pendek.' }).where(eq(assessmentSets.id, set.id));
    expect((await get(u, id)).json.data.passage_markdown).toBe('Teks baru yang lebih pendek.');
  });

  it('set tanpa teks bacaan -> passage_markdown null (klien menampilkan kartu "tidak dapat ditampilkan")', async () => {
    const { u, set } = await setup(null, [Q.mcq({ question_id: 'Q-G1' }), Q.mcq({ question_id: 'Q-G2' })]);
    expect((await start(u, set.id)).json.data.passage_markdown).toBeNull();
  });

  it('teks 60.000 karakter dikirim utuh', async () => {
    const big = Array.from({ length: 600 }, (_, i) => `[${String.fromCharCode(65 + (i % 26))}] ${'kata '.repeat(19)}${i}`).join('\n\n').slice(0, 60_000);
    expect(big.length).toBe(60_000);
    const { u, set } = await setup(big);
    expect((await start(u, set.id)).json.data.passage_markdown).toBe(big);
  });

  it('teks bacaan tidak berisi kunci jawaban dan soal publik tidak membocorkan kunci', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    const text = JSON.stringify(dto.questions);
    expect(text).not.toContain('correct_answers');
    expect(text).not.toContain('explanation');
  });
});

describe('QuestionPublicDTO.passage_no (SPEC-010)', () => {
  it('urutan soal set bacaan dipertahankan (nomor global stabil); passage_no tiap soal sesuai data; null dipertahankan', async () => {
    const { u, set } = await setup();
    const dto = (await start(u, set.id)).json.data;
    expect(dto.questions.map((q: any) => q.question_id)).toEqual(Array.from({ length: 10 }, (_, i) => `Q-R${i + 1}`));
    expect(dto.questions.map((q: any) => q.passage_no)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, null]);
    // "Teks 2: Soal 5-8" dihitung klien dari urutan global ini
    const t2 = dto.questions.flatMap((q: any, i: number) => (q.passage_no === 2 ? [i + 1] : []));
    expect([t2[0], t2.at(-1)]).toEqual([5, 8]);
  });

  it('urutan sama pada resume dan setelah menjawab (tanpa pengacakan ulang)', async () => {
    const { u, set } = await setup();
    const a = (await start(u, set.id)).json.data;
    const order = a.questions.map((q: any) => q.question_id);
    const q = a.questions[6];
    const right = { option_ids: [q.options.find((o: any) => o.text === 'right-7').option_id] };
    expect((await put(u, a.id, q.question_id, right)).status).toBe(200);
    const g = (await get(u, a.id)).json.data;
    expect(g.questions.map((x: any) => x.question_id)).toEqual(order);
    expect(g.answered_count).toBe(1);
  });

  it('passage_no di luar jumlah teks (data korup) tetap dilayani apa adanya; penanganan di klien', async () => {
    const qs = [Q.mcq({ question_id: 'Q-C1', skill: 'READING', passage_no: 3 }), Q.mcq({ question_id: 'Q-C2', skill: 'READING', passage_no: 1 })];
    const { u, set } = await setup('Hanya satu teks.', qs);
    const dto = (await start(u, set.id)).json.data;
    expect(dto.questions.map((q: any) => q.passage_no)).toEqual([3, 1]);
  });
});

describe('alur Reading end-to-end (EXAM) memakai mesin SPEC-006', () => {
  it('EXAM: jawaban diganti boleh, tanpa feedback; submit -> hasil, review mengikuti SPEC-006 D10; passage tidak di hasil', async () => {
    assessmentTypeHandlers.SKIP_MODULE_TEST = {
      async start() {
        return { mode: 'EXAM' as const, passPercent: 50, questionLimit: null, keepOrder: true };
      },
      async onFinish() {
        return { progress: null };
      },
    };
    await seedMaterial('1.1.1');
    const mod = (await db.execute(sql`SELECT id FROM modules WHERE module_code = '1.1'`)).rows[0] as { id: string };
    const [set] = await db
      .insert(assessmentSets)
      .values({ assessmentType: 'SKIP_MODULE_TEST', title: 'Ujian Reading', moduleId: mod.id, timeLimitSeconds: 600, questionsJson: questions(13), questionCount: 13, readingPassageMarkdown: PASSAGE, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' })
      .returning();
    const u = await learnerSession();
    const dto = (await start(u, set!.id)).json.data;
    expect(dto.mode).toBe('EXAM');
    expect(dto.passage_markdown).toBe(PASSAGE);
    for (const [i, q] of dto.questions.entries()) {
      const pick = i < 6 ? `right-${i + 1}` : 'x';
      const r = await put(u, dto.id, q.question_id, { option_ids: [q.options.find((o: any) => o.text === pick).option_id] });
      expect(r.status).toBe(200);
      expect(r.json.data.feedback).toBeNull();
    }
    const sub = await call(submitRoute, 'POST', `/api/v1/attempts/${dto.id}/submit`, { cookie: u.cookie, params: { attempt_id: dto.id } });
    expect(sub.status).toBe(200);
    const res = await call(resultRoute, 'GET', `/api/v1/attempts/${dto.id}/result`, { cookie: u.cookie, params: { attempt_id: dto.id } });
    expect(res.json.data.attempt).toMatchObject({ raw_score: 6, max_score: 13 });
    expect(JSON.stringify(res.json.data)).not.toContain('Judul Satu');
    // setelah selesai, soal & teks tidak lagi disajikan di GET (questions=[])
    expect((await get(u, dto.id)).json.data.questions).toEqual([]);
  });
});
