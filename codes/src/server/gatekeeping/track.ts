/**
 * Gatekeeping Jalur Belajar (SPEC-021 D5).
 * Fungsi murni untuk evaluasi status dan aturan pembukaan sekuensial per jalur.
 *
 * KEPUTUSAN FINAL: Gerbang Tier/Boss/Skip berlaku di SEMUA jalur.
 * Jalur tidak pernah membuka sub-modul yang berada di Tier terkunci.
 */
import {
  isAvailable,
  isDone,
  lockReasonOf,
  passOf,
  setStatus,
  type ModuleNode,
  type Snapshot,
  type SubNode,
  type TierNode,
  PREVIOUS_MESSAGE,
  TIER_LOCKED_MESSAGE,
  NOT_PUBLISHED_MESSAGE,
  type LockReason,
} from './rules';

export interface TrackItemRef {
  id?: string;
  kind: 'SUB_MODULE' | 'CHECKPOINT';
  subModuleId?: string | null;
  subModuleCode?: string | null;
}

export interface TrackRef {
  id: string;
  code: string;
  kind: 'CURRICULUM' | 'CURATED';
  layout?: 'LIST' | 'SPRINT';
  items?: TrackItemRef[];
}

export function findSubContext(
  snap: Snapshot,
  predicate: (s: SubNode) => boolean,
): { tier: TierNode; mod: ModuleNode; sub: SubNode } | null {
  for (const t of snap.tiers) {
    for (const m of t.modules) {
      for (const s of m.subs) {
        if (predicate(s)) return { tier: t, mod: m, sub: s };
      }
    }
  }
  return null;
}

/**
 * Terapkan pembukaan sekuensial jalur CURATED aktif (SPEC-021 D5.4).
 * Dipanggil dari recomputeStatuses setelah recompute Tier/kurikulum bawaan.
 */
export function applyTrackSequential(snap: Snapshot, track: TrackRef, now = new Date()): void {
  if (track.kind !== 'CURATED' || !track.items || track.items.length === 0) return;

  let prevAvailableSub: SubNode | null = null;

  for (const item of track.items) {
    if (item.kind !== 'SUB_MODULE') continue; // Checkpoint diabaikan saat mencari predecessor (D5.5)

    const ctx = findSubContext(
      snap,
      (s) => s.id === item.subModuleId || s.code === item.subModuleCode,
    );
    if (!ctx) continue;
    const { tier, mod, sub } = ctx;

    // Item tidak AVAILABLE (COMING_SOON) dilewati dan tidak memblokir (D5.4)
    if (!isAvailable(mod, sub)) continue;

    // Rule 2: Tier LOCKED menahan sub-modul tetap LOCKED di semua jalur
    if (tier.status !== 'LOCKED') {
      const canUnlock = prevAvailableSub === null || isDone(prevAvailableSub.status);
      if (canUnlock && sub.status === 'LOCKED') {
        setStatus(snap, sub, 'UNLOCKED', 'SEQUENTIAL', now);

        // Perbarui status modul bila perlu
        const avail = mod.subs.filter((s) => isAvailable(mod, s));
        if (avail.some((s) => s.status === 'UNLOCKED' || s.status === 'IN_PROGRESS')) {
          if (mod.status === 'LOCKED') {
            setStatus(snap, mod, 'UNLOCKED', 'SEQUENTIAL', now);
          }
        }
      }
    }

    prevAvailableSub = sub;
  }
}

/**
 * Alasan penguncian sub-modul dengan mempertimbangkan konteks jalur.
 */
export function trackLockReasonOf(
  tier: TierNode,
  mod: ModuleNode,
  sub: SubNode,
  track?: TrackRef | null,
  predSub?: SubNode | null,
): LockReason | null {
  if (sub.status !== 'LOCKED') return null;
  if (!isAvailable(mod, sub)) {
    return { code: 'NOT_PUBLISHED', blocking_sub_module_id: null, message: NOT_PUBLISHED_MESSAGE };
  }
  if (tier.status === 'LOCKED') {
    return { code: 'TIER_LOCKED', blocking_sub_module_id: null, message: TIER_LOCKED_MESSAGE(tier.number) };
  }
  if (track?.kind === 'CURATED') {
    return {
      code: 'PREVIOUS_INCOMPLETE',
      blocking_sub_module_id: predSub?.id ?? null,
      message: predSub ? PREVIOUS_MESSAGE(predSub.title, passOf(predSub)) : PREVIOUS_MESSAGE('materi sebelumnya', 75),
    };
  }
  return lockReasonOf(tier, mod, sub);
}
