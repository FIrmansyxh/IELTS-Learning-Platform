/** Format kartu Lanjutkan Belajar (SPEC-007) sebagai fungsi murni agar dapat diuji unit. */
export type ResumeTabName = 'LEARN' | 'DRILL' | 'MINI_TASK';
export type SubtabName = 'ARTICLE' | 'VIDEO' | 'SLIDES';

const TAB_QUERY: Record<ResumeTabName, string> = { LEARN: 'pelajari', DRILL: 'latihan', MINI_TASK: 'terapkan' };
const SUB_QUERY: Record<SubtabName, string> = { ARTICLE: 'artikel', VIDEO: 'video', SLIDES: 'slide' };
const pad = (n: number) => String(n).padStart(2, '0');

export interface CardPosition {
  tab: ResumeTabName;
  subtab: SubtabName | null;
  videoSec: number;
  /** Indeks soal valid (attempt valid) atau null. */
  questionIndex: number | null;
  questionCount: number | null;
  attemptId: string | null;
  fallback: boolean;
}

export function positionLabel(p: CardPosition): string {
  if (p.fallback) return 'Sub-modul berikutnya';
  if (p.tab === 'LEARN') {
    if (p.subtab === 'VIDEO') return p.videoSec > 0 ? `Video ${pad(Math.floor(p.videoSec / 60))}:${pad(p.videoSec % 60)}` : 'Video dari awal';
    if (p.subtab === 'SLIDES') return 'Tab Pelajari - Slide';
    return 'Tab Pelajari - Artikel';
  }
  if (p.tab === 'DRILL') {
    return p.questionIndex !== null && p.questionCount !== null ? `Tab Latihan - Soal ${p.questionIndex + 1} dari ${p.questionCount}` : 'Tab Latihan';
  }
  return 'Tab Terapkan';
}

export function resumePath(code: string, p: CardPosition): string {
  let path = `/belajar/${code}?tab=${TAB_QUERY[p.tab]}`;
  if (p.fallback) return path;
  if (p.tab === 'LEARN' && p.subtab) path += `&sub=${SUB_QUERY[p.subtab]}`;
  if (p.tab === 'LEARN' && p.subtab === 'VIDEO' && p.videoSec > 0) path += `&t=${p.videoSec}`;
  if (p.tab === 'DRILL' && p.questionIndex !== null) path += `&q=${p.questionIndex}`;
  if (p.tab === 'DRILL' && p.attemptId) path += `&attempt=${p.attemptId}`;
  return path;
}

/** Tab fallback (D-RESUME langkah 4). */
export function fallbackTab(s: { learnCompleted: boolean; completed: boolean; hasMiniTask: boolean; miniTaskCompleted: boolean }): ResumeTabName {
  if (!s.learnCompleted) return 'LEARN';
  if (!s.completed) return 'DRILL';
  if (s.hasMiniTask && !s.miniTaskCompleted) return 'MINI_TASK';
  return 'LEARN';
}
