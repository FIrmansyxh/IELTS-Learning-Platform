/**
 * Section Boss (SPEC-014): `POST /attempts/{id}/sections/{section_set_id}/start|submit`. Semua tulis dalam satu transaksi
 * dengan `SELECT ... FOR UPDATE` pada baris attempt; `start` pada section ACTIVE adalah resume tanpa efek.
 */
import { eq } from 'drizzle-orm';
import { attempts } from '@/db/schema';
import { nowDate } from '../clock';
import type { Db } from '../db';
import { ApiError, notFound } from '../http/errors';
import {
  activateSection,
  buildSectionStartPayload,
  closeSection,
  loadChildren,
  sectionDTO,
  sectionOrderOf,
  settleExpiredSections,
} from '../exams/boss';
import { SECTION_GRACE_MS } from '../exams/boss-rules';
import { isExpired, stateOf } from './dto';
import { expire } from './service';
import { loadAnswers, loadLocked } from './store';

export async function startSection(db: Db, userId: string, attemptId: string, sectionId: string) {
  const out = await db.transaction(async (tx) => {
    const now = nowDate();
    const locked = await loadLocked(tx, attemptId, userId);
    const set = locked.set;
    let attempt = locked.attempt;
    if (set.assessmentType !== 'TIER_BOSS_EXAM') throw notFound();
    let state = stateOf(attempt);
    if (!state.sections?.[sectionId]) throw notFound(); // bukan anak set induk attempt
    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      return 'expired' as const; // dilempar setelah commit
    }
    const answers = await loadAnswers(tx, attempt.id);
    const settled = await settleExpiredSections(tx, attempt, answers, now);
    if (settled) {
      state = settled;
      [attempt] = await tx.update(attempts).set({ state }).where(eq(attempts.id, attempt.id)).returning();
    }
    const sec = state.sections![sectionId]!;
    const [kid] = await loadChildren(tx, [sectionId]);
    if (!kid) throw notFound();

    if (sec.phase === 'DONE') {
      if (settled) return { settledDone: true as const }; // ditutup otomatis oleh waktu: commit penutupan lalu 409
      throw new ApiError('SECTION_ALREADY_DONE');
    }
    if (sec.phase === 'PENDING') {
      const order = sectionOrderOf(state);
      const behind = order.slice(0, order.indexOf(sectionId));
      if (behind.some((sid) => state.sections![sid]!.phase !== 'DONE')) {
        if (settled) return { settledOrder: true as const };
        throw new ApiError('SECTION_ORDER_VIOLATION');
      }
      state = activateSection(state, attempt.id, kid, now, attempt.deadlineAt);
      [attempt] = await tx.update(attempts).set({ state, updatedAt: now }).where(eq(attempts.id, attempt.id)).returning();
    }
    return { payload: await buildSectionStartPayload(tx, { attempt: attempt!, state, kid, answers, now }) };
  });
  if (out === 'expired') throw new ApiError('ATTEMPT_EXPIRED');
  if ('settledDone' in out) throw new ApiError('SECTION_ALREADY_DONE');
  if ('settledOrder' in out) throw new ApiError('SECTION_ORDER_VIOLATION');
  return out.payload;
}

export async function submitSection(db: Db, userId: string, attemptId: string, sectionId: string) {
  const out = await db.transaction(async (tx) => {
    const now = nowDate();
    const { attempt, set } = await loadLocked(tx, attemptId, userId);
    if (set.assessmentType !== 'TIER_BOSS_EXAM') throw notFound();
    let state = stateOf(attempt);
    if (!state.sections?.[sectionId]) throw notFound();
    const kids = await loadChildren(tx, sectionOrderOf(state));
    const kid = kids.find((k) => k.id === sectionId);
    if (!kid) throw notFound();
    const idx = kids.findIndex((k) => k.id === sectionId);
    const dtoOf = (id: string) => {
      const k = kids.find((x) => x.id === id);
      return k ? sectionDTO(k, state.sections![id]!, now) : null;
    };
    const next = () => (idx + 1 < kids.length ? dtoOf(kids[idx + 1]!.id) : null);

    const sec = state.sections[sectionId]!;
    if (attempt.status !== 'IN_PROGRESS') throw new ApiError('ATTEMPT_NOT_ACTIVE');
    if (sec.phase === 'DONE') return { section: dtoOf(sectionId)!, next_section: next() }; // idempoten tanpa efek
    if (isExpired(attempt, now)) {
      await expire(tx, attempt, set, userId);
      return 'expired' as const;
    }
    if (sec.phase === 'PENDING') throw new ApiError('SECTION_NOT_ACTIVE');

    const answers = await loadAnswers(tx, attempt.id);
    const late = sec.deadline_at !== null && now.getTime() > Date.parse(sec.deadline_at) + SECTION_GRACE_MS;
    state = await closeSection(tx, { attempt, state, kid, endStatus: late ? 'EXPIRED' : 'SUBMITTED', answers });
    await tx.update(attempts).set({ state, updatedAt: now }).where(eq(attempts.id, attempt.id));
    return { section: dtoOf(sectionId)!, next_section: next() };
  });
  if (out === 'expired') throw new ApiError('ATTEMPT_EXPIRED');
  return out;
}
