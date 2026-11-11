/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bukti tes (bukan pembacaan kode) untuk AC SPEC-023 yang sebelumnya hanya "terverifikasi di service.ts":
 * AC-5, AC-6, AC-9, AC-11, AC-13, AC-14, AC-15. Nama tiap tes diawali "AC-N:".
 * Fixture SINTETIS dari tests/fixtures/sim-banks.ts (bukan bank asli); DB/storage tes selalu sementara (harness).
 * Berkas ini mengosongkan bank soal sebelum tiap tes agar komposisi stok yang diuji persis.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { assessmentSets, attemptSections, attempts, contentAssets, contentSources } from '@/db/schema';
import { closeDb, execute, getDb } from '@/server/db';
import { setClockForTest } from '@/server/clock';
import { resetRateLimits } from '@/server/http/rate-limit';
import { waitForQueueIdle } from '@/server/jobs/queue';
import { ensureProgressRows } from '@/server/gatekeeping/service';
import { ensureUserStats } from '@/server/gamification/service';
import { getActiveTable } from '@/server/band/service';
import { convertRawToBand, scaleToForty } from '@/server/band/convert';
import { computeSpeakingBand, computeWritingBand } from '@/server/simulation/scoring';
import type { BankRow } from '@/server/simulation/assemble';
import { GET as optionsRoute } from '@/app/api/v1/simulations/options/route';
import { POST as createSimRoute } from '@/app/api/v1/simulations/route';
import { GET as getSimRoute } from '@/app/api/v1/simulations/[attempt_id]/route';
import { GET as getSectionRoute } from '@/app/api/v1/simulations/[attempt_id]/sections/[section]/route';
import { POST as startSectionRoute } from '@/app/api/v1/simulations/[attempt_id]/sections/[section]/start/route';
import { POST as submitSectionRoute } from '@/app/api/v1/simulations/[attempt_id]/sections/[section]/submit/route';
import { GET as getResultRoute } from '@/app/api/v1/simulations/[attempt_id]/result/route';
import { POST as abandonRoute } from '@/app/api/v1/simulations/[attempt_id]/abandon/route';
import { PUT as answerRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { GET as getAttemptRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { GET as examHistoryRoute } from '@/app/api/v1/me/exam-history/route';
import { POST as writingSubRoute } from '@/app/api/v1/submissions/writing/route';
import { POST as speakingSubRoute } from '@/app/api/v1/submissions/speaking-external/route';
import { POST as selfAssessRoute } from '@/app/api/v1/submissions/[submission_id]/self-assessment/route';
import { GET as audioRoute } from '@/app/api/v1/attempts/[attempt_id]/audio/route';
import { getStorage } from '@/server/storage';
import { call, learnerSession } from './helpers';
import {
  abundantPool,
  idsOf,
  listeningBank,
  minimalPool,
  readingBank,
  speakingBank,
  writingBank,
} from '../fixtures/sim-banks';

const db = getDb();
type L = Awaited<ReturnType<typeof learnerSession>>;

// ---------------------------------------------------------------- pembungkus rute
const getOptions = (u: L) => call(optionsRoute, 'GET', '/api/v1/simulations/options', { cookie: u.cookie });
const createSim = (u: L, sections: string[]) =>
  call(createSimRoute, 'POST', '/api/v1/simulations', { cookie: u.cookie, body: { sections } });
const getSim = (u: L, id: string) =>
  call(getSimRoute, 'GET', `/api/v1/simulations/${id}`, { cookie: u.cookie, params: { attempt_id: id } });
const getSection = (u: L, id: string, sec: string) =>
  call(getSectionRoute, 'GET', `/api/v1/simulations/${id}/sections/${sec}`, { cookie: u.cookie, params: { attempt_id: id, section: sec } });
const startSection = (u: L, id: string, sec: string) =>
  call(startSectionRoute, 'POST', `/api/v1/simulations/${id}/sections/${sec}/start`, { cookie: u.cookie, params: { attempt_id: id, section: sec }, body: {} });
const submitSection = (u: L, id: string, sec: string) =>
  call(submitSectionRoute, 'POST', `/api/v1/simulations/${id}/sections/${sec}/submit`, { cookie: u.cookie, params: { attempt_id: id, section: sec }, body: {} });
const getResult = (u: L, id: string) =>
  call(getResultRoute, 'GET', `/api/v1/simulations/${id}/result`, { cookie: u.cookie, params: { attempt_id: id } });
const abandonSim = (u: L, id: string) =>
  call(abandonRoute, 'POST', `/api/v1/simulations/${id}/abandon`, { cookie: u.cookie, params: { attempt_id: id }, body: {} });
const answer = (u: L, attemptId: string, qId: string, response: any = { selected: 'True' }) =>
  call(answerRoute, 'PUT', `/api/v1/attempts/${attemptId}/answers/${qId}`, { cookie: u.cookie, params: { attempt_id: attemptId, question_id: qId }, body: { response } });
const postWriting = (u: L, attemptId: string, qId: string, kind: 'WRITING_TASK1' | 'WRITING_TASK2') =>
  call(writingSubRoute, 'POST', '/api/v1/submissions/writing', {
    cookie: u.cookie,
    body: { kind, attempt_id: attemptId, question_id: qId, response_text: 'Dear Ms Rivera, I am writing to raise a polite concern about the noise. '.repeat(12) },
  });
const SPK = { fluency: 6, lexical: 6, grammar: 6, pronunciation: 6 };
const postSpeaking = (u: L, attemptId: string, qId: string, part: 1 | 2 | 3, band = 6) =>
  call(speakingSubRoute, 'POST', '/api/v1/submissions/speaking-external', {
    cookie: u.cookie,
    body: {
      attempt_id: attemptId,
      question_id: qId,
      kind: `SPEAKING_PART${part}`,
      tool: 'CHATGPT',
      criteria_scores: { ...SPK, fluency: band, lexical: band, grammar: band, pronunciation: band },
    },
  });
const selfAssess = (u: L, submissionId: string, band: number) =>
  call(selfAssessRoute, 'POST', `/api/v1/submissions/${submissionId}/self-assessment`, {
    cookie: u.cookie,
    params: { submission_id: submissionId },
    body: { criteria_scores: { task_response: band, coherence: band, lexical: band, grammar: band } },
  });

// ---------------------------------------------------------------- fixture DB
async function resetBanks() {
  await execute(db, sql`DELETE FROM attempts`);
  await execute(db, sql`DELETE FROM assessment_sets`);
  await execute(db, sql`DELETE FROM content_assets WHERE asset_code LIKE 'gt-listening/sim%'`);
}

async function insertPool(rows: BankRow[]) {
  const [src] = await db.select().from(contentSources).limit(1);
  for (const r of rows) {
    if (r.listeningAssetId) {
      await db.insert(contentAssets).values({
        id: r.listeningAssetId,
        assetCode: `gt-listening/simac-${r.listeningAssetId}`,
        kind: 'AUDIO_LISTENING',
        title: `Audio ${r.bankCode}`,
        sourceId: src!.id,
        rightsStatus: 'OWN_ORIGINAL',
        storageBackend: 'FILESYSTEM',
        storageKey: `audio/${r.listeningAssetId}.mp3`,
        mimeType: 'audio/mpeg',
        durationSec: r.audioDurationSec ?? null,
        attributionText: r.audioAttribution ?? null,
      });
    }
    await db.insert(assessmentSets).values({
      id: r.id,
      assessmentType: 'QUESTION_BANK',
      bankCode: r.bankCode,
      bankKind: r.bankKind,
      title: `Bank ${r.bankCode}`,
      skillCategory: r.skillCategory as any,
      timeLimitSeconds: 0,
      readingPassageMarkdown: r.readingPassageMarkdown,
      listeningAssetId: r.listeningAssetId,
      questionsJson: r.questionsJson as any,
      questionCount: r.questionCount,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
      examModule: 'GENERAL_TRAINING',
    });
  }
}

/** Bank "awal" (D10): Reading 2 teks x 8 soal, Writing T1 3 register x 3 + T2 x 9, Speaking 9/6/6, TANPA Listening. */
function initialBank(): BankRow[] {
  return [
    readingBank('READING_GT_S1', 'INIT-RD1', 8),
    readingBank('READING_GT_S2', 'INIT-RD2', 8),
    writingBank('WRITING_GT_T1_FORMAL', 'INIT-W1F', 3),
    writingBank('WRITING_GT_T1_SEMI', 'INIT-W1S', 3),
    writingBank('WRITING_GT_T1_INFORMAL', 'INIT-W1I', 3),
    writingBank('WRITING_GT_T2', 'INIT-W2', 9),
    speakingBank(1, 'INIT-SP1', 9),
    speakingBank(2, 'INIT-SP2', 6),
    speakingBank(3, 'INIT-SP3', 6),
  ];
}

const sectionRows = async (attemptId: string) =>
  db.select().from(attemptSections).where(eq(attemptSections.attemptId, attemptId));
const rowOf = async (attemptId: string, skill: string) => (await sectionRows(attemptId)).find((r) => r.skill === skill)!;
const attemptCount = async (userId: string) =>
  ((await execute(db, sql`SELECT count(*) AS n FROM attempts WHERE user_id = ${userId}`)).rows[0] as any).n as number;
const stateIds = async (attemptId: string, section: string): Promise<string[]> => {
  const [a] = await db.select({ state: attempts.state }).from(attempts).where(eq(attempts.id, attemptId));
  const sec = (a!.state as any).sections.find((s: any) => s.section === section);
  return sec.questions.map((q: any) => q.question_id);
};

/** Buat simulasi Reading, mulai pada `t0`, jawab `nCorrect` soal benar. */
async function startedReading(u: L, nCorrect: number) {
  const c = await createSim(u, ['READING']);
  expect(c.status).toBe(201);
  const id = c.json.data.attempt_id as string;
  const s = await startSection(u, id, 'READING');
  expect(s.status).toBe(200);
  const qs: string[] = s.json.data.questions.map((q: any) => q.question_id);
  for (let i = 0; i < nCorrect; i++) expect((await answer(u, id, qs[i]!)).status).toBe(200);
  return { id, qs };
}

const T0 = Date.UTC(2026, 10, 9, 10, 0, 0);
const READING_LIMIT_MS = 3600 * 1000;

describe('SPEC-023: bukti AC pasca-audit (integrasi)', () => {
  let user: L;
  let now = T0;

  beforeEach(async () => {
    resetRateLimits();
    await resetBanks();
    user = await learnerSession();
    now = T0;
    setClockForTest(() => now);
  });
  afterEach(() => {
    setClockForTest(null);
    delete process.env.AI_ENABLED;
    delete process.env.LLM_DRIVER;
  });
  afterAll(async () => {
    await resetBanks();
    await closeDb();
  });

  // =============================================================== AC-5
  describe('AC-5: bank awal tanpa Reading 40 / Listening lengkap', () => {
    it('AC-5: GET /simulations/options -> LISTENING & READING available=false CONTENT_MISSING; WRITING & SPEAKING available=true', async () => {
      await insertPool(initialBank());
      const r = await getOptions(user);
      expect(r.status).toBe(200);
      const by = Object.fromEntries(r.json.data.sections.map((s: any) => [s.section, s]));
      expect(r.json.data.sections.map((s: any) => s.section)).toEqual(['LISTENING', 'READING', 'WRITING', 'SPEAKING']);
      expect(by.LISTENING).toMatchObject({
        available: false,
        unavailable_reason: 'CONTENT_MISSING',
        unavailable_detail: 'Listening membutuhkan 4 bagian beraudio dengan total 40 soal.',
        time_limit_seconds: null,
        question_count: 40,
      });
      expect(by.READING).toMatchObject({
        available: false,
        unavailable_reason: 'CONTENT_MISSING',
        unavailable_detail: 'Reading membutuhkan 3 teks dengan total 40 soal.',
        time_limit_seconds: null,
        question_count: 40,
      });
      expect(by.WRITING).toMatchObject({ available: true, unavailable_reason: null, unavailable_detail: null, time_limit_seconds: 3600, question_count: 2 });
      expect(by.SPEAKING).toMatchObject({ available: true, unavailable_reason: null, unavailable_detail: null, time_limit_seconds: null, question_count: 9 });
      expect(r.json.data.in_progress_attempt_id).toBeNull();
    });

    it('AC-5: POST {LISTENING, READING} -> 422 SIMULATION_NOT_ENOUGH_CONTENT dengan details sections.LISTENING dan sections.READING; tidak ada attempt tercipta', async () => {
      await insertPool(initialBank());
      const r = await createSim(user, ['LISTENING', 'READING']);
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe('SIMULATION_NOT_ENOUGH_CONTENT');
      const details = r.json.error.details as Array<{ path: string; code: string; message: string }>;
      expect(details).toHaveLength(2);
      expect(details.find((d) => d.path === 'sections.LISTENING')).toEqual({
        path: 'sections.LISTENING',
        code: 'content_missing',
        message: 'Listening membutuhkan 4 bagian beraudio dengan total 40 soal.',
      });
      expect(details.find((d) => d.path === 'sections.READING')).toEqual({
        path: 'sections.READING',
        code: 'content_missing',
        message: 'Reading membutuhkan 3 teks dengan total 40 soal.',
      });
      expect(await attemptCount(user.user.id)).toBe(0);
      expect((await execute(db, sql`SELECT count(*) AS n FROM attempt_sections`)).rows[0]).toMatchObject({ n: 0 });
    });

    it('AC-5: bank awal tetap bisa merakit WRITING + SPEAKING (201), sedangkan menambah READING menggagalkan seluruh permintaan (tanpa attempt)', async () => {
      await insertPool(initialBank());
      const bad = await createSim(user, ['READING', 'WRITING']);
      expect(bad.status).toBe(422);
      expect(bad.json.error.details.map((d: any) => d.path)).toEqual(['sections.READING']);
      expect(await attemptCount(user.user.id)).toBe(0);
      const ok = await createSim(user, ['WRITING', 'SPEAKING']);
      expect(ok.status).toBe(201);
      expect(ok.json.data.sections.map((s: any) => [s.section, s.question_count])).toEqual([
        ['WRITING', 2],
        ['SPEAKING', 9],
      ]);
    });
  });

  // =============================================================== AC-6
  describe('AC-6: pemulihan setelah refresh (jam terkontrol)', () => {
    it('AC-6: refresh memulihkan active_section, 3 jawaban, dan remaining_seconds = deadline_at - server_now (600 detik berlalu -> berkurang 600)', async () => {
      await insertPool(minimalPool());
      const { id, qs } = await startedReading(user, 3);

      const before = await getSim(user, id);
      const secBefore = before.json.data.sections[0];
      expect(secBefore.remaining_seconds).toBe(3600);
      expect(secBefore.started_at).toBe(new Date(T0).toISOString());
      expect(secBefore.deadline_at).toBe(new Date(T0 + READING_LIMIT_MS).toISOString());

      now = T0 + 600_000; // 600 detik berlalu, "halaman direfresh"
      const sim = await getSim(user, id);
      expect(sim.status).toBe(200);
      expect(sim.json.data.server_now).toBe(new Date(now).toISOString());
      expect(sim.json.data.active_section).toBe('READING');
      expect(sim.json.data.status).toBe('IN_PROGRESS');
      const sec = sim.json.data.sections[0];
      expect(sec.status).toBe('IN_PROGRESS');
      expect(sec.answered_count).toBe(3);
      expect(sec.remaining_seconds).toBe(3000);
      expect(sec.remaining_seconds).toBe(secBefore.remaining_seconds - 600);
      expect(sec.remaining_seconds).toBe((Date.parse(sec.deadline_at) - Date.parse(sim.json.data.server_now)) / 1000);
      expect(sec.auto_submitted).toBe(false);

      const detail = await getSection(user, id, 'READING');
      expect(detail.status).toBe(200);
      expect(detail.json.data.status).toBe('IN_PROGRESS');
      expect(detail.json.data.remaining_seconds).toBe(3000);
      expect(detail.json.data.server_now).toBe(new Date(now).toISOString());
      expect(detail.json.data.answers).toHaveLength(3);
      expect(detail.json.data.answers.map((a: any) => a.question_id).sort()).toEqual(qs.slice(0, 3).sort());
      for (const a of detail.json.data.answers) expect(a.response).toMatchObject({ selected: 'True' });

      // refresh kedua setelah 1 detik lagi: tetap pulih, sisa waktu turun 1
      now += 1000;
      const again = await getSim(user, id);
      expect(again.json.data.active_section).toBe('READING');
      expect(again.json.data.sections[0].remaining_seconds).toBe(2999);
    });

    it('AC-6: start idempoten pada section IN_PROGRESS mengembalikan started_at yang sama (timer tidak diulang)', async () => {
      await insertPool(minimalPool());
      const { id } = await startedReading(user, 0);
      now = T0 + 120_000;
      const again = await startSection(user, id, 'READING');
      expect(again.status).toBe(200);
      expect(again.json.data.remaining_seconds).toBe(3480);
      const sim = await getSim(user, id);
      expect(sim.json.data.sections[0].started_at).toBe(new Date(T0).toISOString());
    });
  });

  // =============================================================== AC-9
  describe('AC-9: kedaluwarsa section (dievaluasi malas) dan SECTION_EXPIRED', () => {
    it('AC-9: GET sesudah deadline -> section dikirim otomatis (auto_submitted=true, submitted_at=deadline_at), jawaban tersimpan dinilai, attempt GRADED', async () => {
      await insertPool(minimalPool());
      const { id } = await startedReading(user, 5);
      now = T0 + READING_LIMIT_MS + 1000;

      const sim = await getSim(user, id);
      expect(sim.status).toBe(200);
      const sec = sim.json.data.sections[0];
      expect(sec.status).toBe('GRADED');
      expect(sec.auto_submitted).toBe(true);
      expect(sec.submitted_at).toBe(sec.deadline_at);
      expect(sec.remaining_seconds).toBeNull();
      expect(sim.json.data.active_section).toBeNull();
      expect(sim.json.data.status).toBe('GRADED'); // satu-satunya section sudah bernilai

      const res = await getResult(user, id);
      const rs = res.json.data.sections[0];
      const table = await getActiveTable(db, 'READING_GENERAL');
      expect(rs).toMatchObject({ section: 'READING', status: 'GRADED', raw_score: 5, max_score: 40 });
      expect(rs.band).toBe(convertRawToBand(table.rows, scaleToForty(5, 40)));
    });

    it('AC-9: PUT jawaban sesudah deadline_at + 5 detik -> 409 SECTION_EXPIRED; section langsung terkirim otomatis dengan jawaban yang tersimpan', async () => {
      await insertPool(minimalPool());
      const { id, qs } = await startedReading(user, 4);
      now = T0 + READING_LIMIT_MS + 6000;

      const put = await answer(user, id, qs[10]!);
      expect(put.status).toBe(409);
      expect(put.json.error.code).toBe('SECTION_EXPIRED');

      const row = await rowOf(id, 'READING');
      expect(row.status).toBe('GRADED');
      expect(Number(row.rawScore)).toBe(4); // jawaban yang ditolak tidak ikut dinilai
      expect(row.submittedAt!.getTime()).toBe(row.deadlineAt!.getTime());
      const sim = await getSim(user, id);
      expect(sim.json.data.sections[0].auto_submitted).toBe(true);
    });

    it('AC-9: batas toleransi 5 detik: PUT pada deadline + 4 detik diterima, pada deadline + 6 detik ditolak', async () => {
      await insertPool(minimalPool());
      const { id, qs } = await startedReading(user, 1);
      now = T0 + READING_LIMIT_MS + 4000;
      expect((await answer(user, id, qs[1]!)).status).toBe(200);
      now = T0 + READING_LIMIT_MS + 6000;
      const late = await answer(user, id, qs[2]!);
      expect(late.status).toBe(409);
      expect(late.json.error.code).toBe('SECTION_EXPIRED');
    });

    it('AC-9: start pada section yang waktunya habis -> 409 SECTION_EXPIRED dan section tetap terkirim otomatis (tidak dibatalkan rollback)', async () => {
      await insertPool(minimalPool());
      const { id } = await startedReading(user, 2);
      now = T0 + READING_LIMIT_MS + 10_000;
      const r = await startSection(user, id, 'READING');
      expect(r.status).toBe(409);
      expect(r.json.error.code).toBe('SECTION_EXPIRED');
      const row = await rowOf(id, 'READING');
      expect(row.status).toBe('GRADED');
      expect(Number(row.rawScore)).toBe(2);
      expect(row.submittedAt!.getTime()).toBe(row.deadlineAt!.getTime());
    });

    it('AC-9: submit sesudah deadline memberi hasil section yang dikirim otomatis (submitted_at = deadline_at, bukan waktu submit)', async () => {
      await insertPool(minimalPool());
      const { id } = await startedReading(user, 3);
      now = T0 + READING_LIMIT_MS + 30_000;
      const r = await submitSection(user, id, 'READING');
      expect(r.status).toBe(200);
      expect(r.json.data).toMatchObject({ section: 'READING', status: 'GRADED', raw_score: 3, max_score: 40, attempt_status: 'GRADED' });
      const row = await rowOf(id, 'READING');
      expect(row.submittedAt!.getTime()).toBe(row.deadlineAt!.getTime());
      const sim = await getSim(user, id);
      expect(sim.json.data.sections[0].auto_submitted).toBe(true);
    });

    it('AC-9: GET isi section sesudah deadline juga memicu pengiriman otomatis; PUT sesudahnya tetap 409', async () => {
      await insertPool(minimalPool());
      const { id, qs } = await startedReading(user, 2);
      now = T0 + READING_LIMIT_MS + 8000;
      const d = await getSection(user, id, 'READING');
      expect(d.status).toBe(200);
      expect(d.json.data.status).toBe('GRADED');
      expect((await rowOf(id, 'READING')).status).toBe('GRADED');
      const put = await answer(user, id, qs[5]!);
      expect(put.status).toBe(409);
      expect(['SECTION_EXPIRED', 'SECTION_NOT_ACTIVE']).toContain(put.json.error.code);
    });

    it('AC-9: Writing yang kedaluwarsa tanpa submission -> dikirim otomatis, band 0 (D8)', async () => {
      await insertPool(minimalPool());
      const c = await createSim(user, ['WRITING']);
      const id = c.json.data.attempt_id as string;
      await startSection(user, id, 'WRITING');
      now = T0 + 3600_000 + 2000;
      const sim = await getSim(user, id);
      expect(sim.json.data.sections[0]).toMatchObject({ status: 'GRADED', auto_submitted: true });
      const res = await getResult(user, id);
      expect(res.json.data.sections[0]).toMatchObject({ status: 'GRADED', band: 0, detail: { task1_band: 0, task2_band: 0 } });
    });
  });

  // =============================================================== AC-11
  describe('AC-11: LLM tidak tersedia (AI_ENABLED=false) -> Writing menunggu nilai mandiri', () => {
    async function writingSim() {
      await insertPool(minimalPool());
      const c = await createSim(user, ['WRITING']);
      const id = c.json.data.attempt_id as string;
      const s = await startSection(user, id, 'WRITING');
      const [t1, t2] = s.json.data.parts.map((p: any) => p.question_ids[0] as string);
      return { id, t1: t1 as string, t2: t2 as string };
    }

    it('AC-11: AI_ENABLED=false -> section AWAITING_GRADING sampai kedua task dinilai sendiri; hasil verified=false dan band mengikuti D4', async () => {
      process.env.AI_ENABLED = 'false';
      const { id, t1, t2 } = await writingSim();
      const w1 = await postWriting(user, id, t1, 'WRITING_TASK1');
      const w2 = await postWriting(user, id, t2, 'WRITING_TASK2');
      expect(w1.status).toBe(202);
      expect(w1.json.data.submission.status).toBe('FALLBACK_SELF_ASSESSMENT');
      expect(w2.json.data.submission.status).toBe('FALLBACK_SELF_ASSESSMENT');

      const sub = await submitSection(user, id, 'WRITING');
      expect(sub.status).toBe(200);
      expect(sub.json.data).toMatchObject({ section: 'WRITING', status: 'AWAITING_GRADING', band: null, attempt_status: 'AWAITING_GRADING' });

      let res = await getResult(user, id);
      expect(res.json.data.status).toBe('AWAITING_GRADING');
      expect(res.json.data.sections[0]).toMatchObject({ section: 'WRITING', status: 'AWAITING_GRADING', band: null, verified: null });

      // Task 1 dinilai sendiri (6.0): Task 2 masih menunggu
      const a1 = await selfAssess(user, w1.json.data.submission.id, 6);
      expect(a1.status).toBe(201);
      res = await getResult(user, id);
      expect(res.json.data.sections[0]).toMatchObject({ status: 'AWAITING_GRADING', band: null });

      // Task 2 dinilai sendiri (6.5) -> Writing = roundBand((6.0 + 2 x 6.5) / 3) = 6.5
      const a2 = await selfAssess(user, w2.json.data.submission.id, 6.5);
      expect(a2.status).toBe(201);
      res = await getResult(user, id);
      expect(res.json.data.status).toBe('GRADED');
      expect(res.json.data.sections[0]).toMatchObject({
        section: 'WRITING',
        status: 'GRADED',
        band: computeWritingBand(6, 6.5),
        verified: false,
        detail: { task1_band: 6, task2_band: 6.5 },
      });
      expect(computeWritingBand(6, 6.5)).toBe(6.5);
      const sim = await getSim(user, id);
      expect(sim.json.data.status).toBe('GRADED');
      expect(sim.json.data.sections[0].status).toBe('GRADED');
    });

    it('AC-11: hanya Task 1 dikirim lalu dinilai sendiri -> Task 2 kosong band 0, Writing = roundBand(T1/3), verified=false', async () => {
      process.env.AI_ENABLED = 'false';
      const { id, t1 } = await writingSim();
      const w1 = await postWriting(user, id, t1, 'WRITING_TASK1');
      const sub = await submitSection(user, id, 'WRITING');
      expect(sub.json.data.status).toBe('AWAITING_GRADING');
      expect((await selfAssess(user, w1.json.data.submission.id, 6)).status).toBe(201);
      const res = await getResult(user, id);
      expect(res.json.data.sections[0]).toMatchObject({
        status: 'GRADED',
        band: computeWritingBand(6, 0),
        verified: false,
        detail: { task1_band: 6, task2_band: 0 },
      });
      expect(computeWritingBand(6, 0)).toBe(2);
    });

    it('AC-11 (pembanding): LLM tersedia (mock) -> hasil dari AI memiliki verified=true', async () => {
      process.env.AI_ENABLED = 'true';
      process.env.LLM_DRIVER = 'mock';
      const { id, t1, t2 } = await writingSim();
      const w1 = await postWriting(user, id, t1, 'WRITING_TASK1');
      expect(w1.status).toBe(202);
      await waitForQueueIdle();
      const w2 = await postWriting(user, id, t2, 'WRITING_TASK2');
      expect(w2.status).toBe(202);
      await waitForQueueIdle();
      const sub = await submitSection(user, id, 'WRITING');
      expect(sub.json.data.status).toBe('GRADED');
      const res = await getResult(user, id);
      expect(res.json.data.sections[0]).toMatchObject({ status: 'GRADED', verified: true });
    });
  });

  // =============================================================== AC-10 / AC-7 (pelengkap)
  describe('AC-10: Task kosong tidak dikirim ke LLM', () => {
    it('AC-10: Task 1 terkirim dan Task 2 kosong -> hanya 1 submission/1 job LLM, task2_band=0, Writing = roundBand((T1+0)/3)', async () => {
      process.env.AI_ENABLED = 'true';
      process.env.LLM_DRIVER = 'mock';
      await insertPool(minimalPool());
      const c = await createSim(user, ['WRITING']);
      const id = c.json.data.attempt_id as string;
      const s = await startSection(user, id, 'WRITING');
      const t1 = s.json.data.parts[0].question_ids[0] as string;
      expect((await postWriting(user, id, t1, 'WRITING_TASK1')).status).toBe(202);
      await waitForQueueIdle();
      const sub = await submitSection(user, id, 'WRITING');
      expect(sub.json.data.status).toBe('GRADED');

      const n = (sql: ReturnType<typeof import('drizzle-orm').sql>) => execute(db, sql).then((r) => (r.rows[0] as any).n as number);
      expect(await n(sql`SELECT count(*) AS n FROM submissions WHERE attempt_id = ${id}`)).toBe(1);
      expect(await n(sql`SELECT count(*) AS n FROM async_jobs WHERE user_id = ${user.user.id} AND kind = 'GRADE_WRITING'`)).toBe(1);

      const res = await getResult(user, id);
      const w = res.json.data.sections[0];
      expect(w.detail.task2_band).toBe(0);
      expect(w.detail.task1_band).toBeGreaterThan(0);
      expect(w.band).toBe(computeWritingBand(w.detail.task1_band, 0));
    });

    it('AC-10: kedua task kosong -> Writing band 0 tanpa submission dan tanpa job LLM', async () => {
      process.env.AI_ENABLED = 'true';
      process.env.LLM_DRIVER = 'mock';
      await insertPool(minimalPool());
      const c = await createSim(user, ['WRITING']);
      const id = c.json.data.attempt_id as string;
      await startSection(user, id, 'WRITING');
      const sub = await submitSection(user, id, 'WRITING');
      expect(sub.json.data).toMatchObject({ status: 'GRADED', band: 0 });
      const jobs = (await execute(db, sql`SELECT count(*) AS n FROM async_jobs WHERE user_id = ${user.user.id}`)).rows[0] as any;
      expect(jobs.n).toBe(0);
    });
  });

  describe('AC-7 (bagian guard): semua rute simulasi menolak permintaan tanpa cookie', () => {
    it('AC-7: 401 UNAUTHENTICATED tanpa sesi pada kedelapan rute simulasi', async () => {
      const ID = '00000000-0000-4000-8000-000000000001';
      const p = { attempt_id: ID, section: 'READING' };
      const calls = [
        call(optionsRoute, 'GET', '/api/v1/simulations/options'),
        call(createSimRoute, 'POST', '/api/v1/simulations', { body: { sections: ['WRITING'] } }),
        call(getSimRoute, 'GET', `/api/v1/simulations/${ID}`, { params: p }),
        call(getSectionRoute, 'GET', `/api/v1/simulations/${ID}/sections/READING`, { params: p }),
        call(startSectionRoute, 'POST', `/api/v1/simulations/${ID}/sections/READING/start`, { params: p, body: {} }),
        call(submitSectionRoute, 'POST', `/api/v1/simulations/${ID}/sections/READING/submit`, { params: p, body: {} }),
        call(getResultRoute, 'GET', `/api/v1/simulations/${ID}/result`, { params: p }),
        call(abandonRoute, 'POST', `/api/v1/simulations/${ID}/abandon`, { params: p, body: {} }),
      ];
      for (const r of await Promise.all(calls)) {
        expect(r.status).toBe(401);
        expect(r.json.error.code).toBe('UNAUTHENTICATED');
      }
    });
  });

  // =============================================================== AC-3 / AC-17 / AC-18 (pelengkap)
  describe('pelengkap AC-3, AC-17, AC-18', () => {
    it('AC-3: Reading 40/40 -> 9.0 dan Listening memakai tabel LISTENING (34/40 sesuai pencarian tabel aktif)', async () => {
      await insertPool([
        ...minimalPool(),
        listeningBank(1, 'AC3-L1'),
        listeningBank(2, 'AC3-L2'),
        listeningBank(3, 'AC3-L3'),
        listeningBank(4, 'AC3-L4'),
      ]);
      const c = await createSim(user, ['LISTENING', 'READING']);
      const id = c.json.data.attempt_id as string;
      const l = await startSection(user, id, 'LISTENING');
      for (const q of l.json.data.questions.slice(0, 34)) expect((await answer(user, id, q.question_id, { selected: 'A' })).status).toBe(200);
      const ls = await submitSection(user, id, 'LISTENING');
      const lt = await getActiveTable(db, 'LISTENING');
      expect(ls.json.data).toMatchObject({ raw_score: 34, max_score: 40, band: convertRawToBand(lt.rows, scaleToForty(34, 40)) });

      resetRateLimits(); // batas answer_submit per pengguna (60/menit) bukan objek uji ini
      const r = await startSection(user, id, 'READING');
      for (const q of r.json.data.questions) expect((await answer(user, id, q.question_id, { selected: 'True' })).status).toBe(200);
      const rs = await submitSection(user, id, 'READING');
      expect(rs.json.data).toMatchObject({ raw_score: 40, max_score: 40, band: 9 });
    });

    it('audio Listening simulasi dapat diputar lewat /attempts/:id/audio?asset= (bukan /assets/:id/file)', async () => {
      await insertPool([...minimalPool(), listeningBank(1, 'AUD-L1'), listeningBank(2, 'AUD-L2'), listeningBank(3, 'AUD-L3'), listeningBank(4, 'AUD-L4')]);
      const mp3 = Buffer.from('ID3fake-mp3-bytes');
      const key = await getStorage().put(mp3, 'mp3');
      await execute(db, sql`UPDATE content_assets SET storage_key = ${key} WHERE asset_code LIKE 'gt-listening/simac-%'`);
      const c = await createSim(user, ['LISTENING']);
      const id = c.json.data.attempt_id as string;
      const audio = (url: string) =>
        audioRoute(new Request(`http://localhost:3000${url}`, { headers: { cookie: user.cookie!, origin: 'http://localhost:3000' } }), {
          params: Promise.resolve({ attempt_id: id }),
        });

      expect((await startSection(user, id, 'LISTENING')).status).toBe(200);
      const parts = (await getSection(user, id, 'LISTENING')).json.data.parts as Array<{ listening: { audio_url: string } | null }>;
      expect(parts).toHaveLength(4);
      for (const p of parts) expect(p.listening!.audio_url).toMatch(new RegExp(`^/api/v1/attempts/${id}/audio\\?asset=[0-9a-f-]{36}$`));

      const ok = await audio(parts[0]!.listening!.audio_url);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toBe('audio/mpeg');
      expect(Buffer.from(await ok.arrayBuffer())).toEqual(mp3);
      // Asset di luar attempt ini -> 404; tanpa ?asset -> 404.
      expect((await audio(`/api/v1/attempts/${id}/audio?asset=00000000-0000-4000-8000-000000000000`)).status).toBe(404);
      expect((await audio(`/api/v1/attempts/${id}/audio`)).status).toBe(404);
      // Setelah section dikumpulkan, audio tidak lagi dilayani.
      expect((await submitSection(user, id, 'LISTENING')).status).toBe(200);
      expect((await audio(parts[0]!.listening!.audio_url)).status).not.toBe(200);
    });

    it('AC-17: tabel progres tier/modul/sub-modul dan user_stats identik sebelum-sesudah, points_awarded=0, radar READING terbarui, riwayat memuat MOCK_TEST', async () => {
      await insertPool(minimalPool());
      const uid = user.user.id;
      await ensureProgressRows(db, uid); // profil uji dibuat tanpa hook pendaftaran: buat baris progres/statistik agar snapshot bermakna
      await ensureUserStats(db, uid);
      const snap = async () => ({
        tier: (await execute(db, sql`SELECT * FROM user_tier_progress WHERE user_id = ${uid} ORDER BY rowid`)).rows,
        module: (await execute(db, sql`SELECT * FROM user_module_progress WHERE user_id = ${uid} ORDER BY rowid`)).rows,
        sub: (await execute(db, sql`SELECT * FROM user_sub_module_progress WHERE user_id = ${uid} ORDER BY rowid`)).rows,
        stats: (await execute(db, sql`SELECT * FROM user_stats WHERE user_id = ${uid}`)).rows,
      });
      const before = await snap();
      expect(before.tier.length).toBeGreaterThan(0); // snapshot tidak kosong
      expect(before.stats.length).toBe(1);

      const { id } = await startedReading(user, 30);
      const sub = await submitSection(user, id, 'READING');
      expect(sub.json.data).toMatchObject({ status: 'GRADED', attempt_status: 'GRADED' });

      expect(await snap()).toEqual(before);
      const [att] = await db.select().from(attempts).where(eq(attempts.id, id));
      expect(att!.pointsAwarded).toBe(0);
      const skill = (await execute(db, sql`SELECT estimated_band AS band, sample_size AS n FROM user_skill_scores WHERE user_id = ${uid} AND skill = 'READING'`)).rows[0] as any;
      expect(skill).toBeTruthy();
      expect(skill.n).toBeGreaterThan(0);
      const hist = await call(examHistoryRoute, 'GET', '/api/v1/me/exam-history', { cookie: user.cookie });
      expect(hist.json.data.find((h: any) => h.attempt_id === id)).toMatchObject({ title: 'Simulasi tes', result_path: `/simulasi/${id}/hasil` });
    });

    it('AC-18: GET /attempts/{id} dan GET /attempts/{id}/result pada MOCK_TEST tidak memuat correct_answers, explanation_id, rng_seed (sebelum dan sesudah selesai)', async () => {
      await insertPool(minimalPool());
      const { id } = await startedReading(user, 5);
      const forbidden = ['correct_answers', 'explanation_id', 'rng_seed', 'Pembahasan'];
      const check = async (label: string) => {
        const a = await call(getAttemptRoute, 'GET', `/api/v1/attempts/${id}`, { cookie: user.cookie, params: { attempt_id: id } });
        expect(a.status, label).toBe(200);
        const text = JSON.stringify(a.json);
        for (const f of forbidden) expect(text, `${label}: ${f}`).not.toContain(f);
        const sec = JSON.stringify((await getSection(user, id, 'READING')).json);
        for (const f of forbidden) expect(sec, `${label} section: ${f}`).not.toContain(f);
      };
      await check('berjalan');
      await submitSection(user, id, 'READING');
      await check('selesai');
    });
  });

  // =============================================================== AC-13
  describe('AC-13: anti-ulang antar simulasi', () => {
    /** Selesaikan simulasi (Reading + Writing kosong) agar simulasi berikutnya boleh dibuat; Speaking tidak menahan status. */
    async function finish(u: L, id: string, sections: string[]) {
      for (const s of sections.filter((x) => x === 'READING' || x === 'WRITING')) {
        expect((await startSection(u, id, s)).status).toBe(200);
        expect((await submitSection(u, id, s)).status).toBe(200);
      }
    }

    it('AC-13: stok melimpah -> simulasi kedua tidak memakai question_id Writing/Speaking/Reading yang sama dengan simulasi pertama', async () => {
      await insertPool(abundantPool());
      const sections = ['READING', 'WRITING', 'SPEAKING'];
      const c1 = await createSim(user, sections);
      expect(c1.status).toBe(201);
      const id1 = c1.json.data.attempt_id as string;
      await finish(user, id1, sections);
      expect((await getSim(user, id1)).json.data.status).toBe('GRADED');

      const c2 = await createSim(user, sections);
      expect(c2.status).toBe(201);
      const id2 = c2.json.data.attempt_id as string;
      for (const s of sections) {
        const a = await stateIds(id1, s);
        const b = await stateIds(id2, s);
        expect(b.length).toBe(a.length);
        expect(b.filter((q) => a.includes(q)), `section ${s}`).toEqual([]);
      }
      expect(await stateIds(id2, 'READING')).toHaveLength(40);
    });

    it('AC-13: simulasi yang ABANDONED tidak dihitung sebagai "sudah dilihat" (stok minimum tetap dapat dirakit ulang)', async () => {
      await insertPool(minimalPool());
      const c1 = await createSim(user, ['WRITING', 'SPEAKING']);
      expect((await abandonSim(user, c1.json.data.attempt_id)).status).toBe(204);
      const c2 = await createSim(user, ['WRITING', 'SPEAKING']);
      expect(c2.status).toBe(201);
    });

    it('AC-13: stok tidak cukup (tepat minimum) -> soal berulang dipakai dan perakitan tidak gagal', async () => {
      await insertPool(minimalPool());
      const sections = ['READING', 'WRITING', 'SPEAKING'];
      const c1 = await createSim(user, sections);
      expect(c1.status).toBe(201);
      const id1 = c1.json.data.attempt_id as string;
      await finish(user, id1, sections);

      const c2 = await createSim(user, sections);
      expect(c2.status).toBe(201);
      const id2 = c2.json.data.attempt_id as string;
      for (const s of sections) {
        expect(new Set(await stateIds(id2, s)), `section ${s}`).toEqual(new Set(await stateIds(id1, s)));
      }
      expect(await stateIds(id2, 'READING')).toHaveLength(40);
      // semua id yang dipakai berasal dari stok fixture (tidak ada soal "karangan")
      const stock = new Set(idsOf(minimalPool()));
      for (const s of sections) for (const q of await stateIds(id2, s)) expect(stock.has(q)).toBe(true);
    });
  });

  // =============================================================== AC-14
  describe('AC-14: komposisi Reading 3 paket = 40 soal', () => {
    it('AC-14: Reading dirakit dari tiga paket S1, S2, S3 berurutan dengan total tepat 40 soal (14+13+13)', async () => {
      await insertPool(minimalPool());
      const opts = await getOptions(user);
      const rd = opts.json.data.sections.find((s: any) => s.section === 'READING');
      expect(rd).toMatchObject({ available: true, unavailable_reason: null, time_limit_seconds: 3600, question_count: 40 });

      const c = await createSim(user, ['READING']);
      expect(c.status).toBe(201);
      expect(c.json.data.sections[0]).toMatchObject({ section: 'READING', time_limit_seconds: 3600, question_count: 40 });
      const id = c.json.data.attempt_id as string;
      const s = await startSection(user, id, 'READING');
      expect(s.status).toBe(200);
      const parts = s.json.data.parts as any[];
      expect(parts.map((p) => p.part_no)).toEqual([1, 2, 3]);
      expect(parts.map((p) => p.question_ids.length)).toEqual([14, 13, 13]);
      expect(parts[0].passage_markdown).toContain('Teks MIN-RD1');
      expect(parts[1].passage_markdown).toContain('Teks MIN-RD2');
      expect(parts[2].passage_markdown).toContain('Teks MIN-RD3');
      expect(s.json.data.questions).toHaveLength(40);

      // state tersimpan: bank asal berurutan S1, S2, S3
      const [a] = await db.select({ state: attempts.state }).from(attempts).where(eq(attempts.id, id));
      const sec = (a!.state as any).sections[0];
      expect(sec.parts.map((p: any) => p.bank_code)).toEqual(['MIN-RD1', 'MIN-RD2', 'MIN-RD3']);
      const kinds = await Promise.all(
        sec.parts.map(async (p: any) => (await db.select({ k: assessmentSets.bankKind }).from(assessmentSets).where(eq(assessmentSets.id, p.bank_set_id)))[0]!.k),
      );
      expect(kinds).toEqual(['READING_GT_S1', 'READING_GT_S2', 'READING_GT_S3']);
    });

    it('AC-14: stok Reading tanpa kombinasi 40 soal (14+13+12 = 39) -> READING available=false dan POST -> 422 tanpa attempt', async () => {
      await insertPool([
        readingBank('READING_GT_S1', 'NO-RD1', 14),
        readingBank('READING_GT_S2', 'NO-RD2', 13),
        readingBank('READING_GT_S3', 'NO-RD3', 12),
        ...minimalPool().filter((b) => !b.bankKind!.startsWith('READING')),
      ]);
      const opts = await getOptions(user);
      const rd = opts.json.data.sections.find((s: any) => s.section === 'READING');
      expect(rd).toMatchObject({ available: false, unavailable_reason: 'CONTENT_MISSING', time_limit_seconds: null });
      const c = await createSim(user, ['READING']);
      expect(c.status).toBe(422);
      expect(c.json.error.code).toBe('SIMULATION_NOT_ENOUGH_CONTENT');
      expect(c.json.error.details.map((d: any) => d.path)).toEqual(['sections.READING']);
      expect(await attemptCount(user.user.id)).toBe(0);
    });
  });

  // =============================================================== AC-15
  describe('AC-15: Speaking 4+1+4 dan skor lewat speaking-external', () => {
    async function speakingSim(sections = ['SPEAKING']) {
      await insertPool(abundantPool());
      const c = await createSim(user, sections);
      expect(c.status).toBe(201);
      const id = c.json.data.attempt_id as string;
      const s = await startSection(user, id, 'SPEAKING');
      expect(s.status).toBe(200);
      const parts = s.json.data.parts as Array<{ part_no: number; question_ids: string[] }>;
      return { id, parts, section: s.json.data };
    }

    it('AC-15: Speaking dirakit 4 soal part 1, 1 soal part 2, 4 soal part 3', async () => {
      const { section, parts } = await speakingSim();
      expect(parts.map((p) => [p.part_no, p.question_ids.length])).toEqual([[1, 4], [2, 1], [3, 4]]);
      expect(section.questions).toHaveLength(9);
      const byPart = (n: number) => section.questions.filter((q: any) => q.ai_task?.part === n).length;
      expect([byPart(1), byPart(2), byPart(3)]).toEqual([4, 1, 4]);
    });

    it('AC-15: skor tiap part diterima selama Speaking belum GRADED; setelah tiga part bernilai (GRADED) pengiriman ditolak 409 ATTEMPT_NOT_ACTIVE', async () => {
      const { id, parts } = await speakingSim();
      const first = (n: number) => parts.find((p) => p.part_no === n)!.question_ids[0]!;

      const p1 = await postSpeaking(user, id, first(1), 1, 6);
      expect(p1.status).toBe(201);
      expect(p1.json.data.submission).toMatchObject({ kind: 'SPEAKING_PART1', status: 'GRADED', question_id: first(1) });
      expect((await getResult(user, id)).json.data.sections[0].status).not.toBe('GRADED');
      // kirim ulang part yang sama sebelum GRADED tetap diterima (nilai terbaru dipakai)
      const p1b = await postSpeaking(user, id, first(1), 1, 6.5);
      expect(p1b.status).toBe(201);
      expect(p1b.json.data.evaluation.run_number).toBe(2);

      expect((await postSpeaking(user, id, first(2), 2, 7)).status).toBe(201);
      let res = await getResult(user, id);
      expect(res.json.data.sections[0]).toMatchObject({ section: 'SPEAKING', band: null });
      expect(res.json.data.sections[0].status).not.toBe('GRADED');
      expect(res.json.data.sections[0].detail).toMatchObject({ part1_band: 6.5, part2_band: 7, part3_band: null });

      expect((await postSpeaking(user, id, first(3), 3, 7)).status).toBe(201);
      res = await getResult(user, id);
      expect(res.json.data.sections[0]).toMatchObject({
        status: 'GRADED',
        band: computeSpeakingBand(6.5, 7, 7),
        detail: { part1_band: 6.5, part2_band: 7, part3_band: 7 },
      });
      expect(computeSpeakingBand(6.5, 7, 7)).toBe(7);
      expect((await getSim(user, id)).json.data.status).toBe('GRADED');

      // sesudah GRADED: ditolak
      const late = await postSpeaking(user, id, first(1), 1, 5);
      expect(late.status).toBe(409);
      expect(late.json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    });

    it('AC-15: attempt ABANDONED menolak skor Speaking dengan 409 ATTEMPT_NOT_ACTIVE', async () => {
      const { id, parts } = await speakingSim();
      expect((await abandonSim(user, id)).status).toBe(204);
      const r = await postSpeaking(user, id, parts[0]!.question_ids[0]!, 1);
      expect(r.status).toBe(409);
      expect(r.json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    });

    it('AC-15: attempt sudah GRADED karena section non-Speaking selesai, tetapi Speaking belum GRADED -> skor Speaking masih diterima', async () => {
      const { id, parts } = await speakingSim(['WRITING', 'SPEAKING']);
      await startSection(user, id, 'WRITING');
      const sub = await submitSection(user, id, 'WRITING'); // Writing kosong -> band 0, GRADED
      expect(sub.json.data).toMatchObject({ status: 'GRADED', attempt_status: 'GRADED' });
      const r = await postSpeaking(user, id, parts[0]!.question_ids[0]!, 1);
      expect(r.status).toBe(201);
    });

    it('AC-15: attempt AWAITING_GRADING (Writing menunggu nilai mandiri) tetap menerima skor Speaking', async () => {
      process.env.AI_ENABLED = 'false';
      const { id, parts } = await speakingSim(['WRITING', 'SPEAKING']);
      const w = await startSection(user, id, 'WRITING');
      const t1 = w.json.data.parts[0].question_ids[0] as string;
      expect((await postWriting(user, id, t1, 'WRITING_TASK1')).status).toBe(202);
      const sub = await submitSection(user, id, 'WRITING');
      expect(sub.json.data.attempt_status).toBe('AWAITING_GRADING');
      const r = await postSpeaking(user, id, parts[0]!.question_ids[0]!, 1);
      expect(r.status).toBe(201);
    });
  });
});
