import { describe, expect, it } from 'vitest';
import { checkLearnReady, etagMatches, learnDelta, mergeSubtabs, slugifyTitle } from '@/server/player/rules';

const T0 = new Date('2026-11-03T10:00:00.000Z');
const plus = (s: number) => new Date(T0.getTime() + s * 1000);

describe('learnDelta (anti-farming)', () => {
  it('ping pertama dipotong tepat 5 walau klien mengklaim 30', () => {
    expect(learnDelta(30, null, T0)).toBe(5);
    expect(learnDelta(3, null, T0)).toBe(3);
  });
  it('ping berikutnya dibatasi elapsed (10 detik lalu, klaim 30 -> 10)', () => {
    expect(learnDelta(30, T0, plus(10))).toBe(10);
  });
  it('dibatasi klaim dan maksimum 30', () => {
    expect(learnDelta(15, T0, plus(600))).toBe(15);
    expect(learnDelta(500, T0, plus(600))).toBe(30);
  });
  it('jam mundur / ping serentak: elapsed negatif atau nol -> 0', () => {
    expect(learnDelta(30, plus(5), T0)).toBe(0);
    expect(learnDelta(30, T0, T0)).toBe(0);
  });
  it('elapsed memakai detik utuh (floor)', () => {
    expect(learnDelta(30, T0, new Date(T0.getTime() + 9999))).toBe(9);
  });
  it('F-05-01: salvo 30 ping dalam ~1 detik menambah jauh < 60 (total <= waktu dinding + 5)', () => {
    let last: Date | null = null;
    let total = 0;
    for (let i = 0; i < 30; i++) {
      const now = new Date(T0.getTime() + i * 33); // 30 ping dalam ~1 detik
      total += learnDelta(30, last, now);
      last = now;
    }
    expect(total).toBeLessThanOrEqual(5 + 1);
    expect(total).toBe(5);
  });
  it('total tidak pernah melebihi waktu dinding sejak ping pertama + 5 untuk pola ping acak', () => {
    let last: Date | null = null;
    let total = 0;
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += (i * 7919) % 4000; // jeda 0-3,999 ms pseudo-acak
      const now = new Date(T0.getTime() + t);
      total += learnDelta(30, last, now);
      last = now;
    }
    expect(total).toBeLessThanOrEqual(Math.floor(t / 1000) + 5);
  });
});

describe('mergeSubtabs', () => {
  it('tanpa duplikat dan urutan kanonis', () => {
    expect(mergeSubtabs(['VIDEO'], 'ARTICLE')).toEqual(['ARTICLE', 'VIDEO']);
    expect(mergeSubtabs(['ARTICLE', 'VIDEO'], 'VIDEO')).toEqual(['ARTICLE', 'VIDEO']);
    expect(mergeSubtabs([], 'SLIDES')).toEqual(['SLIDES']);
  });
});

describe('checkLearnReady (D-LEARN)', () => {
  const base = { activeSeconds: 61, visited: ['ARTICLE'], minSeconds: 60, hasVideos: false, hasSlides: false };
  it('tanpa video/slide: cukup artikel + waktu', () => {
    expect(checkLearnReady(base).ready).toBe(true);
  });
  it('waktu kurang: insufficient_active_time dengan pesan Indonesia', () => {
    const r = checkLearnReady({ ...base, activeSeconds: 42 });
    expect(r.ready).toBe(false);
    expect(r.issues).toEqual([
      { path: 'learn_active_seconds', code: 'insufficient_active_time', message: 'Waktu belajar aktif minimal 60 detik (sekarang 42).' },
    ]);
  });
  it('video ada tetapi belum dibuka: subtab_not_visited', () => {
    const r = checkLearnReady({ ...base, hasVideos: true });
    expect(r.issues).toEqual([{ path: 'learn_visited_subtabs', code: 'subtab_not_visited', message: 'Buka tab Video terlebih dahulu.' }]);
  });
  it('slide dan video belum dibuka: dua detail; artikel belum dibuka juga dilaporkan', () => {
    const r = checkLearnReady({ ...base, visited: [], hasVideos: true, hasSlides: true });
    expect(r.issues.map((i) => i.message)).toEqual([
      'Buka tab Artikel terlebih dahulu.',
      'Buka tab Video terlebih dahulu.',
      'Buka tab Slide terlebih dahulu.',
    ]);
  });
  it('ambang waktu mengikuti app_settings', () => {
    expect(checkLearnReady({ ...base, activeSeconds: 20, minSeconds: 10 }).ready).toBe(true);
  });
});

describe('util aset', () => {
  it('slugifyTitle aman untuk nama berkas', () => {
    expect(slugifyTitle('Daftar 100 Verb-3 Irregular')).toBe('daftar-100-verb-3-irregular');
    expect(slugifyTitle('../../etc/passwd "x"')).toBe('etc-passwd-x');
    expect(slugifyTitle('Ünïcode Çafé')).toBe('unicode-cafe');
    expect(slugifyTitle('###')).toBe('dokumen');
    expect(slugifyTitle('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
  it('etagMatches menangani daftar, weak validator, dan *', () => {
    expect(etagMatches('"abc"', '"abc"')).toBe(true);
    expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
    expect(etagMatches('"x", "abc"', '"abc"')).toBe(true);
    expect(etagMatches('*', '"abc"')).toBe(true);
    expect(etagMatches('"zzz"', '"abc"')).toBe(false);
    expect(etagMatches(null, '"abc"')).toBe(false);
  });
});
