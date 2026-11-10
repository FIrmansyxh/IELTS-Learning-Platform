/**
 * Model tampilan dashboard Bento (C-15): fungsi murni yang menurunkan data kartu dari respons API yang sudah ada,
 * tanpa skema/endpoint baru.
 */
import type { SkillRadarItemDTO, SkillCategoryName } from '@/contracts/skills';
import type { TierNode } from '@/contracts/curriculum';

/** 4 tingkat mahkota koleksi, berdasarkan akurasi terbaik (best_score_percent) sub-modul. */
export type CrownTier = 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD';
export const CROWN_TIERS: readonly CrownTier[] = ['NONE', 'BRONZE', 'SILVER', 'GOLD'] as const;

export const CROWN_BANDS: Record<CrownTier, { min: number; label: string; range: string }> = {
  NONE: { min: 0, label: 'Belum', range: '< 60%' },
  BRONZE: { min: 60, label: 'Perunggu', range: '60 – 74%' },
  SILVER: { min: 75, label: 'Perak', range: '75 – 89%' },
  GOLD: { min: 90, label: 'Emas', range: '≥ 90%' },
};

export function crownForAccuracy(percent: number): CrownTier {
  if (percent >= CROWN_BANDS.GOLD.min) return 'GOLD';
  if (percent >= CROWN_BANDS.SILVER.min) return 'SILVER';
  if (percent >= CROWN_BANDS.BRONZE.min) return 'BRONZE';
  return 'NONE';
}

export interface CrownCollection {
  counts: Record<CrownTier, number>;
  /** Sub-modul yang sudah dikerjakan (punya skor > 0). */
  attempted: number;
}

/** Hitung koleksi mahkota dari seluruh sub-modul yang sudah memiliki skor. */
export function buildCrownCollection(tiers: readonly TierNode[]): CrownCollection {
  const counts: Record<CrownTier, number> = { NONE: 0, BRONZE: 0, SILVER: 0, GOLD: 0 };
  let attempted = 0;
  for (const tier of tiers) {
    for (const mod of tier.modules) {
      for (const sm of mod.sub_modules) {
        if (sm.best_score_percent <= 0) continue;
        attempted += 1;
        counts[crownForAccuracy(sm.best_score_percent)] += 1;
      }
    }
  }
  return { counts, attempted };
}

export interface TierProgress {
  tier_number: number;
  title: string;
  cefr_level: string;
  status: TierNode['status'];
  progress_percent: number;
  locked: boolean;
  /** Skip Test tier tersedia (dapat dikerjakan untuk melompati tier). */
  skip_test_available: boolean;
}

export function buildTierProgress(tiers: readonly TierNode[]): TierProgress[] {
  return [...tiers]
    .sort((a, b) => a.tier_number - b.tier_number)
    .map((t) => ({
      tier_number: t.tier_number,
      title: t.title,
      cefr_level: t.cefr_level,
      status: t.status,
      progress_percent: t.progress_percent,
      locked: t.status === 'LOCKED',
      skip_test_available: t.status !== 'COMPLETED' && t.status !== 'SKIPPED' && t.skip_test.available,
    }));
}

export interface WeakArea {
  skill: SkillCategoryName;
  score_percent: number;
  estimated_band: number | null;
}

/** Area terlemah: skor terendah di antara yang sudah punya data; null bila belum ada data. */
export function findWeakArea(skills: readonly SkillRadarItemDTO[]): WeakArea | null {
  let weakest: SkillRadarItemDTO | null = null;
  for (const s of skills) {
    if (s.sample_size <= 0 || s.score_percent === null) continue;
    if (weakest === null || s.score_percent < (weakest.score_percent ?? 101)) weakest = s;
  }
  if (!weakest || weakest.score_percent === null) return null;
  return { skill: weakest.skill, score_percent: weakest.score_percent, estimated_band: weakest.estimated_band };
}

/** Tautan latihan untuk area lemah (Peta untuk keterampilan inti, Latihan campur untuk tata bahasa/kosakata). */
export function weakAreaHref(skill: SkillCategoryName): string {
  return skill === 'GRAMMAR' || skill === 'VOCAB' ? '/latihan/campur' : '/peta';
}

/** Tanggal lokal (YYYY-MM-DD) dari Date, sama dengan format `last_active_date` API. */
export function localDateString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Target harian = minimal satu sesi belajar; selesai bila aktivitas terakhir jatuh pada hari ini. */
export function isDailyTargetDone(lastActiveDate: string | null, now: Date = new Date()): boolean {
  return lastActiveDate === localDateString(now);
}

export type TargetBandState =
  | { kind: 'NO_TARGET' }
  | { kind: 'NO_PREDICTION'; target: number }
  | { kind: 'TRACKING'; target: number; current: number; gap: number; reached: boolean };

/** Kartu Target Band punya dua kondisi isi: ada prediksi (progres + selisih) atau belum. */
export function buildTargetBandState(target: number | null, predicted: number | null): TargetBandState {
  if (target === null) return { kind: 'NO_TARGET' };
  if (predicted === null) return { kind: 'NO_PREDICTION', target };
  const gap = Math.round((target - predicted) * 10) / 10;
  return { kind: 'TRACKING', target, current: predicted, gap: Math.max(0, gap), reached: gap <= 0 };
}
