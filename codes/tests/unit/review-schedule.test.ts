import { describe, expect, it } from 'vitest';
import { DAY_MS, isReviewable, nextReviewState, REVIEW_INTERVAL_DAYS } from '@/server/review/schedule';

const T0 = Date.UTC(2026, 10, 11, 8);

describe('penjadwal Leitner (SPEC-026 D3)', () => {
  it('jawaban salah pertama: kotak 1, jatuh tempo +1 hari, lapses 1', () => {
    expect(nextReviewState(null, false, T0)).toEqual({ box: 1, dueAtMs: T0 + DAY_MS, lapses: 1, masteredAtMs: null });
  });

  it('jawaban benar tanpa jadwal tidak membuat jadwal', () => {
    expect(nextReviewState(null, true, T0)).toBeNull();
  });

  it('benar saat jatuh tempo menaikkan kotak 1 -> 5 dengan jeda 3, 7, 14, 30 hari, lalu dikuasai', () => {
    let s = nextReviewState(null, false, T0)!;
    let now = T0;
    for (let box = 2; box <= 5; box++) {
      now = s.dueAtMs!;
      s = nextReviewState(s, true, now)!;
      expect(s.box).toBe(box);
      expect(s.dueAtMs).toBe(now + REVIEW_INTERVAL_DAYS[box - 1]! * DAY_MS);
    }
    now = s.dueAtMs!;
    s = nextReviewState(s, true, now)!;
    expect(s).toEqual({ box: 5, dueAtMs: null, lapses: 1, masteredAtMs: now });
  });

  it('benar sebelum jatuh tempo: jadwal tidak berubah (referensi sama)', () => {
    const s = nextReviewState(null, false, T0)!;
    expect(nextReviewState(s, true, T0 + 1000)).toBe(s);
  });

  it('salah lagi (termasuk setelah dikuasai) kembali ke kotak 1 dan lapses bertambah', () => {
    const mastered = { box: 5, dueAtMs: null, lapses: 2, masteredAtMs: T0 };
    expect(nextReviewState(mastered, false, T0 + DAY_MS)).toEqual({ box: 1, dueAtMs: T0 + 2 * DAY_MS, lapses: 3, masteredAtMs: null });
  });
});

describe('soal yang bisa diulang (SPEC-026 D2)', () => {
  const plain = { readingPassageMarkdown: null, listeningAssetId: null };
  it('soal grammar mandiri bisa diulang', () => {
    expect(isReviewable(plain, { skill: 'GRAMMAR', passage_no: null })).toBe(true);
  });
  it('soal ber-bacaan, ber-audio, Writing, Speaking, dan Listening tidak', () => {
    expect(isReviewable({ readingPassageMarkdown: '# Teks', listeningAssetId: null }, { skill: 'READING' })).toBe(false);
    expect(isReviewable({ readingPassageMarkdown: null, listeningAssetId: 'a1' }, { skill: 'LISTENING' })).toBe(false);
    expect(isReviewable(plain, { skill: 'READING', passage_no: 1 })).toBe(false);
    for (const skill of ['WRITING', 'SPEAKING', 'LISTENING']) expect(isReviewable(plain, { skill })).toBe(false);
  });
});
