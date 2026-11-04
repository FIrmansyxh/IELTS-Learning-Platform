import { z } from 'zod';
import type { Passage } from './parsePassages';

/** Penyimpanan lokal fitur Reading/Listening (SPEC-010/011). Semua akses dibungkus try/catch. */
export const MAX_HIGHLIGHTS = 200;
export const SPLIT_MIN = 35;
export const SPLIT_MAX = 65;
export const SPLIT_DEFAULT = 50;

export type HighlightColor = 'yellow' | 'green';
export type Highlight = {
  id: string;
  passage_no: number;
  paragraph_index: number;
  start: number;
  end: number;
  color: HighlightColor;
};

const HighlightSchema = z.object({
  id: z.string().min(1),
  passage_no: z.number().int().min(1),
  paragraph_index: z.number().int().min(0),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  color: z.enum(['yellow', 'green']),
});

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* penyimpanan diblokir/penuh: fitur tetap bekerja di memori */
  }
}

const hlKey = (attemptId: string) => `hl:v1:${attemptId}`;
const flagKey = (attemptId: string) => `flag:v1:${attemptId}`;
const audioKey = (attemptId: string) => `audio:v1:${attemptId}`;
const SPLIT_KEY = 'split:v1';

/**
 * Sorotan tersimpan dibaca longgar dan divalidasi terhadap teks saat ini: yang rentangnya keluar dari panjang
 * paragraf (konten diedit admin) dibuang tanpa galat.
 */
export function loadHighlights(attemptId: string, passages: Passage[]): Highlight[] {
  const raw = read(hlKey(attemptId));
  if (!Array.isArray(raw)) return [];
  const out: Highlight[] = [];
  for (const item of raw) {
    const p = HighlightSchema.safeParse(item);
    if (!p.success) continue;
    const h = p.data;
    const len = passages[h.passage_no - 1]?.paragraphs[h.paragraph_index]?.text.length;
    if (len === undefined || h.start >= h.end || h.end > len) continue;
    out.push(h);
    if (out.length >= MAX_HIGHLIGHTS) break;
  }
  return out;
}

export function saveHighlights(attemptId: string, list: Highlight[]): void {
  write(hlKey(attemptId), list);
}

export function loadFlags(attemptId: string): string[] {
  const raw = read(flagKey(attemptId));
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export function saveFlags(attemptId: string, ids: Iterable<string>): void {
  write(flagKey(attemptId), [...ids]);
}

export function clampSplit(n: number): number {
  if (!Number.isFinite(n)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(n)));
}

export function loadSplit(): number {
  const raw = read(SPLIT_KEY);
  const ratio = raw && typeof raw === 'object' ? (raw as { ratio?: unknown }).ratio : undefined;
  return typeof ratio === 'number' ? clampSplit(ratio) : SPLIT_DEFAULT;
}

export function saveSplit(ratio: number): void {
  write(SPLIT_KEY, { ratio: clampSplit(ratio) });
}

export function loadAudioPosition(attemptId: string): number | null {
  const raw = read(audioKey(attemptId));
  const pos = raw && typeof raw === 'object' ? (raw as { position_sec?: unknown }).position_sec : undefined;
  return typeof pos === 'number' && Number.isFinite(pos) && pos >= 0 ? pos : null;
}

export function saveAudioPosition(attemptId: string, positionSec: number): void {
  write(audioKey(attemptId), { position_sec: Math.max(0, Math.floor(positionSec)) });
}

/** Hapus kunci per-attempt (sorotan, tanda, posisi audio) setelah attempt selesai (F-10-03). */
export function clearAttemptStorage(attemptId: string): void {
  try {
    window.localStorage.removeItem(hlKey(attemptId));
    window.localStorage.removeItem(flagKey(attemptId));
    window.localStorage.removeItem(audioKey(attemptId));
  } catch {
    /* penyimpanan diblokir: abaikan */
  }
}

/** Hapus semua kunci ujian (hl/flag/audio/split) dan AI (draft:v1:/ai-sub:v1:, F-12-04) saat logout atau sesi kedaluwarsa (F-10-03). */
export function clearExamStorage(): void {
  try {
    const ls = window.localStorage;
    const doomed: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && (k.startsWith('hl:v1:') || k.startsWith('flag:v1:') || k.startsWith('audio:v1:') || k.startsWith('draft:v1:') || k.startsWith('ai-sub:v1:') || k === SPLIT_KEY)) doomed.push(k);
    }
    for (const k of doomed) ls.removeItem(k);
  } catch {
    /* penyimpanan diblokir: abaikan */
  }
}
