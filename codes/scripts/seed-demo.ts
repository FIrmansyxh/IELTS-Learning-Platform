/**
 * Seed profil demo dengan riwayat lengkap (Tier 1-3 selesai, Tier 4 berjalan) untuk melihat dashboard yang terisi penuh.
 *
 * Pakai: npm run seed:demo           (membuat/mengganti profil "Demo Tier 4")
 *        npm run seed:demo -- --remove  (menghapus profil demo beserta datanya)
 *
 * Idempoten: profil demo lama (dan set ujian demo berstatus ARCHIVED) dihapus lalu dibuat ulang.
 * Hanya menyentuh profil bernama DEMO_NAME dan set ujian berjudul berawalan "[Demo]"; profil lain tidak berubah.
 * Data bersifat sintetis (skor acak deterministik), bukan hasil belajar sungguhan.
 */
import './_env';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, like } from 'drizzle-orm';
import * as s from '../src/db/schema';
import { closeDb, getDb, type Tx } from '../src/server/db';
import { recalculateObjectiveSkill } from '../src/server/skills/service';

const DEMO_NAME = 'Demo Tier 4';
const DAY = 24 * 60 * 60 * 1000;

/** PRNG deterministik agar hasil seed selalu sama. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toBand = (percent: number): number => Math.max(4, Math.min(8.5, Math.round((4 + (percent / 100) * 4.5) * 2) / 2));
const crownOf = (p: number): 'NONE' | 'SILVER' | 'GOLD' => (p >= 90 ? 'GOLD' : p >= 75 ? 'SILVER' : 'NONE');

async function removeDemo(tx: Tx): Promise<void> {
  const demo = await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.displayName, DEMO_NAME));
  for (const u of demo) await tx.delete(s.users).where(eq(s.users.id, u.id));
  await tx.delete(s.assessmentSets).where(like(s.assessmentSets.title, '[Demo]%'));
}

async function seed(tx: Tx): Promise<void> {
  const rand = rng(20261110);
  const now = Date.now();
  const at = (daysAgo: number, hour = 19) => new Date(now - daysAgo * DAY + (hour - 12) * 60 * 60 * 1000);

  await removeDemo(tx);

  const tiers = await tx.select().from(s.tiers).orderBy(asc(s.tiers.tierNumber));
  const mods = await tx.select().from(s.modules).orderBy(asc(s.modules.moduleCode));
  const subs = await tx.select().from(s.subModules).orderBy(asc(s.subModules.subModuleCode));
  const drills = await tx
    .select()
    .from(s.assessmentSets)
    .where(and(eq(s.assessmentSets.assessmentType, 'ACTIVE_DRILL'), eq(s.assessmentSets.status, 'PUBLISHED')));
  if (tiers.length < 4 || subs.length === 0) throw new Error('Konten kurikulum belum ada. Jalankan npm run db:seed dan content:import dulu.');

  const bandTables = await tx.select().from(s.bandConversionTables).where(eq(s.bandConversionTables.isActive, true));
  const bandTableIds = {
    LISTENING: bandTables.find((x) => x.skill === 'LISTENING')?.id ?? randomUUID(),
    READING_GENERAL: bandTables.find((x) => x.skill === 'READING_GENERAL')?.id ?? randomUUID(),
  };
  const userId = randomUUID();
  await tx.insert(s.users).values({
    id: userId,
    displayName: DEMO_NAME,
    targetBand: '7',
    placementCompletedAt: at(75),
    consentRecordingAt: at(75),
    lastLoginAt: at(0, 9),
    createdAt: at(76),
  });

  // ── Progres sub-modul, modul, tier ──
  const tierOf = new Map(mods.map((m) => [m.id, tiers.find((t) => t.id === m.tierId)!.tierNumber]));
  const modCodeOf = new Map(mods.map((m) => [m.id, m.moduleCode]));
  const totalSubs = subs.length;
  const tier4Subs = subs.filter((x) => tierOf.get(x.moduleId) === 4);
  const inProgressCode = tier4Subs[Math.max(0, tier4Subs.length - 2)]?.subModuleCode; // sedang dikerjakan
  const unlockedCode = tier4Subs[tier4Subs.length - 1]?.subModuleCode; // berikutnya

  let goldCount = 0;
  let silverCount = 0;
  let ledgerTotal = 0;
  const ledger: Array<typeof s.pointLedger.$inferInsert> = [];
  const subDoneAt = new Map<string, Date>();
  const skillSamples = new Map<string, number>();

  for (const [i, sm] of subs.entries()) {
    const tierNo = tierOf.get(sm.moduleId)!;
    const state: 'COMPLETED' | 'IN_PROGRESS' | 'UNLOCKED' | 'LOCKED' =
      sm.subModuleCode === unlockedCode ? 'UNLOCKED' : sm.subModuleCode === inProgressCode ? 'IN_PROGRESS' : 'COMPLETED';
    if (tierNo < 4 && state !== 'COMPLETED') continue;
    const daysAgo = Math.round(70 - (i / totalSubs) * 66);
    const done = at(daysAgo, 17 + Math.floor(rand() * 5));
    subDoneAt.set(sm.id, done);

    const base = tierNo === 1 ? 82 : tierNo === 2 ? 78 : tierNo === 3 ? 74 : 70;
    const completed = state === 'COMPLETED';
    const rawScore = Math.max(55, Math.min(100, Math.round(base + (rand() - 0.35) * 28)));
    const score = completed ? rawScore : Math.min(rawScore, 70); // belum lulus: tanpa mahkota
    const crown = completed ? crownOf(score) : 'NONE';
    if (crown === 'GOLD') goldCount += 1;
    if (crown === 'SILVER') silverCount += 1;

    await tx.insert(s.userSubModuleProgress).values({
      userId,
      subModuleId: sm.id,
      status: state,
      unlockSource: 'SEQUENTIAL',
      learnCompletedAt: state === 'UNLOCKED' ? null : done,
      miniTaskCompletedAt: completed ? done : null,
      learnActiveSeconds: state === 'UNLOCKED' ? 0 : 600 + Math.floor(rand() * 1500),
      learnVisitedSubtabs: state === 'UNLOCKED' ? [] : ['ARTICLE', 'VIDEO', 'SLIDES'],
      masteryCrown: crown,
      bestScorePercent: state === 'UNLOCKED' ? 0 : score,
      attemptsCount: state === 'UNLOCKED' ? 0 : 1 + Math.floor(rand() * 3),
      completedAt: completed ? done : null,
      updatedAt: done,
    });
    if (state === 'UNLOCKED') continue;

    // Attempt drill + jawaban (skor mengikuti best_score_percent) -> dasar radar.
    const set = drills.find((d) => d.subModuleId === sm.id);
    if (!set) continue;
    const qs = (set.questionsJson as Array<{ question_id: string; question_type: string; skill?: string }>) ?? [];
    const attemptId = randomUUID();
    const correctTarget = Math.round((score / 100) * qs.length);
    await tx.insert(s.attempts).values({
      id: attemptId,
      userId,
      assessmentSetId: set.id,
      assessmentType: 'ACTIVE_DRILL',
      assessmentVersion: set.version,
      mode: 'PRACTICE',
      status: completed || state === 'IN_PROGRESS' ? 'GRADED' : 'IN_PROGRESS',
      startedAt: new Date(done.getTime() - 25 * 60 * 1000),
      submittedAt: done,
      rawScore: String(correctTarget),
      maxScore: String(qs.length),
      scorePercent: String(score),
      passed: score >= sm.passingScorePercent,
      pointsAwarded: completed ? 10 + Math.round(score / 10) : 0,
      state: { v: 1, order: [], served: {}, pass_percent: sm.passingScorePercent },
      createdAt: new Date(done.getTime() - 25 * 60 * 1000),
      updatedAt: done,
    });
    for (const [qi, q] of qs.entries()) {
      const skill = (q.skill ?? set.skillCategory ?? null) as (typeof s.attemptAnswers.$inferInsert)['skill'];
      if (skill) skillSamples.set(skill, (skillSamples.get(skill) ?? 0) + 1);
      await tx.insert(s.attemptAnswers).values({
        attemptId,
        assessmentSetId: set.id,
        questionId: q.question_id,
        questionType: q.question_type,
        skill,
        response: {},
        isCorrect: qi < correctTarget,
        score: qi < correctTarget ? '1' : '0',
        timeSpentMs: 6000 + Math.floor(rand() * 20000),
        withinTargetTime: rand() > 0.3,
        speedStreakLen: qi < correctTarget ? (qi % 6) + 1 : 0,
        answeredAt: new Date(done.getTime() - (qs.length - qi) * 40 * 1000),
      });
    }
    if (completed) {
      const drillPts = 10 + Math.round(score / 10);
      ledger.push({ userId, source: 'DRILL', sourceId: attemptId, points: drillPts, note: `Drill ${sm.subModuleCode}`, createdAt: done });
      ledgerTotal += drillPts;
      if (crown !== 'NONE') {
        const pts = crown === 'GOLD' ? 100 : 50;
        ledger.push({ userId, source: 'CROWN', sourceId: sm.id, points: pts, note: `Mahkota ${crown === 'GOLD' ? 'Emas' : 'Perak'} ${sm.subModuleCode}`, createdAt: done });
        ledgerTotal += pts;
      }
    }
  }

  const modStatus = (m: (typeof mods)[number]): 'COMPLETED' | 'IN_PROGRESS' | 'UNLOCKED' => {
    const mine = subs.filter((x) => x.moduleId === m.id);
    const done = mine.every((x) => !(x.subModuleCode === inProgressCode || x.subModuleCode === unlockedCode));
    if (done) return 'COMPLETED';
    return mine.some((x) => x.subModuleCode === inProgressCode) ? 'IN_PROGRESS' : 'UNLOCKED';
  };
  for (const m of mods) {
    const st = modStatus(m);
    const last = subs.filter((x) => x.moduleId === m.id).map((x) => subDoneAt.get(x.id)).filter(Boolean).sort().pop() ?? at(1);
    await tx.insert(s.userModuleProgress).values({
      userId,
      moduleId: m.id,
      status: st,
      unlockSource: 'SEQUENTIAL',
      completedAt: st === 'COMPLETED' ? last : null,
      updatedAt: last,
    });
  }

  // ── Tier + Boss Exam (set demo ARCHIVED agar tidak muncul sebagai ujian nyata di peta) ──
  const bossPct = [84, 79, 76];
  const bossBand = [5.5, 6, 6.5];
  const bossDay = [58, 38, 16];
  for (const t of tiers) {
    const idx = t.tierNumber - 1;
    if (t.tierNumber === 4) {
      await tx.insert(s.userTierProgress).values({ userId, tierId: t.id, status: 'IN_PROGRESS', unlockSource: 'BOSS_PASS', updatedAt: at(15) });
      continue;
    }
    const passedAt = at(bossDay[idx]!);
    await tx.insert(s.userTierProgress).values({
      userId,
      tierId: t.id,
      status: 'COMPLETED',
      unlockSource: t.tierNumber === 1 ? 'PLACEMENT' : 'BOSS_PASS',
      bossBestPercent: String(bossPct[idx]),
      bossBestBand: String(bossBand[idx]),
      bossPassedAt: passedAt,
      completedAt: passedAt,
      updatedAt: passedAt,
    });
    const setId = randomUUID();
    await tx.insert(s.assessmentSets).values({
      id: setId,
      assessmentType: 'TIER_BOSS_EXAM',
      title: `[Demo] Boss Tier ${t.tierNumber}`,
      tierId: t.id,
      timeLimitSeconds: 5400,
      questionsJson: [],
      questionCount: 0,
      passPercent: 70,
      origin: 'ORIGINAL_AUTHORED',
      status: 'ARCHIVED',
    });
    const attemptId = randomUUID();
    await tx.insert(s.attempts).values({
      id: attemptId,
      userId,
      assessmentSetId: setId,
      assessmentType: 'TIER_BOSS_EXAM',
      assessmentVersion: 1,
      mode: 'EXAM',
      status: 'GRADED',
      startedAt: new Date(passedAt.getTime() - 80 * 60 * 1000),
      submittedAt: passedAt,
      rawScore: String(Math.round(bossPct[idx]! * 0.4)),
      maxScore: '40',
      scorePercent: String(bossPct[idx]),
      bandScore: String(bossBand[idx]),
      passed: true,
      pointsAwarded: 150,
      state: { v: 1, order: [], served: {}, pass_percent: 70 },
      resultJson: {
        v: 1,
        progress: null,
        skip: null,
        placement: null,
        boss: {
          passed: true,
          gate: { type: 'PERCENT', value: 70 },
          percent: bossPct[idx],
          boss_band: bossBand[idx],
          sections: (['LISTENING', 'READING', 'WRITING', 'SPEAKING'] as const).map((skill, k) => {
            const objective = skill === 'LISTENING' || skill === 'READING';
            const raw40 = Math.round(((bossPct[idx]! + (k - 1) * 3) / 100) * 40);
            return {
              skill,
              raw_score: objective ? raw40 : null,
              max_score: objective ? 40 : null,
              raw_40: objective ? raw40 : null,
              band: Math.max(4, bossBand[idx]! + (k === 2 ? -1 : k === 3 ? -0.5 : 0)),
              status: 'GRADED',
              submission_ids: [],
              counts_toward_gate: objective,
            };
          }),
          overall_band_estimate: bossBand[idx],
          pending_ai: 0,
          band_table_ids: { listening: bandTableIds.LISTENING, reading_academic: bandTableIds.READING_GENERAL },
          tier: { id: t.id, tier_number: t.tierNumber },
          next_tier_unlocked: true,
          unlocked: [{ kind: 'TIER', id: tiers[idx + 1]!.id, label: `Tier ${t.tierNumber + 1}` }],
          retry: { next_allowed_at: null, attempts_remaining_today: 3 },
          disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
        },
      },
      createdAt: new Date(passedAt.getTime() - 80 * 60 * 1000),
      updatedAt: passedAt,
    });
    ledger.push({ userId, source: 'BOSS', sourceId: attemptId, points: 150, note: `Boss Tier ${t.tierNumber} lulus`, createdAt: passedAt });
    ledgerTotal += 150;
    await tx.insert(s.userBandPredictions).values({
      userId,
      overallBand: String(bossBand[idx]),
      components: { LISTENING: bossBand[idx]! - 0.5, READING: bossBand[idx], WRITING: Math.max(4, bossBand[idx]! - 1), SPEAKING: bossBand[idx]! - 0.5 },
      trigger: 'BOSS',
      attemptId,
      createdAt: passedAt,
    });
  }

  // Skip Test modul (1 contoh) agar riwayat ujian bervariasi.
  const skipMod = mods.find((m) => tierOf.get(m.id) === 2);
  if (skipMod) {
    const skipSet = randomUUID();
    await tx.insert(s.assessmentSets).values({
      id: skipSet,
      assessmentType: 'SKIP_MODULE_TEST',
      title: `[Demo] Skip Test Modul ${modCodeOf.get(skipMod.id)}`,
      moduleId: skipMod.id,
      timeLimitSeconds: 1800,
      questionsJson: [],
      questionCount: 0,
      passPercent: 80,
      origin: 'ORIGINAL_AUTHORED',
      status: 'ARCHIVED',
    });
    const when = at(47);
    await tx.insert(s.attempts).values({
      userId,
      assessmentSetId: skipSet,
      assessmentType: 'SKIP_MODULE_TEST',
      assessmentVersion: 1,
      mode: 'EXAM',
      status: 'GRADED',
      startedAt: new Date(when.getTime() - 30 * 60 * 1000),
      submittedAt: when,
      rawScore: '17',
      maxScore: '25',
      scorePercent: '68',
      passed: false,
      pointsAwarded: 0,
      state: { v: 1, order: [], served: {}, pass_percent: 80 },
      createdAt: new Date(when.getTime() - 30 * 60 * 1000),
      updatedAt: when,
    });
  }

  // ── Simulasi tes (Reading) berskor naik ──
  const sims = [
    { day: 42, raw: 24, band: 5.5 },
    { day: 24, raw: 28, band: 6.5 },
    { day: 6, raw: 31, band: 7 },
  ];
  for (const sim of sims) {
    const attemptId = randomUUID();
    const when = at(sim.day, 20);
    await tx.insert(s.attempts).values({
      id: attemptId,
      userId,
      assessmentSetId: null,
      assessmentType: 'MOCK_TEST',
      assessmentVersion: 0,
      mode: 'EXAM',
      status: 'GRADED',
      startedAt: new Date(when.getTime() - 62 * 60 * 1000),
      submittedAt: when,
      rawScore: String(sim.raw),
      maxScore: '40',
      scorePercent: String(Math.round((sim.raw / 40) * 100)),
      bandScore: String(sim.band),
      pointsAwarded: 0,
      state: {
        schema: 'mock.v1',
        rng_seed: sim.day,
        v: 1,
        order: [],
        served: {},
        last_resume_at: when.toISOString(),
        sections: [{ section: 'READING', order: 1, time_limit_seconds: 3600, parts: [], questions: [] }],
      },
      createdAt: new Date(when.getTime() - 62 * 60 * 1000),
      updatedAt: when,
    });
    await tx.insert(s.attemptSections).values({
      attemptId,
      skill: 'READING',
      rawScore: String(sim.raw),
      maxScore: '40',
      bandScore: String(sim.band),
      status: 'GRADED',
      timeLimitSeconds: 3600,
      startedAt: new Date(when.getTime() - 62 * 60 * 1000),
      submittedAt: when,
    });
  }

  // ── Radar: hitung ulang dari jawaban nyata; Writing/Speaking (dinilai AI) diisi langsung ──
  for (const sk of ['LISTENING', 'READING', 'GRAMMAR', 'VOCAB'] as const) await recalculateObjectiveSkill(tx, userId, sk);
  const have = new Set((await tx.select({ k: s.userSkillScores.skill }).from(s.userSkillScores).where(eq(s.userSkillScores.userId, userId))).map((r) => r.k));
  const manual: Array<[(typeof s.userSkillScores.$inferInsert)['skill'], number, number]> = [
    ['LISTENING', 71, 6],
    ['READING', 79, 6.5],
    ['WRITING', 66, 6],
    ['SPEAKING', 72, 6.5],
    ['GRAMMAR', 81, 6.5],
    ['VOCAB', 76, 6.5],
  ];
  for (const [skill, pct, bnd] of manual) {
    if (have.has(skill)) continue;
    await tx.insert(s.userSkillScores).values({ userId, skill, scorePercent: String(pct), estimatedBand: String(bnd), sampleSize: skill === 'WRITING' || skill === 'SPEAKING' ? 6 : 12 });
  }
  void toBand;

  // Prediksi RECALC terbaru (menutup riwayat prediksi).
  const scores = await tx.select().from(s.userSkillScores).where(eq(s.userSkillScores.userId, userId));
  const bandOf = (k: string) => Number(scores.find((x) => x.skill === k)?.estimatedBand ?? 6);
  await tx.insert(s.userBandPredictions).values({
    userId,
    overallBand: String(Math.round(((bandOf('LISTENING') + bandOf('READING') + bandOf('WRITING') + bandOf('SPEAKING')) / 4) * 2) / 2),
    components: { LISTENING: bandOf('LISTENING'), READING: bandOf('READING'), WRITING: bandOf('WRITING'), SPEAKING: bandOf('SPEAKING') },
    trigger: 'RECALC',
    attemptId: null,
    createdAt: at(1),
  });

  // ── Poin harian + statistik ──
  const streakNow = 14;
  for (let d = 0; d < 56; d += 1) {
    if (d >= streakNow && d % 3 === 0) continue; // sebelum streak aktif: ada hari bolong
    ledger.push({ userId, source: 'DAILY', sourceId: null, points: 5, note: 'Aktivitas harian', createdAt: at(d, 8) });
    ledgerTotal += 5;
  }
  for (const row of ledger) await tx.insert(s.pointLedger).values(row);
  await tx.insert(s.userStats).values({
    userId,
    totalPoints: ledgerTotal,
    dailyStreakDays: streakNow,
    longestDailyStreak: 21,
    lastActiveDate: at(0, 8),
    bestSpeedStreak: 12,
    goldCrowns: goldCount,
    silverCrowns: silverCount,
  });

  // ── Posisi terakhir belajar: sub-modul yang sedang dikerjakan ──
  const cur = subs.find((x) => x.subModuleCode === inProgressCode);
  if (cur) {
    const mod = mods.find((m) => m.id === cur.moduleId)!;
    await tx.insert(s.userLastLearnedState).values({
      userId,
      activeTierId: mod.tierId,
      activeModuleId: mod.id,
      activeSubModuleId: cur.id,
      activeTab: 'DRILL',
      lastQuestionIndex: 3,
    });
  }
  console.log(
    `[seed-demo] profil "${DEMO_NAME}" dibuat: ${subs.length} sub-modul (Tier 1-3 selesai, Tier 4 berjalan), ` +
      `${goldCount} emas / ${silverCount} perak, ${ledgerTotal} poin, streak ${streakNow} hari, 3 boss + 3 simulasi.`,
  );
}

async function main(): Promise<void> {
  const db = getDb();
  if (process.argv.includes('--remove')) {
    await db.transaction(async (tx) => removeDemo(tx));
    console.log(`[seed-demo] profil "${DEMO_NAME}" dihapus.`);
    return;
  }
  await db.transaction(async (tx) => seed(tx));
}

main()
  .then(() => closeDb())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.stack : e);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
