/**
 * ResumeService (SPEC-007). SATU-SATUNYA penulis `user_last_learned_state`. Akses sub-modul tetap lewat
 * GatekeepingService (`assertSubModuleAccessible`); kartu dibangun dari snapshot gerbang (tanpa menulis status).
 */
import { eq, sql } from 'drizzle-orm';
import { modules, userLastLearnedState as lls } from '@/db/schema';
import type { ResumeCard, UpdateLastLearnedRequest } from '@/contracts/resume';
import type { Db } from '../db';
import { nowDate } from '../clock';
import { assertSubModuleAccessible, recomputeStatuses } from '../gatekeeping/service';
import { isAvailable, subProgressPercent, type ModuleNode, type Snapshot, type SubNode, type TierNode } from '../gatekeeping/rules';
import { validationError } from '../http/errors';
import { loadMaterial } from '../player/material';
import { fallbackTab, positionLabel, resumePath, type CardPosition } from './card';
import { execute } from '@/server/db';

export async function updateLastLearned(db: Db, userId: string, input: UpdateLastLearnedRequest): Promise<{ updated_at: string }> {
  return db.transaction(async (tx) => {
    const access = await assertSubModuleAccessible(tx, userId, input.sub_module_id); // 404 / 403 LOCKED_CONTENT
    const subId = access.subModule.id;

    if (input.active_video_id) {
      const material = await loadMaterial(tx, subId);
      if (!material || !material.videos.some((v) => v.video_id === input.active_video_id)) {
        throw validationError('active_video_id', 'video_not_in_sub_module', 'Video bukan bagian dari sub-modul ini.');
      }
    }
    const [mod] = await tx.select({ tierId: modules.tierId }).from(modules).where(eq(modules.id, access.subModule.moduleId)).limit(1);

    // Normalisasi: field posisi hanya disimpan bila relevan dengan tab/sub-tab aktif.
    const tab = input.active_tab;
    const subtab = tab === 'LEARN' ? (input.active_learn_subtab ?? null) : null;
    const isVideo = subtab === 'VIDEO';
    const videoId = isVideo ? (input.active_video_id ?? null) : null;
    const videoSec = isVideo ? (input.video_progress_sec ?? 0) : 0;
    const questionIndex = tab === 'DRILL' ? (input.last_question_index ?? null) : null;

    // Attempt harus IN_PROGRESS milik pengguna untuk set drill sub-modul ini; selain itu NULL tanpa error.
    let attemptId: string | null = null;
    if (tab === 'DRILL' && input.active_attempt_id) {
      const r = await execute(tx, sql`
        SELECT a.id FROM attempts a JOIN assessment_sets s ON s.id = a.assessment_set_id
        WHERE a.id = ${input.active_attempt_id} AND a.user_id = ${userId} AND a.status = 'IN_PROGRESS'
          AND s.assessment_type = 'ACTIVE_DRILL' AND s.sub_module_id = ${subId}`);
      if (r.rows.length > 0) attemptId = input.active_attempt_id;
    }

    const now = nowDate();
    const values = {
      activeTierId: mod?.tierId ?? null,
      activeModuleId: access.subModule.moduleId,
      activeSubModuleId: subId,
      activeTab: tab,
      activeLearnSubtab: subtab,
      activeVideoId: videoId,
      videoProgressSec: videoSec,
      lastQuestionIndex: questionIndex,
      activeAttemptId: attemptId,
      updatedAt: now,
    };
    await tx
      .insert(lls)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: lls.userId, set: values }); // dua perangkat: yang terakhir menang
    return { updated_at: now.toISOString() };
  });
}

type Located = { tier: TierNode; mod: ModuleNode; sub: SubNode };

/** Urutan kandidat (tier_number, modules.order_index, sub_modules.order_index), hanya sub-modul AVAILABLE. */
function orderedAvailable(snap: Snapshot): Located[] {
  const out: Located[] = [];
  for (const tier of [...snap.tiers].sort((a, b) => a.number - b.number)) {
    for (const mod of [...tier.modules].sort((a, b) => a.order - b.order)) {
      for (const sub of [...mod.subs].sort((a, b) => a.order - b.order)) if (isAvailable(mod, sub)) out.push({ tier, mod, sub });
    }
  }
  return out;
}

export async function getResumeCard(db: Db, userId: string): Promise<ResumeCard | null> {
  const snap = await db.transaction((tx) => recomputeStatuses(tx, userId));
  const [row] = await db.select().from(lls).where(eq(lls.userId, userId)).limit(1);
  const list = orderedAvailable(snap);

  // D-RESUME 1-3: posisi tersimpan masih berlaku?
  const saved = row?.activeSubModuleId ? list.find((l) => l.sub.id === row.activeSubModuleId) : undefined;
  if (row && saved && saved.sub.status !== 'LOCKED' && saved.sub.status !== 'COMPLETED' && saved.sub.status !== 'SKIPPED') {
    // Langkah 5: attempt harus IN_PROGRESS milik pengguna untuk drill sub-modul ini.
    let questionCount: number | null = null;
    let attemptId: string | null = null;
    if (row.activeTab === 'DRILL' && row.activeAttemptId) {
      const r = await execute(db, sql`
        SELECT json_array_length(json_extract(a.state, '$.order')) AS n FROM attempts a JOIN assessment_sets s ON s.id = a.assessment_set_id
        WHERE a.id = ${row.activeAttemptId} AND a.user_id = ${userId} AND a.status = 'IN_PROGRESS'
          AND s.assessment_type = 'ACTIVE_DRILL' AND s.sub_module_id = ${saved.sub.id}`);
      if (r.rows.length > 0) {
        attemptId = row.activeAttemptId;
        questionCount = Number((r.rows[0] as { n: number }).n);
      }
    }
    const qIdx =
      row.lastQuestionIndex !== null && attemptId !== null && questionCount !== null && row.lastQuestionIndex < questionCount
        ? row.lastQuestionIndex
        : null;
    const subtab = row.activeTab === 'LEARN' ? row.activeLearnSubtab : null;
    const pos: CardPosition = {
      tab: row.activeTab,
      subtab,
      videoSec: subtab === 'VIDEO' ? row.videoProgressSec : 0,
      questionIndex: qIdx,
      questionCount: qIdx !== null ? questionCount : null,
      attemptId,
      fallback: false,
    };
    return card('RESUME', saved, pos, row.updatedAt);
  }

  // D-RESUME 4: sub-modul pertama IN_PROGRESS, lalu UNLOCKED.
  const next = list.find((l) => l.sub.status === 'IN_PROGRESS') ?? list.find((l) => l.sub.status === 'UNLOCKED');
  if (!next) return null;
  const pos: CardPosition = {
    tab: fallbackTab({
      learnCompleted: next.sub.learnCompleted,
      completed: next.sub.status === 'COMPLETED',
      hasMiniTask: next.sub.hasMiniTask,
      miniTaskCompleted: next.sub.miniTaskCompleted,
    }),
    subtab: null,
    videoSec: 0,
    questionIndex: null,
    questionCount: null,
    attemptId: null,
    fallback: true,
  };
  return card('FALLBACK_NEXT', next, pos, null);
}

function card(state: ResumeCard['state'], at: Located, pos: CardPosition, updatedAt: Date | null): ResumeCard {
  return {
    state,
    sub_module: { id: at.sub.id, sub_module_code: at.sub.code, title: at.sub.title },
    breadcrumb: { tier_label: `Tier ${at.tier.number}`, module_title: at.mod.title },
    active_tab: pos.tab,
    active_learn_subtab: pos.subtab,
    video_progress_sec: pos.videoSec,
    last_question_index: pos.questionIndex,
    question_count: pos.questionCount,
    position_label: positionLabel(pos),
    progress_percent: subProgressPercent(at.sub),
    resume_path: resumePath(at.sub.code, pos),
    change_path: '/peta',
    updated_at: updatedAt ? updatedAt.toISOString() : null,
  };
}
