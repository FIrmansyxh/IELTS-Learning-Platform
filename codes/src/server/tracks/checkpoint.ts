/**
 * Checkpoint Jalur Belajar (SPEC-021 D8).
 * Latihan gabungan 10 soal objektif bergilir dari sub-modul yang dicakup.
 * Status: NOT_READY, READY, ATTEMPTED, PASSED.
 * Tidak mengunci apa pun, tidak menambah poin/mahkota, menulis radar via skillScoreHook.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  assessmentSets,
  attempts,
  learningTrackItems,
  learningTracks,
  subModules,
} from '@/db/schema';
import { OBJECTIVE_TYPES, type Question } from '@/contracts/content';
import { getDb, type Db, type DbOrTx } from '../db';
import { ApiError, notFound } from '../http/errors';
import type { AttemptRow, SetRow } from '../attempts/dto';
import type { AssessmentTypeHandler } from '../attempts/handlers';
import { parseQuestions } from '../attempts/dto';
import { getCompletedSubModuleIds } from '../gatekeeping/service';

export const CHECKPOINT_STATE_SCHEMA = 'checkpoint.v1' as const;

export interface CheckpointQuestionEntry {
  position: number;
  question_id: string;
  set_id: string;
  sub_module_code: string;
  skill: string;
  question_type: string;
  option_order?: number[];
  question: Question;
}

export interface CheckpointState {
  schema: typeof CHECKPOINT_STATE_SCHEMA;
  track_item_id: string;
  rng_seed: string;
  questions: CheckpointQuestionEntry[];
  order: string[];
  served: Record<string, { option_order?: number[] }>;
  last_resume_at: string;
}

export function isCheckpointAttempt(a: Pick<AttemptRow, 'assessmentType'>): boolean {
  return a.assessmentType === 'TRACK_CHECKPOINT';
}

export function checkpointStateOf(a: AttemptRow): CheckpointState {
  const s = a.state as unknown as CheckpointState | null;
  if (!s || s.schema !== CHECKPOINT_STATE_SCHEMA || !Array.isArray(s.questions)) {
    throw new ApiError('INTERNAL_ERROR');
  }
  return s;
}

export function checkpointEntries(state: CheckpointState): Map<string, CheckpointQuestionEntry> {
  return new Map(state.questions.map((q) => [q.question_id, q]));
}

export interface CheckpointDetails {
  status: 'NOT_READY' | 'READY' | 'ATTEMPTED' | 'PASSED';
  best_percent: number | null;
  covers: string[];
  pool_size: number;
  pass_percent: 75;
}

/**
 * Mendapatkan sub-modul yang dicakup oleh sebuah item Checkpoint:
 * Semua sub_module_id dari item SUB_MODULE yang berada di antara Checkpoint sebelumnya (atau awal jalur) dan Checkpoint ini.
 */
export async function getCoveredSubModules(
  trackId: string,
  checkpointOrderIndex: number,
  db: DbOrTx = getDb(),
): Promise<Array<{ id: string; code: string }>> {
  const items = await db
    .select({
      orderIndex: learningTrackItems.orderIndex,
      itemKind: learningTrackItems.itemKind,
      subModuleId: learningTrackItems.subModuleId,
    })
    .from(learningTrackItems)
    .where(eq(learningTrackItems.trackId, trackId))
    .orderBy(learningTrackItems.orderIndex);

  let prevCpOrder = 0;
  for (const it of items) {
    if (it.orderIndex >= checkpointOrderIndex) break;
    if (it.itemKind === 'CHECKPOINT') prevCpOrder = it.orderIndex;
  }

  const coveredSubIds = items
    .filter(
      (it) =>
        it.orderIndex > prevCpOrder &&
        it.orderIndex < checkpointOrderIndex &&
        it.itemKind === 'SUB_MODULE' &&
        it.subModuleId !== null,
    )
    .map((it) => it.subModuleId!);

  if (coveredSubIds.length === 0) return [];

  const subRows = await db
    .select({ id: subModules.id, code: subModules.subModuleCode })
    .from(subModules)
    .where(inArray(subModules.id, coveredSubIds));

  // Pertahankan urutan jalur
  const subMap = new Map(subRows.map((s) => [s.id, s]));
  return coveredSubIds.map((id) => subMap.get(id)!).filter(Boolean);
}

/**
 * Mengambil kolam soal objektif untuk daftar sub-modul yang dicakup.
 */
export async function getCheckpointQuestionPool(
  coveredSubIds: string[],
  db: DbOrTx = getDb(),
): Promise<Array<{ subModuleId: string; subModuleCode: string; setId: string; question: Question }>> {
  if (coveredSubIds.length === 0) return [];

  const drillSets = await db
    .select({
      id: assessmentSets.id,
      subModuleId: assessmentSets.subModuleId,
      questionsJson: assessmentSets.questionsJson,
    })
    .from(assessmentSets)
    .where(
      and(
        eq(assessmentSets.assessmentType, 'ACTIVE_DRILL'),
        eq(assessmentSets.status, 'PUBLISHED'),
        inArray(assessmentSets.subModuleId, coveredSubIds),
        isNull(assessmentSets.readingPassageMarkdown),
        isNull(assessmentSets.listeningAssetId),
      ),
    );

  const subRows = await db
    .select({ id: subModules.id, code: subModules.subModuleCode })
    .from(subModules)
    .where(inArray(subModules.id, coveredSubIds));
  const subCodeMap = new Map(subRows.map((s) => [s.id, s.code]));

  const pool: Array<{ subModuleId: string; subModuleCode: string; setId: string; question: Question }> = [];

  for (const set of drillSets) {
    if (!set.subModuleId) continue;
    const subCode = subCodeMap.get(set.subModuleId) ?? '';
    const qs = parseQuestions({ questionsJson: set.questionsJson } as SetRow);
    for (const q of qs.values()) {
      if (OBJECTIVE_TYPES.includes(q.question_type)) {
        pool.push({
          subModuleId: set.subModuleId,
          subModuleCode: subCode,
          setId: set.id,
          question: q,
        });
      }
    }
  }

  return pool;
}

/**
 * Menghitung detail Checkpoint untuk satu pengguna dan item.
 */
export async function getCheckpointInfo(
  userId: string,
  trackId: string,
  checkpointItemId: string,
  db: DbOrTx = getDb(),
): Promise<CheckpointDetails> {
  const [cpItem] = await db
    .select()
    .from(learningTrackItems)
    .where(and(eq(learningTrackItems.id, checkpointItemId), eq(learningTrackItems.trackId, trackId)))
    .limit(1);

  if (!cpItem || cpItem.itemKind !== 'CHECKPOINT') throw notFound();

  const coveredSubs = await getCoveredSubModules(trackId, cpItem.orderIndex, db);
  const coveredIds = coveredSubs.map((s) => s.id);
  const coveredCodes = coveredSubs.map((s) => s.code);

  // Status progres dari sub-modul yang dicakup
  let allDone = true;
  if (coveredIds.length > 0) {
    const completedSet = await getCompletedSubModuleIds(db, userId);
    for (const id of coveredIds) {
      if (!completedSet.has(id)) {
        allDone = false;
        break;
      }
    }
  }

  // Kolam soal
  const pool = await getCheckpointQuestionPool(coveredIds, db);

  // Riwayat attempt checkpoint untuk item ini
  const userAttempts = await db
    .select({
      id: attempts.id,
      status: attempts.status,
      scorePercent: attempts.scorePercent,
    })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.assessmentType, 'TRACK_CHECKPOINT'),
        sql`json_extract(${attempts.state}, '$.track_item_id') = ${checkpointItemId}`,
      ),
    );

  const completedAttempts = userAttempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'EXPIRED');
  let bestPercent: number | null = null;
  let hasPassed = false;

  for (const a of completedAttempts) {
    const p = a.scorePercent !== null ? Number(a.scorePercent) : 0;
    if (bestPercent === null || p > bestPercent) bestPercent = p;
    if (p >= 75) hasPassed = true;
  }

  let status: 'NOT_READY' | 'READY' | 'ATTEMPTED' | 'PASSED';
  if (hasPassed) {
    status = 'PASSED';
  } else if (completedAttempts.length > 0) {
    status = 'ATTEMPTED';
  } else if (allDone) {
    status = 'READY';
  } else {
    status = 'NOT_READY';
  }

  return {
    status,
    best_percent: bestPercent,
    covers: coveredCodes,
    pool_size: pool.length,
    pass_percent: 75,
  };
}

/**
 * Memulai attempt Checkpoint (POST /tracks/{track_code}/checkpoints/{item_id}/attempts).
 */
export async function startCheckpointAttempt(
  userId: string,
  trackCode: string,
  itemId: string,
  db: Db = getDb() as Db,
): Promise<{ attempt_id: string; question_count: number; pass_percent: 75; covers: string[] }> {
  return db.transaction(async (tx) => {
    const [track] = await tx
      .select()
      .from(learningTracks)
      .where(and(eq(learningTracks.code, trackCode), eq(learningTracks.status, 'PUBLISHED')))
      .limit(1);

    if (!track || track.kind === 'CURRICULUM') throw notFound();

    const [cpItem] = await tx
      .select()
      .from(learningTrackItems)
      .where(and(eq(learningTrackItems.id, itemId), eq(learningTrackItems.trackId, track.id)))
      .limit(1);

    if (!cpItem || cpItem.itemKind !== 'CHECKPOINT') throw notFound();

    const info = await getCheckpointInfo(userId, track.id, itemId, tx);
    if (info.status === 'NOT_READY') {
      throw new ApiError('CHECKPOINT_NOT_READY');
    }
    if (info.pool_size < 5) {
      throw new ApiError('CHECKPOINT_NOT_ENOUGH_QUESTIONS', {
        details: [
          {
            path: 'item_id',
            code: `max_available:${info.pool_size}`,
            message: `Soal untuk Checkpoint ini belum cukup (tersedia ${info.pool_size}, minimal 5).`,
          },
        ],
      });
    }

    // Hanya satu attempt TRACK_CHECKPOINT IN_PROGRESS per profil (D8)
    const now = new Date();
    await tx
      .update(attempts)
      .set({ status: 'ABANDONED', updatedAt: now })
      .where(
        and(
          eq(attempts.userId, userId),
          eq(attempts.assessmentType, 'TRACK_CHECKPOINT'),
          eq(attempts.status, 'IN_PROGRESS'),
        ),
      );

    // Ambil 10 soal: bergilir antar sub-modul menurut urutan jalur, diacak CSPRNG (D8)
    const coveredSubs = await getCoveredSubModules(track.id, cpItem.orderIndex, tx);
    const pool = await getCheckpointQuestionPool(coveredSubs.map((s) => s.id), tx);

    // Kelompokkan kolam per sub_module_id
    const poolBySub = new Map<string, typeof pool>();
    for (const sub of coveredSubs) {
      poolBySub.set(sub.id, []);
    }
    for (const item of pool) {
      const list = poolBySub.get(item.subModuleId);
      if (list) list.push(item);
    }

    // Acak dalam tiap sub-modul menggunakan CSPRNG
    for (const [, list] of poolBySub) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = randomBytes(4).readUInt32BE(0) % (i + 1);
        const temp = list[i]!;
        list[i] = list[j]!;
        list[j] = temp;
      }
    }

    // Bergilir antar sub-modul (urutan jalur)
    const selected: typeof pool = [];
    let poolRemaining = true;
    while (selected.length < 10 && poolRemaining) {
      let addedInRound = false;
      for (const sub of coveredSubs) {
        if (selected.length >= 10) break;
        const list = poolBySub.get(sub.id);
        if (list && list.length > 0) {
          selected.push(list.shift()!);
          addedInRound = true;
        }
      }
      if (!addedInRound) poolRemaining = false;
    }

    const rngSeed = randomBytes(16).toString('hex');
    const questions: CheckpointQuestionEntry[] = selected.map((item, idx) => ({
      position: idx + 1,
      question_id: item.question.question_id,
      set_id: item.setId,
      sub_module_code: item.subModuleCode,
      skill: item.question.skill,
      question_type: item.question.question_type,
      question: item.question,
    }));

    const state: CheckpointState = {
      schema: CHECKPOINT_STATE_SCHEMA,
      track_item_id: itemId,
      rng_seed: rngSeed,
      questions,
      order: questions.map((q) => q.question_id),
      served: {},
      last_resume_at: now.toISOString(),
    };

    const attemptId = randomUUID();
    await tx.insert(attempts).values({
      id: attemptId,
      userId,
      assessmentType: 'TRACK_CHECKPOINT',
      assessmentSetId: null,
      assessmentVersion: 0,
      mode: 'PRACTICE',
      state: state as unknown as Record<string, unknown>,
      pointsAwarded: 0,
      status: 'IN_PROGRESS',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      attempt_id: attemptId,
      question_count: questions.length,
      pass_percent: 75,
      covers: info.covers,
    };
  });
}

/**
 * Handler tipe untuk TRACK_CHECKPOINT di assessmentTypeHandlers.
 */
export const trackCheckpointHandler: AssessmentTypeHandler = {
  async start() {
    throw new ApiError('INTERNAL_ERROR', { message: 'Gunakan startCheckpointAttempt' });
  },
  async onFinish() {
    // D8: tidak menulis progres gatekeeping
    return { progress: null };
  },
};
