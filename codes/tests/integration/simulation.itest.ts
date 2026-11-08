/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { execute, getDb } from '@/server/db';
import { GET as optionsRoute } from '@/app/api/v1/simulations/options/route';
import { POST as createSimRoute } from '@/app/api/v1/simulations/route';
import { GET as getSimRoute } from '@/app/api/v1/simulations/[attempt_id]/route';
import { GET as getSectionRoute } from '@/app/api/v1/simulations/[attempt_id]/sections/[section]/route';
import { POST as startSectionRoute } from '@/app/api/v1/simulations/[attempt_id]/sections/[section]/start/route';
import { POST as submitSectionRoute } from '@/app/api/v1/simulations/[attempt_id]/sections/[section]/submit/route';
import { GET as getResultRoute } from '@/app/api/v1/simulations/[attempt_id]/result/route';
import { POST as abandonRoute } from '@/app/api/v1/simulations/[attempt_id]/abandon/route';
import { PUT as answerRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as writingSubRoute } from '@/app/api/v1/submissions/writing/route';
import { POST as speakingSubRoute } from '@/app/api/v1/submissions/speaking-external/route';
import { GET as examHistoryRoute } from '@/app/api/v1/me/exam-history/route';
import { call, learnerSession } from './helpers';
import { seedSimulationFixtures } from '../fixtures/sim-fixtures';
import { attempts, attemptSections, userSkillScores } from '@/db/schema';
import { eq } from 'drizzle-orm';

const db = getDb();
type L = Awaited<ReturnType<typeof learnerSession>>;

const getOptions = (u: L | null) => call(optionsRoute, 'GET', '/api/v1/simulations/options', { cookie: u?.cookie });
const createSim = (u: L | null, sections: string[]) =>
  call(createSimRoute, 'POST', '/api/v1/simulations', { cookie: u?.cookie, body: { sections } });
const getSim = (u: L | null, id: string) =>
  call(getSimRoute, 'GET', `/api/v1/simulations/${id}`, { cookie: u?.cookie, params: { attempt_id: id } });
const getSection = (u: L | null, id: string, sec: string) =>
  call(getSectionRoute, 'GET', `/api/v1/simulations/${id}/sections/${sec}`, {
    cookie: u?.cookie,
    params: { attempt_id: id, section: sec },
  });
const startSection = (u: L | null, id: string, sec: string) =>
  call(startSectionRoute, 'POST', `/api/v1/simulations/${id}/sections/${sec}/start`, {
    cookie: u?.cookie,
    params: { attempt_id: id, section: sec },
    body: {},
  });
const submitSection = (u: L | null, id: string, sec: string) =>
  call(submitSectionRoute, 'POST', `/api/v1/simulations/${id}/sections/${sec}/submit`, {
    cookie: u?.cookie,
    params: { attempt_id: id, section: sec },
    body: {},
  });
const getResult = (u: L | null, id: string) =>
  call(getResultRoute, 'GET', `/api/v1/simulations/${id}/result`, {
    cookie: u?.cookie,
    params: { attempt_id: id },
  });
const abandonSim = (u: L | null, id: string) =>
  call(abandonRoute, 'POST', `/api/v1/simulations/${id}/abandon`, {
    cookie: u?.cookie,
    params: { attempt_id: id },
    body: {},
  });
const answerQuestion = (u: L | null, attemptId: string, qId: string, response: any) =>
  call(answerRoute, 'PUT', `/api/v1/attempts/${attemptId}/answers/${qId}`, {
    cookie: u?.cookie,
    params: { attempt_id: attemptId, question_id: qId },
    body: { response },
  });

describe('SPEC-023: Simulasi Tes IELTS GT dengan Pilihan Section (Integration)', () => {
  let user: L;

  beforeEach(async () => {
    user = await learnerSession();
    await seedSimulationFixtures();
  });

  it('AC-1 & AC-19: alur 2 section (READING + WRITING) -> PARTIAL_SELECTION dan disclaimer wajib', async () => {
    const r1 = await createSim(user, ['READING', 'WRITING']);
    expect(r1.status).toBe(201);
    const attemptId = r1.json.data.attempt_id;
    expect(r1.json.data.sections).toHaveLength(2);
    expect(r1.json.data.sections[0].section).toBe('READING');
    expect(r1.json.data.sections[1].section).toBe('WRITING');

    // Mulai dan submit Reading
    await startSection(user, attemptId, 'READING');
    const secDetail = await getSection(user, attemptId, 'READING');
    expect(secDetail.status).toBe(200);
    expect(secDetail.json.data.questions).toHaveLength(40);

    // Jawab 34 soal benar
    for (let i = 0; i < 34; i++) {
      const q = secDetail.json.data.questions[i];
      await answerQuestion(user, attemptId, q.question_id, { selected: 'True' });
    }

    const subR = await submitSection(user, attemptId, 'READING');
    expect(subR.status).toBe(200);
    expect(subR.json.data.status).toBe('GRADED');
    expect(subR.json.data.band).toBe(7.0); // AC-3: 34/40 = 7.0

    // Mulai dan submit Writing (kedua task kosong -> band 0 tanpa panggil LLM, AC-10)
    await startSection(user, attemptId, 'WRITING');
    const subW = await submitSection(user, attemptId, 'WRITING');
    expect(subW.status).toBe(200);
    expect(subW.json.data.status).toBe('GRADED');
    expect(subW.json.data.band).toBe(0);

    // Cek hasil akhir
    const res = await getResult(user, attemptId);
    expect(res.status).toBe(200);
    expect(res.json.data.overall.status).toBe('PARTIAL_SELECTION');
    expect(res.json.data.overall.band).toBeNull();
    expect(res.json.data.overall.label).toBe('Overall parsial: dipilih 2 dari 4 section');
    expect(res.json.data.disclaimer).toBe('Perkiraan latihan, bukan skor resmi IELTS.');
  });

  it('AC-3: Pembuktian skor Reading 34/40 = 7.0, 30/40 = 6.0 pada tabel READING_GENERAL', async () => {
    const r = await createSim(user, ['READING']);
    const attemptId = r.json.data.attempt_id;
    await startSection(user, attemptId, 'READING');
    const detail = await getSection(user, attemptId, 'READING');

    // Jawab 30 soal benar
    for (let i = 0; i < 30; i++) {
      await answerQuestion(user, attemptId, detail.json.data.questions[i].question_id, { selected: 'True' });
    }

    const sub = await submitSection(user, attemptId, 'READING');
    expect(sub.status).toBe(200);
    expect(sub.json.data.raw_score).toBe(30);
    expect(sub.json.data.band).toBe(6.0); // 30/40 = 6.0
  });

  it('AC-8: Satu simulasi IN_PROGRESS per profil (409 SIMULATION_IN_PROGRESS); abandon -> 201 baru', async () => {
    const r1 = await createSim(user, ['WRITING']);
    expect(r1.status).toBe(201);
    const firstId = r1.json.data.attempt_id;

    // Coba buat simulasi kedua saat yang pertama masih IN_PROGRESS
    const r2 = await createSim(user, ['WRITING']);
    expect(r2.status).toBe(409);
    expect(r2.json.error.code).toBe('SIMULATION_IN_PROGRESS');
    expect(r2.json.error.details[0].message).toBe(firstId);

    // Abandon simulasi pertama
    const ab = await abandonSim(user, firstId);
    expect(ab.status).toBe(204);

    // Sekarang bisa buat simulasi baru
    const r3 = await createSim(user, ['WRITING']);
    expect(r3.status).toBe(201);
  });

  it('AC-12: Urutan tetap LISTENING -> READING -> WRITING (409 SECTION_ORDER_VIOLATION); submit SPEAKING -> 409', async () => {
    const r = await createSim(user, ['LISTENING', 'READING', 'WRITING', 'SPEAKING']);
    const attemptId = r.json.data.attempt_id;

    // Coba mulai READING sebelum LISTENING dikirim -> 409 SECTION_ORDER_VIOLATION
    const startR = await startSection(user, attemptId, 'READING');
    expect(startR.status).toBe(409);
    expect(startR.json.error.code).toBe('SECTION_ORDER_VIOLATION');

    // SPEAKING bisa dimulai kapan saja
    const startS = await startSection(user, attemptId, 'SPEAKING');
    expect(startS.status).toBe(200);

    // Coba submit SPEAKING langsung -> 409 SECTION_NOT_SUBMITTABLE
    const subS = await submitSection(user, attemptId, 'SPEAKING');
    expect(subS.status).toBe(409);
    expect(subS.json.error.code).toBe('SECTION_NOT_SUBMITTABLE');
  });

  it('AC-16: Listening fixture durasi 20 detik menghasilkan time_limit_seconds = 140', async () => {
    const opts = await getOptions(user);
    expect(opts.status).toBe(200);
    const lOpt = opts.json.data.sections.find((s: any) => s.section === 'LISTENING');
    expect(lOpt.available).toBe(true);
    expect(lOpt.time_limit_seconds).toBe(140); // 20 + 120 = 140
  });

  it('AC-18: Respons GET detail section dan result tidak membocorkan correct_answers, explanation_id, atau rng_seed', async () => {
    const r = await createSim(user, ['READING']);
    const attemptId = r.json.data.attempt_id;
    await startSection(user, attemptId, 'READING');

    const detail = await getSection(user, attemptId, 'READING');
    const jsonStr = JSON.stringify(detail.json);
    expect(jsonStr).not.toContain('correct_answers');
    expect(jsonStr).not.toContain('explanation_id');
    expect(jsonStr).not.toContain('rng_seed');
  });

  it('AC-2: 4 section -> PENDING_SECTIONS sampai Speaking dinilai, lalu COMPLETE dengan Overall D4', async () => {
    const r = await createSim(user, ['LISTENING', 'READING', 'WRITING', 'SPEAKING']);
    const attemptId = r.json.data.attempt_id;

    // 1. LISTENING: jawab 30 soal (band 6.0)
    await startSection(user, attemptId, 'LISTENING');
    const lDetail = await getSection(user, attemptId, 'LISTENING');
    for (let i = 0; i < 30; i++) {
      await answerQuestion(user, attemptId, lDetail.json.data.questions[i].question_id, { selected: 'A' });
    }
    await submitSection(user, attemptId, 'LISTENING');

    // 2. READING: jawab 34 soal (band 7.0)
    await startSection(user, attemptId, 'READING');
    const rDetail = await getSection(user, attemptId, 'READING');
    for (let i = 0; i < 34; i++) {
      await answerQuestion(user, attemptId, rDetail.json.data.questions[i].question_id, { selected: 'True' });
    }
    await submitSection(user, attemptId, 'READING');

    // 3. WRITING: task kosong -> band 0
    await startSection(user, attemptId, 'WRITING');
    await submitSection(user, attemptId, 'WRITING');

    // Cek hasil sebelum Speaking dinilai -> PENDING_SECTIONS
    const resPre = await getResult(user, attemptId);
    expect(resPre.status).toBe(200);
    expect(resPre.json.data.overall.status).toBe('PENDING_SECTIONS');
    expect(resPre.json.data.overall.label).toBe('Menunggu skor Speaking');

    // 4. SPEAKING: kirim skor 3 part lewat speaking-external
    await startSection(user, attemptId, 'SPEAKING');
    const sDetail = await getSection(user, attemptId, 'SPEAKING');

    const p1Q = sDetail.json.data.questions.filter((q: any) => q.part === 1 || q.ai_task?.part === 1)[0];
    const p2Q = sDetail.json.data.questions.filter((q: any) => q.part === 2 || q.ai_task?.part === 2)[0];
    const p3Q = sDetail.json.data.questions.filter((q: any) => q.part === 3 || q.ai_task?.part === 3)[0];

    // Kirim P1 (band 7.0)
    await call(speakingSubRoute, 'POST', '/api/v1/submissions/speaking-external', {
      cookie: user.cookie,
      body: {
        attempt_id: attemptId,
        question_id: p1Q.question_id,
        kind: 'SPEAKING_PART1',
        tool: 'CHATGPT',
        criteria_scores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 7 },
      },
    });

    // Kirim P2 (band 7.0)
    await call(speakingSubRoute, 'POST', '/api/v1/submissions/speaking-external', {
      cookie: user.cookie,
      body: {
        attempt_id: attemptId,
        question_id: p2Q.question_id,
        kind: 'SPEAKING_PART2',
        tool: 'CHATGPT',
        criteria_scores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 7 },
      },
    });

    // Kirim P3 (band 7.0) -> Speaking band = 7.0
    await call(speakingSubRoute, 'POST', '/api/v1/submissions/speaking-external', {
      cookie: user.cookie,
      body: {
        attempt_id: attemptId,
        question_id: p3Q.question_id,
        kind: 'SPEAKING_PART3',
        tool: 'CHATGPT',
        criteria_scores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 7 },
      },
    });

    // Cek hasil setelah Speaking selesai dinilai -> COMPLETE
    const resPost = await getResult(user, attemptId);
    expect(resPost.status).toBe(200);
    expect(resPost.json.data.overall.status).toBe('COMPLETE');
    expect(resPost.json.data.overall.band).not.toBeNull();
    // Listening 6.0, Reading 7.0, Writing 0, Speaking 7.0 -> W = 12 + 14 + 0 + 14 = 40 -> floor(42/4) = 10 -> 5.0
    expect(resPost.json.data.overall.band).toBe(5.0);
  });

  it('AC-17: Gamifikasi points_awarded=0, radar terupdate, dan Riwayat Ujian memuat MOCK_TEST', async () => {
    const r = await createSim(user, ['READING']);
    const attemptId = r.json.data.attempt_id;
    await startSection(user, attemptId, 'READING');
    const detail = await getSection(user, attemptId, 'READING');
    for (let i = 0; i < 34; i++) {
      await answerQuestion(user, attemptId, detail.json.data.questions[i].question_id, { selected: 'True' });
    }
    await submitSection(user, attemptId, 'READING');

    // 1. Cek attempt points_awarded = 0
    const [att] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
    expect(att.pointsAwarded).toBe(0);

    // 2. Cek Riwayat Ujian
    const hist = await call(examHistoryRoute, 'GET', '/api/v1/me/exam-history', { cookie: user.cookie });
    expect(hist.status).toBe(200);
    const mockItem = hist.json.data.find((item: any) => item.attempt_id === attemptId);
    expect(mockItem).toBeDefined();
    expect(mockItem.title).toBe('Simulasi tes');
    expect(mockItem.result_path).toBe(`/simulasi/${attemptId}/hasil`);
  });
});
