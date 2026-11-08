import type { CheckpointInfo, TrackItem } from '@/lib/api/tracks';

/** Checkpoint butuh minimal 5 soal di kolam (SPEC-021 D8). */
export const CHECKPOINT_MIN_POOL = 5;

export type SprintGroup = { week: number | null; items: TrackItem[] };

/**
 * Mengelompokkan item jalur Sprint per minggu. Item `CHECKPOINT` tidak membawa `week_no` (dibatasi CHECK DB),
 * sehingga ia masuk ke minggu sub-modul sebelumnya (Checkpoint menutup minggu itu, SPEC-021 D9).
 */
export function groupSprintItems(items: TrackItem[]): SprintGroup[] {
  const groups: SprintGroup[] = [];
  for (const item of items) {
    const week = item.kind === 'SUB_MODULE' ? (item.week_no ?? null) : null;
    const last = groups[groups.length - 1];
    if (item.kind === 'CHECKPOINT') {
      if (last) last.items.push(item);
      else groups.push({ week: null, items: [item] });
      continue;
    }
    if (!last || (week !== null && last.week !== week)) groups.push({ week, items: [item] });
    else last.items.push(item);
  }
  return groups;
}

/** Nomor urut Checkpoint (1, 2, 3, ...) menurut posisi pada jalur. */
export function checkpointOrdinals(items: TrackItem[]): Map<number, number> {
  const map = new Map<number, number>();
  let n = 0;
  for (const item of items) if (item.kind === 'CHECKPOINT') map.set(item.position, (n += 1));
  return map;
}

/**
 * Sub-modul boleh dibuka hanya bila materinya terbit, statusnya bukan LOCKED, dan tidak ada alasan kunci Tier.
 * (Gerbang Tier/Boss/Skip berlaku di semua jalur; klien tidak pernah menganggap terbuka apa yang dikunci server.)
 */
export function isItemOpenable(item: TrackItem): boolean {
  const sm = item.sub_module;
  if (item.kind !== 'SUB_MODULE' || !sm) return false;
  if (sm.content_state !== 'AVAILABLE') return false;
  if (sm.status === 'LOCKED') return false;
  if (sm.lock_reason?.code === 'TIER_LOCKED') return false;
  return true;
}

export function isItemLocked(item: TrackItem): boolean {
  const sm = item.sub_module;
  if (!sm || sm.content_state !== 'AVAILABLE') return false;
  return sm.status === 'LOCKED' || sm.lock_reason?.code === 'TIER_LOCKED';
}

export function isTierLocked(item: TrackItem): boolean {
  return item.sub_module?.lock_reason?.code === 'TIER_LOCKED';
}

export type CheckpointBlock = 'NOT_READY' | 'NOT_ENOUGH' | null;

/** Alasan tombol "Mulai Checkpoint" nonaktif (SPEC-021 UI/UX). */
export function checkpointBlock(cp: CheckpointInfo): CheckpointBlock {
  if (cp.status === 'NOT_READY') return 'NOT_READY';
  if (cp.pool_size < CHECKPOINT_MIN_POOL) return 'NOT_ENOUGH';
  return null;
}

/** Banyak hari/sub-modul selesai pada sebuah kelompok. */
export function countDone(items: TrackItem[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const it of items) {
    if (it.kind !== 'SUB_MODULE' || !it.sub_module) continue;
    total += 1;
    if (it.sub_module.status === 'COMPLETED' || it.sub_module.status === 'SKIPPED') done += 1;
  }
  return { done, total };
}

/** Item pertama yang bisa dilanjutkan (IN_PROGRESS, lalu UNLOCKED) untuk penanda "berikutnya". */
export function findNextItemPosition(items: TrackItem[]): number | null {
  let firstUnlocked: number | null = null;
  for (const it of items) {
    if (!isItemOpenable(it)) continue;
    const st = it.sub_module!.status;
    if (st === 'IN_PROGRESS') return it.position;
    if (st === 'UNLOCKED' && firstUnlocked === null) firstUnlocked = it.position;
  }
  return firstUnlocked;
}
