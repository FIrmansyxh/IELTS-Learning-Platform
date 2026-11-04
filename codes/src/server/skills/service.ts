/**
 * SkillScoreService (SPEC-017). SATU-SATUNYA penulis `user_skill_scores` dan `user_band_predictions` (skor tidak dapat
 * diedit manual). Menghitung ulang di dalam transaksi pemicu (selesai attempt / evaluasi AI tersimpan) sehingga baca
 * (`GET /me/skills/radar`) hanya membaca baris teragregasi: 2 query SQL.
 *
 * Idempoten: menghitung ulang dari data sumber (50 jawaban objektif terbaru / 3 submission AI terbaru) selalu memberi hasil
 * yang sama; riwayat prediksi hanya bertambah bila nilai `x` berubah (RECALC) atau pada selesainya Boss (BOSS).
 * Evaluasi `SELF_ASSESSMENT` dan `flags.injection_suspected = true` tidak pernah dihitung.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { attempts, assessmentSets, userBandPredictions, userSkillScores, users } from '@/db/schema';
import {
  DISCLAIMER,
  RADAR_ORDER,
  type BandComponents,
  type RadarDTO,
  type RadarSkillName,
} from '@/contracts/skills';
import type { Db, DbOrTx, Tx } from '../db';
import { nowDate } from '../clock';
import type { AttemptCompletedContext } from '../attempts/hooks';
import type { EvaluationGradedContext } from '../ai/hooks';
import { scoreForDisplay } from '../attempts/dto';
import { getActiveTable } from '../band/service';
import { averageBand, convertRawToBand, scaleToForty } from '../band/convert';
import { logger } from '../logger';
import {
  AI_SAMPLE,
  MIN_SAMPLE_FOR_BAND,
  OBJECTIVE_SAMPLE,
  OBJECTIVE_SKILLS,
  SPEAKING_KINDS,
  WRITING_KINDS,
  aiScorePercentHundredths,
  aiSkillOfKind,
  bandTableFor,
  computePrediction,
  hundredthsToNumber,
  isProxy,
  percentHundredths,
  predictionSampleSize,
  predictionValue,
  type ObjectiveSkill,
} from './rules';

type ScoreRow = typeof userSkillScores.$inferSelect;

async function writeScore(tx: Tx, userId: string, skill: RadarSkillName, v: { scoreHundredths: number; band: number | null; sample: number } | null): Promise<void> {
  if (v === null) {
    // R1/R2: tanpa sampel -> tidak ada baris skor.
    await tx.delete(userSkillScores).where(and(eq(userSkillScores.userId, userId), eq(userSkillScores.skill, skill)));
    return;
  }
  await tx.execute(sql`
    INSERT INTO user_skill_scores (user_id, skill, score_percent, estimated_band, sample_size, updated_at)
    VALUES (${userId}::uuid, ${skill}::skill_category, ${hundredthsToNumber(v.scoreHundredths).toFixed(2)}::numeric, ${v.band === null ? null : v.band.toFixed(1)}::numeric, ${v.sample}, now())
    ON CONFLICT (user_id, skill) DO UPDATE
      SET score_percent = EXCLUDED.score_percent, estimated_band = EXCLUDED.estimated_band, sample_size = EXCLUDED.sample_size, updated_at = now()`);
}

/**
 * R1 (amandemen F-17-01): sampel = jawaban TERBARU per soal unik (`assessment_set_id`, `question_id`) pada attempt GRADED/EXPIRED,
 * lalu 50 terbaru dari soal-soal unik itu. Mengulang soal yang sama (hafalan) tidak menggelembungkan sampel.
 */
export async function recomputeObjective(tx: Tx, userId: string, skill: ObjectiveSkill): Promise<void> {
  const r = await tx.execute(sql`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE is_correct)::int AS correct
    FROM (
      SELECT d.is_correct
      FROM (
        SELECT DISTINCT ON (aa.assessment_set_id, aa.question_id) aa.is_correct, aa.answered_at, aa.id
        FROM attempt_answers aa JOIN attempts a ON a.id = aa.attempt_id
        WHERE a.user_id = ${userId}::uuid AND a.status IN ('GRADED', 'EXPIRED')
          AND aa.skill = ${skill}::skill_category AND aa.is_correct IS NOT NULL
        ORDER BY aa.assessment_set_id, aa.question_id, aa.answered_at DESC, aa.id DESC
      ) d
      ORDER BY d.answered_at DESC, d.id DESC
      LIMIT ${OBJECTIVE_SAMPLE}
    ) s`);
  const { n, correct } = r.rows[0] as { n: number; correct: number };
  if (Number(n) === 0) {
    await writeScore(tx, userId, skill, null);
    return;
  }
  let band: number | null = null;
  if (Number(n) >= MIN_SAMPLE_FOR_BAND) {
    try {
      const table = await getActiveTable(tx, bandTableFor(skill));
      band = convertRawToBand(table.rows, scaleToForty(Number(correct), Number(n)));
    } catch (e) {
      // Galat konfigurasi (tabel band tidak aktif / baris hilang): skor persen tetap ditulis, band null.
      logger.error({ skill, err: e instanceof Error ? e.message : 'unknown', code: 'band_table_inactive' }, 'band_table_inactive');
    }
  }
  await writeScore(tx, userId, skill, { scoreHundredths: percentHundredths(Number(correct), Number(n)), band, sample: Number(n) });
}

/** R2: WRITING/SPEAKING dari hingga 3 submission terbaru dengan evaluasi AI_LOCAL non-injeksi (run tertinggi yang memenuhi). */
export async function recomputeAi(tx: Tx, userId: string, skill: 'WRITING' | 'SPEAKING'): Promise<void> {
  const kinds = skill === 'WRITING' ? WRITING_KINDS : SPEAKING_KINDS;
  const r = await tx.execute(sql`
    SELECT ev.overall_band::float AS band
    FROM submissions s
    JOIN LATERAL (
      SELECT e.overall_band FROM ai_evaluations e
      WHERE e.submission_id = s.id AND e.method = 'AI_LOCAL' AND e.overall_band IS NOT NULL
        AND COALESCE(e.flags->>'injection_suspected', 'false') <> 'true'
      ORDER BY e.run_number DESC LIMIT 1
    ) ev ON true
    WHERE s.user_id = ${userId}::uuid AND s.kind::text IN (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)})
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT ${AI_SAMPLE}`);
  const bands = (r.rows as Array<{ band: number }>).map((x) => Number(x.band));
  const avg = averageBand(bands);
  if (avg === null) {
    await writeScore(tx, userId, skill, null);
    return;
  }
  await writeScore(tx, userId, skill, { scoreHundredths: aiScorePercentHundredths(avg), band: avg, sample: bands.length });
}

// ------------------------------------------------------------------ prediksi dan riwayat
function componentsOf(rows: ScoreRow[]): BandComponents {
  const band = (s: string) => {
    const row = rows.find((x) => x.skill === s);
    return row && row.estimatedBand !== null ? Number(row.estimatedBand) : null;
  };
  return { LISTENING: band('LISTENING'), READING: band('READING'), WRITING: band('WRITING'), SPEAKING: band('SPEAKING') };
}

function predictionOf(rows: ScoreRow[]) {
  const c = componentsOf(rows);
  const samples = Object.fromEntries(rows.map((x) => [x.skill, x.sampleSize])) as Partial<Record<keyof BandComponents, number>>;
  return computePrediction(c, predictionSampleSize(c, samples));
}

/** R4 + R5: hitung prediksi dari baris skor terkini, tulis riwayat bila memenuhi syarat. */
async function updatePrediction(tx: Tx, userId: string, trigger: { kind: 'BOSS'; attemptId: string } | { kind: 'RECALC' }): Promise<void> {
  const rows = await tx.select().from(userSkillScores).where(eq(userSkillScores.userId, userId));
  const pred = predictionOf(rows);
  const x = predictionValue(pred);
  if (x === null) return;
  const [latest] = await tx
    .select({ overallBand: userBandPredictions.overallBand, createdAt: userBandPredictions.createdAt, attemptId: userBandPredictions.attemptId, trigger: userBandPredictions.trigger })
    .from(userBandPredictions)
    .where(eq(userBandPredictions.userId, userId))
    .orderBy(sql`${userBandPredictions.createdAt} DESC`, sql`${userBandPredictions.id} DESC`)
    .limit(1);
  if (trigger.kind === 'RECALC') {
    if (latest && Number(latest.overallBand) === x) return;
  } else if (latest && latest.trigger === 'BOSS' && latest.attemptId === trigger.attemptId) {
    return; // idempoten: satu baris per attempt Boss
  }
  // created_at monoton (jam aplikasi; tidak pernah <= baris terakhir) agar "baris terbaru" tidak ambigu pada ms yang sama.
  const base = nowDate().getTime();
  const at = new Date(latest ? Math.max(base, latest.createdAt.getTime() + 1) : base);
  await tx.insert(userBandPredictions).values({
    userId,
    overallBand: x.toFixed(1),
    components: pred.components,
    trigger: trigger.kind,
    attemptId: trigger.kind === 'BOSS' ? trigger.attemptId : null,
    createdAt: at,
  });
}

// ------------------------------------------------------------------ hook
/** `attemptCompletedHooks` (setelah gamifikasi): skill objektif yang muncul pada attempt ini, lalu prediksi. */
export async function skillScoreHook(ctx: AttemptCompletedContext): Promise<void> {
  const { tx, userId, attempt, set } = ctx;
  const r = await tx.execute(sql`
    SELECT DISTINCT skill::text AS skill FROM attempt_answers
    WHERE attempt_id = ${attempt.id}::uuid AND is_correct IS NOT NULL AND skill IN ('LISTENING', 'READING', 'GRAMMAR', 'VOCAB')`);
  const skills = (r.rows as Array<{ skill: string }>).map((x) => x.skill as ObjectiveSkill).filter((s) => OBJECTIVE_SKILLS.includes(s));
  for (const skill of skills) await recomputeObjective(tx, userId, skill);
  const isBoss = set.assessmentType === 'TIER_BOSS_EXAM';
  if (skills.length === 0 && !isBoss) return;
  await updatePrediction(tx, userId, isBoss ? { kind: 'BOSS', attemptId: attempt.id } : { kind: 'RECALC' });
}

/** `evaluationGradedHooks`: WRITING/SPEAKING milik pemilik submission, lalu prediksi (RECALC). */
export async function skillScoreEvaluationHook(ctx: EvaluationGradedContext): Promise<void> {
  const skill = aiSkillOfKind(ctx.kind);
  if (!skill) return;
  await recomputeAi(ctx.tx, ctx.userId, skill);
  await updatePrediction(ctx.tx, ctx.userId, { kind: 'RECALC' });
}

// ------------------------------------------------------------------ pembacaan
export async function getRadar(db: DbOrTx, userId: string): Promise<RadarDTO> {
  const rows = await db.select().from(userSkillScores).where(eq(userSkillScores.userId, userId)); // query 1 (PK parsial)
  const [u] = await db.select({ targetBand: users.targetBand }).from(users).where(eq(users.id, userId)).limit(1); // query 2
  const skills = RADAR_ORDER.map((skill) => {
    const row = rows.find((r) => r.skill === skill);
    return {
      skill,
      score_percent: row ? Number(row.scorePercent) : null,
      estimated_band: row && row.estimatedBand !== null ? Number(row.estimatedBand) : null,
      sample_size: row ? row.sampleSize : 0,
      is_proxy: isProxy(skill),
      updated_at: row ? row.updatedAt.toISOString() : null,
    };
  });
  return { skills, target_band: u?.targetBand != null ? Number(u.targetBand) : null, prediction: predictionOf(rows), disclaimer: DISCLAIMER };
}

export async function listBandPredictions(db: Db, userId: string, page: number, pageSize: number) {
  const [{ total }] = (await db.select({ total: sql<number>`count(*)::int` }).from(userBandPredictions).where(eq(userBandPredictions.userId, userId))) as [{ total: number }];
  const rows = await db
    .select()
    .from(userBandPredictions)
    .where(eq(userBandPredictions.userId, userId))
    .orderBy(asc(userBandPredictions.createdAt), asc(userBandPredictions.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    data: rows.map((r) => ({
      id: r.id,
      overall_band: Number(r.overallBand),
      components: r.components as BandComponents,
      trigger: r.trigger as 'BOSS' | 'RECALC',
      attempt_id: r.attemptId,
      created_at: r.createdAt.toISOString(),
    })),
    meta: { page, page_size: pageSize, total: Number(total) },
  };
}

type HistoryType = 'SKIP_MODULE_TEST' | 'SKIP_TIER_TEST' | 'TIER_BOSS_EXAM' | 'PLACEMENT_TEST';
const HISTORY_TYPES: HistoryType[] = ['SKIP_MODULE_TEST', 'SKIP_TIER_TEST', 'TIER_BOSS_EXAM', 'PLACEMENT_TEST'];

export async function listExamHistory(db: Db, userId: string, q: { assessmentType?: HistoryType; page: number; pageSize: number }) {
  const types = q.assessmentType ? [q.assessmentType] : HISTORY_TYPES;
  const where = and(
    eq(attempts.userId, userId),
    eq(attempts.mode, 'EXAM'),
    sql`${attempts.status} IN ('GRADED', 'EXPIRED')`,
    sql`${assessmentSets.assessmentType} IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})`,
  );
  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(attempts)
    .innerJoin(assessmentSets, eq(assessmentSets.id, attempts.assessmentSetId))
    .where(where)) as [{ total: number }];
  const rows = await db
    .select({ a: attempts, type: assessmentSets.assessmentType, title: assessmentSets.title })
    .from(attempts)
    .innerJoin(assessmentSets, eq(assessmentSets.id, attempts.assessmentSetId))
    .where(where)
    .orderBy(sql`${attempts.submittedAt} DESC NULLS LAST`, sql`${attempts.id} DESC`)
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return {
    data: rows.map(({ a, type, title }) => {
      const placement = type === 'PLACEMENT_TEST';
      const passPercent = (a.state as { pass_percent?: number | null } | null)?.pass_percent ?? null;
      return {
        attempt_id: a.id,
        assessment_type: type as HistoryType,
        title,
        status: a.status as 'GRADED' | 'EXPIRED',
        score_percent: scoreForDisplay(a, passPercent, false),
        band_score: placement || a.bandScore === null ? null : Number(a.bandScore),
        passed: placement ? null : a.passed,
        submitted_at: (a.submittedAt ?? a.createdAt).toISOString(),
        result_path: `/ujian/${a.id}/hasil`,
      };
    }),
    meta: { page: q.page, page_size: q.pageSize, total: Number(total) },
  };
}

export const SkillScoreService = { skillScoreHook, skillScoreEvaluationHook, recomputeObjective, recomputeAi, getRadar, listBandPredictions, listExamHistory };
