export type PlayerTab = 'pelajari' | 'latihan' | 'terapkan';
export type PlayerSub = 'artikel' | 'video' | 'slide';

export type PlayerQuery = {
  tab: PlayerTab;
  sub: PlayerSub;
  /** Detik video untuk dilanjutkan (SPEC-007). */
  t: number | null;
  /** Indeks soal drill untuk dilanjutkan. */
  q: number | null;
  attempt: string | null;
};

const TABS: readonly PlayerTab[] = ['pelajari', 'latihan', 'terapkan'];
const SUBS: readonly PlayerSub[] = ['artikel', 'video', 'slide'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SUB_MODULE_CODE_RE = /^[1-4]\.\d{1,2}\.\d{1,2}$/;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function nonNegInt(v: string | undefined): number | null {
  if (v === undefined || !/^\d{1,6}$/.test(v)) return null;
  return Number(v);
}

/** Query dari URL tidak tepercaya: nilai di luar enum/rentang diabaikan, bukan dipakai. */
export function parsePlayerQuery(sp: Record<string, string | string[] | undefined>): PlayerQuery {
  const tab = one(sp.tab);
  const sub = one(sp.sub);
  const attempt = one(sp.attempt);
  return {
    tab: TABS.find((x) => x === tab) ?? 'pelajari',
    sub: SUBS.find((x) => x === sub) ?? 'artikel',
    t: nonNegInt(one(sp.t)),
    q: nonNegInt(one(sp.q)),
    attempt: attempt && UUID_RE.test(attempt) ? attempt : null,
  };
}

export function subtabFromParam(sub: PlayerSub): 'ARTICLE' | 'VIDEO' | 'SLIDES' {
  return sub === 'video' ? 'VIDEO' : sub === 'slide' ? 'SLIDES' : 'ARTICLE';
}
export function paramFromSubtab(sub: 'ARTICLE' | 'VIDEO' | 'SLIDES'): PlayerSub {
  return sub === 'VIDEO' ? 'video' : sub === 'SLIDES' ? 'slide' : 'artikel';
}
