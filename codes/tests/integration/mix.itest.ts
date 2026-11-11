/* eslint-disable @typescript-eslint/no-explicit-any */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { AttemptResponseSchema, AttemptResultResponseSchema } from '@/contracts/attempts';
import { ActiveMixSessionResponseSchema, MixSessionResponseSchema } from '@/contracts/mix';
import { BanksResponseSchema } from '@/contracts/question-bank';
import { closeDb, execute, getDb } from '@/server/db';
import { consume, resetRateLimits } from '@/server/http/rate-limit';
import { runImport } from '@/server/content/import-service';
import { waitForQueueIdle } from '@/server/jobs/queue';
import { GET as banksRoute } from '@/app/api/v1/banks/route';
import { POST as mixRoute } from '@/app/api/v1/mix-sessions/route';
import { GET as activeRoute } from '@/app/api/v1/mix-sessions/active/route';
import { GET as getRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as submitRoute } from '@/app/api/v1/attempts/[attempt_id]/submit/route';
import { GET as resultRoute } from '@/app/api/v1/attempts/[attempt_id]/result/route';
import { POST as writingRoute } from '@/app/api/v1/submissions/writing/route';
import { POST as externalRoute } from '@/app/api/v1/submissions/speaking-external/route';
import { ensureUserStats } from '@/server/gamification/service';
import { ensureProgressRows } from '@/server/gatekeeping/service';
import { call, learnerSession } from './helpers';

const db = getDb();
const BANK_DIR = path.resolve('content', 'gt-bank');
// Bank Listening merujuk aset audio yang didaftarkan paket gt-listening: impor paket aset dulu (urutan sama dengan content:import:all).
const LISTENING_DIR = path.resolve('content', 'gt-listening');
type L = Awaited<ReturnType<typeof learnerSession>>;

const mix = (u: L | null, body: unknown) => call(mixRoute, 'POST', '/api/v1/mix-sessions', { cookie: u?.cookie, body });
const getAttempt = (u: L, id: string) => call(getRoute, 'GET', `/api/v1/attempts/${id}`, { cookie: u.cookie, params: { attempt_id: id } });
const put = (u: L, id: string, qid: string, response: unknown) =>
  call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${qid}`, { cookie: u.cookie, params: { attempt_id: id, question_id: qid }, body: { response } });
const submit = (u: L, id: string) => call(submitRoute, 'POST', `/api/v1/attempts/${id}/submit`, { cookie: u.cookie, params: { attempt_id: id } });
const result = (u: L, id: string) => call(resultRoute, 'GET', `/api/v1/attempts/${id}/result`, { cookie: u.cookie, params: { attempt_id: id } });
const rows = async (q: ReturnType<typeof sql>) => (await execute(db, q)).rows as any[];

/** Kunci jawaban benar dari DB (state snapshot) untuk soal objektif tersaji, memetakan teks -> option_id. */
async function answerCorrectly(u: L, attemptId: string, qid: string, dto: any, right: boolean) {
  const pub = dto.questions.find((q: any) => q.question_id === qid);
  const st = (await rows(sql`SELECT state FROM attempts WHERE id = ${attemptId}`))[0].state;
  const full = (typeof st === 'string' ? JSON.parse(st) : st).questions.find((q: any) => q.question_id === qid).question;
  if (pub.options) {
    const want = right ? full.correct_answers : full.options.filter((o: string) => !full.correct_answers.includes(o)).slice(0, full.correct_answers.length);
    const ids = want.map((t: string) => pub.options.find((o: any) => o.text === t).option_id);
    return put(u, attemptId, qid, { option_ids: ids });
  }
  if (pub.fixed_choices) {
    const wrong = full.correct_answers[0] === 'True' ? 'False' : 'True';
    return put(u, attemptId, qid, { choice: right ? full.correct_answers[0] : wrong });
  }
  if (pub.question_type === 'FILL_IN_BLANK' || pub.question_type === 'SHORT_ANSWER') return put(u, attemptId, qid, { text: right ? full.correct_answers[0] : 'zzz' });
  if (pub.tokens) return put(u, attemptId, qid, { token_indexes: right ? full.correct_answers : [0] });
  throw new Error(`tipe belum didukung helper: ${pub.question_type}`);
}

/** Impor sah: exit 0, atau exit 2 yang semata-mata karena bank Listening belum lolos uji dengar human (C-30). */
function expectImportOk(r: { exitCode: number; lines: string[]; banks?: unknown[] }) {
  const onlyReviewGate =
    r.exitCode === 2 && (r.banks?.length ?? 0) > 0 && r.lines.some((l) => /^listening_review_(missing|stale):/.test(l));
  expect(r.exitCode === 0 || onlyReviewGate, r.lines.join('\n')).toBe(true);
}

beforeAll(async () => {
  const assets = await runImport(db, { dir: LISTENING_DIR, publish: true, dryRun: false, actorUserId: null });
  expect(assets.exitCode, assets.lines.join('\n')).toBe(0);
  const out = await runImport(db, { dir: BANK_DIR, publish: true, dryRun: false, actorUserId: null });
  expectImportOk(out);
});
afterAll(async () => {
  await execute(db, sql`DELETE FROM attempts`);
  await execute(db, sql`DELETE FROM assessment_sets WHERE assessment_type = 'QUESTION_BANK'`);
  await closeDb();
});
beforeEach(async () => {
  resetRateLimits();
  await execute(db, sql`DELETE FROM attempts`);
  process.env.AI_ENABLED = 'true';
  process.env.LLM_DRIVER = 'mock';
});
afterEach(async () => {
  await waitForQueueIdle();
  delete process.env.AI_ENABLED;
  delete process.env.LLM_DRIVER;
});

describe('impor bank lewat CLI service (AC-12, AC-11c)', () => {
  it('bank awal terimpor dan terbit; hitungan per kind sesuai AC-2', async () => {
    const r = await rows(sql`SELECT bank_kind, sum(question_count) AS n, min(status) AS st FROM assessment_sets WHERE assessment_type = 'QUESTION_BANK' GROUP BY bank_kind`);
    const by = Object.fromEntries(r.map((x) => [x.bank_kind, Number(x.n)]));
    expect(by).toMatchObject({ WRITING_GT_T1_FORMAL: 6, WRITING_GT_T1_SEMI: 6, WRITING_GT_T1_INFORMAL: 6, WRITING_GT_T2: 20, SPEAKING_P1: 30, SPEAKING_P2: 20, SPEAKING_P3: 24, READING_GT_S1: 50, READING_GT_S2: 47, READING_GT_S3: 39 }); // termasuk bank simulasi (SIM) dan bank pelengkap
    expect(by.GRAMMAR_GT_REGISTER).toBeGreaterThanOrEqual(16);
    // Bank Listening terbit hanya setelah uji dengar human (reviews/*.review.json), jadi tidak ikut diperiksa di sini (C-30).
    expect(r.filter((x) => !String(x.bank_kind).startsWith('LISTENING_')).every((x) => x.st === 'PUBLISHED')).toBe(true);
  });

  it('run kedua tanpa perubahan = semua NOOP; satu soal diubah = UPDATE dan version naik 1', async () => {
    const again = await runImport(db, { dir: BANK_DIR, publish: true, dryRun: false, actorUserId: null });
    expectImportOk(again);
    expect(again.banks!.every((b) => b.action === 'NOOP')).toBe(true);

    const tmp = mkdtempSync(path.join(tmpdir(), 'bank-'));
    cpSync(BANK_DIR, tmp, { recursive: true });
    const f = path.join(tmp, 'speaking.json');
    const j = JSON.parse(readFileSync(f, 'utf8'));
    j.banks[0].questions[0].prompt = `${j.banks[0].questions[0].prompt} (revisi)`;
    writeFileSync(f, JSON.stringify(j));
    const before = (await rows(sql`SELECT version FROM assessment_sets WHERE bank_code = ${j.banks[0].bank_code}`))[0].version;
    const upd = await runImport(db, { dir: tmp, publish: true, dryRun: false, actorUserId: null });
    expectImportOk(upd);
    expect(upd.banks!.filter((b) => b.action === 'UPDATE').map((b) => b.bank_code)).toEqual([j.banks[0].bank_code]);
    expect((await rows(sql`SELECT version, status FROM assessment_sets WHERE bank_code = ${j.banks[0].bank_code}`))[0]).toEqual({ version: before + 1, status: 'PUBLISHED' });
    // pulihkan isi asli agar tes lain tidak terpengaruh
    await runImport(db, { dir: BANK_DIR, publish: true, dryRun: false, actorUserId: null });
  });

  it('bank Listening pending_audio diimpor sebagai DRAFT walau --publish (AC-11c) dan bank invalid ditolak tanpa menulis', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'bank-l-'));
    const q = (id: string) => ({ question_id: id, question_type: 'MCQ_SINGLE', skill: 'LISTENING', prompt: 'Siapa pembicara?', options: ['A', 'B'], correct_answers: ['A'], explanation_id: 'Karena A.', difficulty: 2 });
    const bank = (over: Record<string, unknown>) => ({ bank_code: 'GT-L-S1-TEST', bank_kind: 'LISTENING_GT_S1', title: 'Listening S1 uji', skill: 'LISTENING', exam_module: 'GENERAL_TRAINING', origin: 'ORIGINAL_AUTHORED', questions: [q('Q-GTLS1-001')], ...over });
    writeFileSync(path.join(tmp, 'l.json'), JSON.stringify({ bank_contract_version: '1.0', banks: [bank({ pending_audio: true })] }));
    const ok = await runImport(db, { dir: tmp, publish: true, dryRun: false, actorUserId: null });
    expect(ok.exitCode, ok.lines.join('\n')).toBe(0);
    expect((await rows(sql`SELECT status, listening_asset_id FROM assessment_sets WHERE bank_code = 'GT-L-S1-TEST'`))[0]).toEqual({ status: 'DRAFT', listening_asset_id: null });

    writeFileSync(path.join(tmp, 'l.json'), JSON.stringify({ bank_contract_version: '1.0', banks: [bank({ bank_code: 'GT-L-S1-BAD', listening_asset_code: 'audio/tidak-ada' })] }));
    const bad = await runImport(db, { dir: tmp, publish: true, dryRun: false, actorUserId: null });
    expect(bad.exitCode).toBe(1);
    expect(bad.lines.join('\n')).toContain('listening_asset_unregistered');
    expect(await rows(sql`SELECT 1 FROM assessment_sets WHERE bank_code = 'GT-L-S1-BAD'`)).toHaveLength(0);

    // Listening PUBLISHED (disuntik langsung) muncul di /banks tetapi tidak dapat dipilih
    await execute(db, sql`UPDATE assessment_sets SET status = 'PUBLISHED' WHERE bank_code = 'GT-L-S1-TEST'`);
  });
});

describe('GET /banks (AC-8, AC-10, AC-15)', () => {
  it('401 tanpa sesi; 200 dengan skema, tanpa kunci jawaban, Listening selectable_in_mix=false, DRAFT tidak tampil', async () => {
    expect((await call(banksRoute, 'GET', '/api/v1/banks')).status).toBe(401);
    const u = await learnerSession();
    await execute(db, sql`UPDATE assessment_sets SET status = 'DRAFT' WHERE bank_code = 'GT-SPK-P3'`);
    const r = await call(banksRoute, 'GET', '/api/v1/banks', { cookie: u.cookie });
    expect(r.status).toBe(200);
    expect(BanksResponseSchema.safeParse(r.json).success).toBe(true);
    const codes = r.json.data.map((b: any) => b.bank_code);
    expect(codes).not.toContain('GT-SPK-P3');
    const listening = r.json.data.find((b: any) => b.bank_code === 'GT-L-S1-TEST');
    expect(listening).toMatchObject({ skill: 'LISTENING', selectable_in_mix: false });
    const rd = r.json.data.find((b: any) => b.bank_code === 'GT-RD-S1-EVERYDAY');
    expect(rd).toMatchObject({ question_count: 8, has_passage: true, selectable_in_mix: true });
    expect(rd.question_types[0]).toEqual({ question_type: 'TFNG', count: 3 });
    const txt = JSON.stringify(r.json);
    for (const s of ['correct_answers', 'explanation_id', 'rng_seed']) expect(txt).not.toContain(s);
    await execute(db, sql`UPDATE assessment_sets SET status = 'PUBLISHED' WHERE bank_code = 'GT-SPK-P3'`);
  });
});

describe('POST /mix-sessions', () => {
  it('401 tanpa sesi; 400 validasi dengan kode spec; 415 bukan JSON', async () => {
    expect((await mix(null, { count: 10, mode: 'MANUAL' })).status).toBe(401);
    const u = await learnerSession();
    const codeOf = async (body: unknown) => {
      const r = await mix(u, body);
      expect(r.status, JSON.stringify(r.json)).toBe(400);
      return r.json.error.details[0].code as string;
    };
    expect(await codeOf({ count: 10, mode: 'MANUAL', user_id: 'x' })).toBe('unrecognized_key');
    expect(await codeOf({ count: 4, mode: 'MANUAL' })).toBe('too_small');
    expect(await codeOf({ count: 41, mode: 'MANUAL' })).toBe('too_big');
    expect(await codeOf({ count: 7.5, mode: 'MANUAL' })).toBe('invalid_type');
    expect(await codeOf({ count: 10, mode: 'MANUAL', skills: ['LISTENING'] })).toBe('invalid_value');
    expect(await codeOf({ count: 10, mode: 'MANUAL', bank_kinds: ['LISTENING_GT_S1'] })).toBe('invalid_value');
    expect(await codeOf({ count: 10, mode: 'MANUAL', difficulty_min: 4, difficulty_max: 2 })).toBe('difficulty_range_invalid');
    expect(await codeOf({ count: 10, mode: 'RANDOM' })).toBe('invalid_value');
    const r = await call(mixRoute, 'POST', '/api/v1/mix-sessions', { cookie: u.cookie, rawBody: 'x', headers: { 'content-type': 'text/plain' } });
    expect(r.status).toBe(415);
  });

  it('AC-3: MANUAL GRAMMAR count 10 -> 10 soal unik GRAMMAR; seed sama -> daftar identik', async () => {
    const u = await learnerSession();
    const a = await mix(u, { skills: ['GRAMMAR'], count: 10, mode: 'MANUAL', seed: 'a1' });
    expect(a.status, JSON.stringify(a.json)).toBe(201);
    expect(MixSessionResponseSchema.safeParse(a.json).success).toBe(true);
    expect(a.json.data).toMatchObject({ question_count: 10, mode: 'MANUAL', passage_count: 0, ai_item_count: 0 });
    const ids = async (attemptId: string) => (await getAttempt(u, attemptId)).json.data.questions.map((q: any) => [q.question_id, q.skill]);
    const first = await ids(a.json.data.attempt_id);
    expect(new Set(first.map((x: any) => x[0])).size).toBe(10);
    expect(first.every((x: any) => x[1] === 'GRAMMAR')).toBe(true);
    const b = await mix(u, { skills: ['GRAMMAR'], count: 10, mode: 'MANUAL', seed: 'a1' });
    expect((await ids(b.json.data.attempt_id)).map((x: any) => x[0])).toEqual(first.map((x: any) => x[0]));
  });

  it('AC-6: Writing saja, count 5 -> 422 max_available:1; Writing+Speaking+Grammar count 40 -> maks 1 tiap AI', async () => {
    const u = await learnerSession();
    const r = await mix(u, { skills: ['WRITING'], count: 5, mode: 'MANUAL' });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe('MIX_NOT_ENOUGH_QUESTIONS');
    expect(r.json.error.details[0]).toMatchObject({ path: 'count', code: 'max_available:1', message: 'Hanya 1 soal tersedia untuk filter ini.' });
    // sesi lama tidak ter-ABANDON oleh permintaan yang gagal (transaksi di-rollback)
    const ok = await mix(u, { skills: ['GRAMMAR', 'WRITING', 'SPEAKING'], count: 18, mode: 'MANUAL', seed: 's' });
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    expect(ok.json.data.ai_item_count).toBeLessThanOrEqual(2);
    const qs = (await getAttempt(u, ok.json.data.attempt_id)).json.data.questions;
    expect(qs.filter((q: any) => q.question_type === 'WRITING_TASK').length).toBeLessThanOrEqual(1);
    expect(qs.filter((q: any) => q.question_type === 'SPEAKING_TASK').length).toBeLessThanOrEqual(1);
    const failed = await mix(u, { skills: ['WRITING'], count: 5, mode: 'MANUAL' });
    expect(failed.status).toBe(422);
    expect((await rows(sql`SELECT status FROM attempts WHERE id = ${ok.json.data.attempt_id}`))[0].status).toBe('IN_PROGRESS');
  });

  it('AC-9 + passage_index: bank Reading satu teks 8 soal, count 5 -> 5 soal pertama paket, teks utuh tanpa pemisah, passage_count 1', async () => {
    // D4 menang atas kalimat AC-9 lama: satuan Reading = paket (bank, passage_no). Bank fixture ini satu teks 8 soal;
    // bank awal repo (S1: 3/3/2, S2: 4/4) dibuktikan terpisah di bawah (paket utuh per passage_no).
    // Bank simulasi S3 (GT-RD-S3-SIM) disisihkan agar hanya bank uji yang bertipe READING_GT_S3.
    await execute(db, sql`UPDATE assessment_sets SET status = 'DRAFT' WHERE bank_code LIKE 'GT-RD-S3-SIM%'`);
    const tmp = mkdtempSync(path.join(tmpdir(), 'bank-r-'));
    const qs = Array.from({ length: 8 }, (_, i) => ({ question_id: `Q-GTRT-00${i + 1}`, question_type: 'TFNG', skill: 'READING', prompt: `Pernyataan ${i + 1} benar?`, correct_answers: ['True'], explanation_id: 'Lihat teks.', difficulty: 2, passage_no: 1 }));
    writeFileSync(path.join(tmp, 'r.json'), JSON.stringify({ bank_contract_version: '1.0', banks: [{ bank_code: 'GT-RD-S3-TEST', bank_kind: 'READING_GT_S3', title: 'Reading uji', skill: 'READING', exam_module: 'GENERAL_TRAINING', origin: 'ORIGINAL_AUTHORED', reading_passage_markdown: 'Teks tunggal untuk pengujian.', questions: qs }] }));
    const imp = await runImport(db, { dir: tmp, publish: true, dryRun: false, actorUserId: null });
    expect(imp.exitCode, imp.lines.join('\n')).toBe(0);
    const u = await learnerSession();
    const r = await mix(u, { bank_kinds: ['READING_GT_S3'], count: 5, mode: 'MANUAL', seed: 'rd' });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json.data.passage_count).toBe(1);
    const dto = (await getAttempt(u, r.json.data.attempt_id)).json.data;
    expect(AttemptResponseSchema.safeParse({ data: dto }).success).toBe(true);
    expect(dto.questions.map((q: any) => q.question_id)).toEqual(['Q-GTRT-001', 'Q-GTRT-002', 'Q-GTRT-003', 'Q-GTRT-004', 'Q-GTRT-005']);
    expect(dto.passages).toHaveLength(1);
    expect(dto.passages[0]).toMatchObject({ passage_no: 1, markdown: 'Teks tunggal untuk pengujian.' });
    expect(dto.questions.every((q: any) => q.passage_index === 0 && q.bank_code === 'GT-RD-S3-TEST')).toBe(true);
    await execute(db, sql`DELETE FROM attempts`);
    await execute(db, sql`DELETE FROM assessment_sets WHERE bank_code = 'GT-RD-S3-TEST'`);
    await execute(db, sql`UPDATE assessment_sets SET status = 'PUBLISHED' WHERE bank_code LIKE 'GT-RD-S3-SIM%'`);

    // Bank asli S1 (paket 3/3/2): setiap paket yang terbawa utuh kecuali yang terpotong di akhir; soal satu paket berurutan.
    const SIZE: Record<number, number> = { 1: 3, 2: 3, 3: 2 };
    await execute(db, sql`UPDATE assessment_sets SET status = 'DRAFT' WHERE bank_code LIKE 'GT-RD-S1-SIM%'`); // ukuran paket bank simulasi berbeda
    for (const seed of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      const m = await mix(u, { bank_kinds: ['READING_GT_S1'], count: 5, mode: 'MANUAL', seed });
      expect(m.status).toBe(201);
      const d = (await getAttempt(u, m.json.data.attempt_id)).json.data;
      expect(d.questions).toHaveLength(5);
      const groups: Array<{ no: number; n: number }> = [];
      for (const q of d.questions) {
        const last = groups[groups.length - 1];
        if (last && last.no === q.passage_no) last.n++;
        else groups.push({ no: q.passage_no, n: 1 });
      }
      expect(new Set(groups.map((g) => g.no)).size).toBe(groups.length); // satu paket tidak terpecah/ganda
      groups.slice(0, -1).forEach((g) => expect(g.n).toBe(SIZE[g.no])); // paket non-terakhir utuh
      expect(groups[groups.length - 1]!.n).toBeLessThanOrEqual(SIZE[groups[groups.length - 1]!.no]!);
      expect(m.json.data.passage_count).toBe(groups.length);
      expect(d.passages).toHaveLength(groups.length);
    }
    const real = await mix(u, { bank_kinds: ['READING_GT_S1'], count: 5, mode: 'MANUAL', seed: 'rd' });
    expect(real.status).toBe(201);
    const rd = (await getAttempt(u, real.json.data.attempt_id)).json.data;
    expect(rd.passages.every((p: any) => !p.markdown.includes('===PASSAGE==='))).toBe(true);
    expect(real.json.data.passage_count).toBe(rd.passages.length);
    await execute(db, sql`UPDATE assessment_sets SET status = 'PUBLISHED' WHERE bank_code LIKE 'GT-RD-S1-SIM%'`);
    expect(dto.title).toContain('Latihan campur');
    expect(dto.time_limit_seconds).toBe(0);
    expect(dto.assessment_set_id).toBeNull();

    // Dua bank Reading + Grammar bercampur: setiap soal Reading menunjuk paket (passages[]) milik banknya.
    for (const seed of ['m1', 'm2', 'm3', 'm4']) {
      const m = await mix(u, { skills: ['READING', 'GRAMMAR'], count: 30, mode: 'MANUAL', seed });
      expect(m.status).toBe(201);
      const d = (await getAttempt(u, m.json.data.attempt_id)).json.data;
      const byBank = new Map<string, number>(); // bank_code -> bank_set_id via passages order
      for (const q of d.questions.filter((x: any) => x.skill === 'READING')) {
        const p = d.passages[q.passage_index];
        expect(p, `passage_index ${q.passage_index}`).toBeDefined();
        expect(p.passage_no).toBe(q.passage_no);
        const key = q.bank_code + "#" + q.passage_no;
        const seen = byBank.get(key);
        if (seen === undefined) byBank.set(key, q.passage_index);
        else expect(seen).toBe(q.passage_index);
      }
      expect(d.questions.filter((x: any) => x.skill !== 'READING').every((x: any) => x.passage_index === null)).toBe(true);
      // urutan passages[] = urutan kemunculan pertama pada questions[]
      const order = [...new Set(d.questions.filter((x: any) => x.skill === 'READING').map((x: any) => x.passage_index))];
      expect(order).toEqual([...order].sort((a: any, b: any) => a - b));
    }
  });

  it('AC-10: bank DRAFT dan Listening tidak pernah terpilih', async () => {
    const u = await learnerSession();
    await execute(db, sql`UPDATE assessment_sets SET status = 'DRAFT' WHERE bank_code IN ('GT-GR-REGISTER', 'GT-GR-CORE')`);
    const r = await mix(u, { skills: ['GRAMMAR'], count: 5, mode: 'MANUAL' });
    expect(r.status).toBe(422);
    expect(r.json.error.details[0].code).toBe('max_available:0');
    await execute(db, sql`UPDATE assessment_sets SET status = 'PUBLISHED' WHERE bank_code IN ('GT-GR-REGISTER', 'GT-GR-CORE')`);
    const all = await mix(u, { count: 30, mode: 'MANUAL', seed: 'x' });
    expect(all.status, JSON.stringify(all.json)).toBe(201);
    const qs = (await getAttempt(u, all.json.data.attempt_id)).json.data.questions;
    expect(qs.some((q: any) => q.skill === 'LISTENING')).toBe(false);
  });

  it('M-1: POST /mix-sessions memakai bucket sendiri (mix_start 30/jam); drill (attempt_start) tidak terpengaruh', async () => {
    const u = await learnerSession();
    for (let i = 0; i < 30; i++) expect((await mix(u, { skills: ['GRAMMAR'], count: 5, mode: 'MANUAL' })).status).toBe(201);
    const limited = await mix(u, { skills: ['GRAMMAR'], count: 5, mode: 'MANUAL' });
    expect(limited.status).toBe(429);
    expect(consume('attempt_start', u.user.id)).toBeNull(); // kuota drill/ujian masih utuh
  });

  it('AC-13: sesi baru meng-ABANDON sesi IN_PROGRESS lama; hanya satu IN_PROGRESS; /active mengikuti', async () => {
    const u = await learnerSession();
    expect((await call(activeRoute, 'GET', '/api/v1/mix-sessions/active', { cookie: u.cookie })).json).toEqual({ data: null });
    expect((await call(activeRoute, 'GET', '/api/v1/mix-sessions/active')).status).toBe(401);
    const a = await mix(u, { skills: ['GRAMMAR'], count: 5, mode: 'MANUAL' });
    const act = await call(activeRoute, 'GET', '/api/v1/mix-sessions/active', { cookie: u.cookie });
    expect(ActiveMixSessionResponseSchema.safeParse(act.json).success).toBe(true);
    expect(act.json.data).toMatchObject({ attempt_id: a.json.data.attempt_id, mode: 'MANUAL', question_count: 5, answered_count: 0 });
    const b = await mix(u, { skills: ['GRAMMAR'], count: 5, mode: 'MANUAL' });
    expect(b.status).toBe(201);
    const st = await rows(sql`SELECT id, status FROM attempts WHERE user_id = ${u.user.id} AND assessment_type = 'MIX_PRACTICE'`);
    expect(st.find((x) => x.id === a.json.data.attempt_id).status).toBe('ABANDONED');
    expect(st.filter((x) => x.status === 'IN_PROGRESS')).toHaveLength(1);
    // indeks unik menolak IN_PROGRESS kedua bila transaksi dilanggar
    await expect(
      execute(db, sql`INSERT INTO attempts (user_id, assessment_type, assessment_version, mode, status, state) VALUES (${u.user.id}, 'MIX_PRACTICE', 0, 'PRACTICE', 'IN_PROGRESS', '{}')`),
    ).rejects.toThrow();
    // profil lain tidak melihat/menyentuh sesi ini
    const other = await learnerSession();
    expect((await getAttempt(other, b.json.data.attempt_id)).status).toBe(404);
    const bid = b.json.data.attempt_id as string;
    expect((await submit(other, bid)).status).toBe(404);
    expect((await result(other, bid)).status).toBe(404);
    const qid = (await getAttempt(u, bid)).json.data.questions[0].question_id as string;
    expect((await put(other, bid, qid, { choice: 'True' })).status).toBe(404);
    expect((await call(activeRoute, 'GET', '/api/v1/mix-sessions/active', { cookie: other.cookie })).json).toEqual({ data: null });
  });
});

describe('alur attempt MIX_PRACTICE sampai submit (AC-7, AC-8, AC-16)', () => {
  async function snapshot(userId: string) {
    return JSON.stringify([
      await rows(sql`SELECT * FROM user_tier_progress WHERE user_id = ${userId} ORDER BY tier_id`),
      await rows(sql`SELECT * FROM user_module_progress WHERE user_id = ${userId} ORDER BY module_id`),
      await rows(sql`SELECT * FROM user_sub_module_progress WHERE user_id = ${userId} ORDER BY sub_module_id`),
    ]);
  }

  /** Profil dengan progres nyata: baris user_*_progress terisi (sebagian bukan default) dan statistik/poin non-nol. */
  async function learnerWithRealProgress() {
    const u = await learnerSession();
    await ensureProgressRows(db, u.user.id);
    await ensureUserStats(db, u.user.id);
    await execute(db, sql`UPDATE user_tier_progress SET status = 'UNLOCKED', unlock_source = 'DEFAULT', boss_best_percent = 62.5 WHERE user_id = ${u.user.id} AND tier_id = (SELECT id FROM tiers WHERE tier_number = 1)`);
    await execute(db, sql`UPDATE user_module_progress SET status = 'IN_PROGRESS', skip_best_percent = 40 WHERE user_id = ${u.user.id} AND module_id = (SELECT id FROM modules ORDER BY module_code LIMIT 1)`);
    await execute(db, sql`UPDATE user_sub_module_progress SET status = 'COMPLETED', mastery_crown = 'SILVER', best_score_percent = 80, attempts_count = 3, learn_active_seconds = 321 WHERE user_id = ${u.user.id} AND sub_module_id = (SELECT id FROM sub_modules ORDER BY sub_module_code LIMIT 1)`);
    await execute(db, sql`UPDATE user_stats SET total_points = 120, daily_streak_days = 3, longest_daily_streak = 5, best_speed_streak = 4, silver_crowns = 1, last_active_date = ${Date.UTC(2026, 10, 7)} WHERE user_id = ${u.user.id}`);
    await execute(db, sql`INSERT INTO point_ledger (user_id, source, points, note) VALUES (${u.user.id}, 'ADJUSTMENT', 120, 'uji AC-7')`);
    return u;
  }
  const statsRows = (userId: string) =>
    Promise.all([rows(sql`SELECT * FROM user_stats WHERE user_id = ${userId}`), rows(sql`SELECT * FROM point_ledger WHERE user_id = ${userId} ORDER BY id`)]);

  it('MANUAL: jawab benar/salah dengan umpan balik, submit GRADED tanpa poin/lulus/band; gatekeeping tak berubah; radar terbarui', async () => {
    const u = await learnerWithRealProgress();
    const before = await snapshot(u.user.id);
    // bukti tidak tautologis: ada baris progres nyata dan statistik non-nol sebelum sesi
    const parsed = JSON.parse(before) as any[][];
    expect(parsed[0]!.length).toBeGreaterThan(0);
    expect(parsed[1]!.length).toBeGreaterThan(0);
    expect(parsed[2]!.some((r) => r.status === 'COMPLETED' && r.best_score_percent === 80 && r.mastery_crown === 'SILVER')).toBe(true);
    const stats0 = await statsRows(u.user.id);
    expect(stats0[0][0]).toMatchObject({ total_points: 120, daily_streak_days: 3 });
    const r = await mix(u, { skills: ['GRAMMAR'], count: 6, mode: 'MANUAL', seed: 'flow' });
    const id = r.json.data.attempt_id as string;
    const g = await getAttempt(u, id);
    const txt = JSON.stringify(g.json);
    for (const s of ['correct_answers', 'explanation_id', 'rng_seed']) expect(txt, s).not.toContain(s);
    const dto = g.json.data;

    const first = await answerCorrectly(u, id, dto.questions[0].question_id, dto, true);
    expect(first.status, JSON.stringify(first.json)).toBe(200);
    expect(first.json.data.feedback).toMatchObject({ is_correct: true });
    expect(first.json.data.feedback.explanation_id).toBeTruthy(); // baru muncul setelah dijawab
    const second = await answerCorrectly(u, id, dto.questions[1].question_id, dto, false);
    expect(second.json.data.feedback.is_correct).toBe(false);
    // attempt_answers.assessment_set_id = bank asal soal
    const ans = await rows(sql`SELECT a.assessment_set_id, s.bank_code FROM attempt_answers a JOIN assessment_sets s ON s.id = a.assessment_set_id WHERE a.attempt_id = ${id}`);
    expect(ans).toHaveLength(2);
    expect(ans.every((x) => /^GT-GR-/.test(String(x.bank_code)))).toBe(true);

    const s = await submit(u, id);
    expect(s.status, JSON.stringify(s.json)).toBe(200);
    expect(AttemptResultResponseSchema.safeParse(s.json).success).toBe(true);
    expect(s.json.data.attempt).toMatchObject({ status: 'GRADED', passed: null, band_score: null, points_awarded: 0, assessment_set_id: null, assessment_type: 'MIX_PRACTICE' });
    expect(s.json.data.attempt.raw_score).toBe(1);
    expect(s.json.data.attempt.max_score).toBe(6); // soal tak terjawab dihitung salah
    expect(s.json.data.mix.per_skill).toEqual([{ skill: 'GRAMMAR', answered: 2, correct: 1, percent: 50 }]);
    expect(s.json.data.mix.suggested_banks[0]).toMatchObject({ reason: 'SKILL_TERLEMAH' });
    expect(String(s.json.data.mix.suggested_banks[0].bank_code)).toMatch(/^GT-GR-/);
    expect((await result(u, id)).json.data.mix).toEqual(s.json.data.mix); // idempoten

    expect(await snapshot(u.user.id)).toBe(before);
    expect(await statsRows(u.user.id)).toEqual(stats0); // user_stats (poin, streak, mahkota) dan point_ledger identik
    const radar = await rows(sql`SELECT skill, sample_size FROM user_skill_scores WHERE user_id = ${u.user.id}`);
    expect(radar).toEqual([{ skill: 'GRAMMAR', sample_size: 2 }]);
    // attempt selesai: jawab lagi ditolak
    expect((await answerCorrectly(u, id, dto.questions[2].question_id, dto, true)).status).toBe(409);
  });

  it('submit tanpa jawaban objektif: GRADED, scorePercent 0, radar tidak berubah', async () => {
    const u = await learnerSession();
    const r = await mix(u, { skills: ['GRAMMAR'], count: 5, mode: 'MANUAL' });
    const s = await submit(u, r.json.data.attempt_id);
    expect(s.status).toBe(200);
    expect(s.json.data.attempt).toMatchObject({ status: 'GRADED', score_percent: 0 });
    expect(await rows(sql`SELECT 1 FROM user_skill_scores WHERE user_id = ${u.user.id}`)).toHaveLength(0);
  });

  it('AUTO_WEAKNESS: pengguna tanpa riwayat memakai bobot seragam dan tetap menghasilkan sesi; dengan radar lemah memilih skill itu lebih sering', async () => {
    const u = await learnerSession();
    const a = await mix(u, { count: 10, mode: 'AUTO_WEAKNESS', seed: 'auto' });
    expect(a.status, JSON.stringify(a.json)).toBe(201);
    expect(a.json.data.mode).toBe('AUTO_WEAKNESS');
    expect(a.json.data.question_count).toBe(10);

    const w = await learnerSession();
    await execute(db, sql`INSERT INTO user_skill_scores (user_id, skill, score_percent, estimated_band, sample_size) VALUES (${w.user.id}, 'GRAMMAR', 20, 3.0, 10), (${w.user.id}, 'READING', 90, 8.5, 10)`);
    let grammar = 0;
    let readingN = 0;
    for (let i = 0; i < 20; i++) {
      const m = await mix(w, { skills: ['GRAMMAR', 'READING'], count: 8, mode: 'AUTO_WEAKNESS', seed: `aw${i}` });
      const qs = (await getAttempt(w, m.json.data.attempt_id)).json.data.questions;
      grammar += qs.filter((q: any) => q.skill === 'GRAMMAR').length;
      readingN += qs.filter((q: any) => q.skill === 'READING').length;
    }
    expect(grammar).toBeGreaterThan(readingN);
  });

  it('AC-16: Writing dalam sesi campur -> 202 dan muncul di mix.ai_items; kind tak cocok 409 QUESTION_TYPE_MISMATCH; PUT 409; setelah submit 409 ATTEMPT_NOT_ACTIVE; Speaking eksternal', async () => {
    const u = await learnerSession();
    const r = await mix(u, { bank_kinds: ['WRITING_GT_T1_FORMAL', 'SPEAKING_P1'], count: 5, mode: 'MANUAL' });
    expect(r.status, JSON.stringify(r.json)).toBe(422); // kapasitas efektif = 1 + 1
    const ok = await mix(u, { bank_kinds: ['WRITING_GT_T1_FORMAL', 'SPEAKING_P1', 'GRAMMAR_GT_REGISTER'], count: 18, mode: 'MANUAL', seed: 'ai' });
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    const id = ok.json.data.attempt_id as string;
    const qs = (await getAttempt(u, id)).json.data.questions;
    const w = qs.find((q: any) => q.question_type === 'WRITING_TASK');
    const sp = qs.find((q: any) => q.question_type === 'SPEAKING_TASK');
    if (!w || !sp) throw new Error('seed uji harus memuat Writing dan Speaking');

    expect((await put(u, id, w.question_id, { text: 'x' })).json.error.code).toBe('QUESTION_REQUIRES_SUBMISSION');
    const text = 'Dear Ms Rivera, I am writing to raise a polite concern about the noise. '.repeat(12);
    const bad = await call(writingRoute, 'POST', '/api/v1/submissions/writing', { cookie: u.cookie, body: { kind: 'WRITING_TASK2', attempt_id: id, question_id: w.question_id, response_text: text } });
    expect(bad.status).toBe(409);
    expect(bad.json.error.code).toBe('QUESTION_TYPE_MISMATCH');
    const good = await call(writingRoute, 'POST', '/api/v1/submissions/writing', { cookie: u.cookie, body: { kind: 'WRITING_TASK1', attempt_id: id, question_id: w.question_id, response_text: text } });
    expect(good.status, JSON.stringify(good.json)).toBe(202);
    const ext = await call(externalRoute, 'POST', '/api/v1/submissions/speaking-external', {
      cookie: u.cookie,
      body: { kind: 'SPEAKING_PART1', attempt_id: id, question_id: sp.question_id, tool: 'CLAUDE', criteria_scores: { fluency: 6, lexical: 6, grammar: 6, pronunciation: 6 } },
    });
    expect(ext.status, JSON.stringify(ext.json)).toBe(201);
    await waitForQueueIdle();

    const s = await submit(u, id);
    expect(s.status).toBe(200);
    const ai = s.json.data.mix.ai_items as any[];
    expect(ai.find((x) => x.skill === 'WRITING')).toMatchObject({ question_id: w.question_id, submission_id: good.json.data.submission.id });
    expect(ai.find((x) => x.skill === 'SPEAKING')).toMatchObject({ question_id: sp.question_id, status: 'GRADED' });

    const late = await call(writingRoute, 'POST', '/api/v1/submissions/writing', { cookie: u.cookie, body: { kind: 'WRITING_TASK1', attempt_id: id, question_id: w.question_id, response_text: text } });
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    const lateExt = await call(externalRoute, 'POST', '/api/v1/submissions/speaking-external', {
      cookie: u.cookie,
      body: { kind: 'SPEAKING_PART1', attempt_id: id, question_id: sp.question_id, tool: 'CLAUDE', criteria_scores: { fluency: 6, lexical: 6, grammar: 6, pronunciation: 6 } },
    });
    expect(lateExt.json.error.code).toBe('ATTEMPT_NOT_ACTIVE');
  });

  it('bank diperbarui saat attempt berjalan: attempt memakai snapshot (versi lama)', async () => {
    const u = await learnerSession();
    const r = await mix(u, { skills: ['GRAMMAR'], count: 5, mode: 'MANUAL', seed: 'snap' });
    const id = r.json.data.attempt_id as string;
    const before = (await getAttempt(u, id)).json.data.questions.map((q: any) => q.prompt);
    await execute(db, sql`UPDATE assessment_sets SET questions_json = '[]', question_count = 0, version = version + 1 WHERE bank_code = 'GT-GR-REGISTER'`);
    const after = (await getAttempt(u, id)).json.data.questions.map((q: any) => q.prompt);
    expect(after).toEqual(before);
    // pulihkan bank
    await execute(db, sql`UPDATE assessment_sets SET content_hash = 'x' WHERE bank_code = 'GT-GR-REGISTER'`);
    await runImport(db, { dir: BANK_DIR, publish: true, dryRun: false, actorUserId: null });
  });
});
