import { describe, expect, it } from 'vitest';
import { LISTENING_SEED_ROWS, READING_ACADEMIC_SEED_ROWS } from '@/server/band/seed-data';
import {
  BOSS_SKILL_ORDER,
  bossDeadlineSeconds,
  bossSkillOrder,
  countsForEstimate,
  evaluateGate,
  isGateSkill,
  overallEstimate,
  scoreObjectiveSection,
} from '@/server/exams/boss-rules';

// Bangun SectionScore dari raw40 dengan max 40 poin (1 poin per soal): raw = raw40.
const L = (raw40: number) => scoreObjectiveSection(raw40 * 100, 4000, LISTENING_SEED_ROWS);
const R = (raw40: number) => scoreObjectiveSection(raw40 * 100, 4000, READING_ACADEMIC_SEED_ROWS);
const band = (type: 'BAND', value: number, l: number, r: number) => evaluateGate({ type, value }, L(l), R(r));

describe('SPEC-014 D5: penilaian section objektif', () => {
  it('10 soal 1 poin, 9 benar -> raw_40 36, band Listening 8.0', () => {
    const s = scoreObjectiveSection(900, 1000, LISTENING_SEED_ROWS);
    expect(s.raw40).toBe(36);
    expect(s.band).toBe(8.0);
  });
  it('section tidak pernah dimulai (raw 0) -> raw_40 0, band 0.0', () => {
    expect(scoreObjectiveSection(0, 1000, READING_ACADEMIC_SEED_ROWS)).toMatchObject({ raw40: 0, band: 0 });
  });
  it('max 0 (tak mungkin pada set PUBLISHED) -> raw_40 0 tanpa melempar', () => {
    expect(scoreObjectiveSection(0, 0, LISTENING_SEED_ROWS)).toMatchObject({ raw40: 0, band: 0 });
  });
  it('skor parsial (matching) tetap diskalakan ke bilangan bulat 0-40', () => {
    // 7,5 dari 20 poin -> 40 * 0.375 = 15
    expect(scoreObjectiveSection(750, 2000, READING_ACADEMIC_SEED_ROWS).raw40).toBe(15);
  });
});

describe('SPEC-014 D5 (F-14-03): raw dijepit <= max', () => {
  it('raw > max (set diubah saat attempt berjalan) tidak melempar; raw dijepit ke max', () => {
    const s = scoreObjectiveSection(1200, 1000, LISTENING_SEED_ROWS);
    expect(s).toMatchObject({ rawH: 1000, maxH: 1000, raw40: 40 });
    expect(s.band).toBe(9.0);
  });
  it('gerbang PERCENT memakai raw yang sudah dijepit (tidak dapat > 100%)', () => {
    const l = scoreObjectiveSection(2500, 2000, LISTENING_SEED_ROWS);
    const r = scoreObjectiveSection(0, 2000, READING_ACADEMIC_SEED_ROWS);
    expect(evaluateGate({ type: 'PERCENT', value: 50 }, l, r)).toMatchObject({ passed: true, percentH: 5000 });
  });
  it('raw negatif dijepit ke 0', () => {
    expect(scoreObjectiveSection(-5, 1000, LISTENING_SEED_ROWS)).toMatchObject({ rawH: 0, raw40: 0 });
  });
});

describe('SPEC-014 D6: vektor uji gerbang BAND', () => {
  it.each([
    // [gate, L raw40, R raw40, boss_band, lulus]
    [5.0, 16, 14, 5.0, true], // 5.0 + 4.5 -> 4.75 -> 5.0
    [5.0, 13, 13, 4.5, false], // 4.5, 4.5
    [6.0, 23, 22, 6.0, true], // 6.0 + 5.5 -> 5.75 -> 6.0
    [6.0, 22, 22, 5.5, false], // 5.5, 5.5
    [7.0, 30, 29, 7.0, true], // 7.0 + 6.5 -> 6.75 -> 7.0
  ])('gerbang %s: L %i + R %i -> boss_band %s lulus=%s', (gate, l, r, expBand, expPass) => {
    const out = band('BAND', gate, l, r);
    expect(out.bossBand).toBe(expBand);
    expect(out.passed).toBe(expPass);
  });
  it('contoh kontrak: L 7.5 (32/40) dan R 4.5 (14/40) -> boss_band 6.0, gate 5.0 lulus', () => {
    const out = band('BAND', 5.0, 32, 14);
    expect(out.bossBand).toBe(6.0);
    expect(out.passed).toBe(true);
  });
});

describe('SPEC-014 D6: gerbang PERCENT (poin mentah, bilangan bulat)', () => {
  const sc = (raw: number, max: number, rows = LISTENING_SEED_ROWS) => scoreObjectiveSection(raw * 100, max * 100, rows);
  it('L 9/10 + R 7/10 = 80% -> lulus', () => {
    const o = evaluateGate({ type: 'PERCENT', value: 80 }, sc(9, 10), sc(7, 10, READING_ACADEMIC_SEED_ROWS));
    expect(o.passed).toBe(true);
    expect(o.percentH).toBe(8000);
  });
  it('L 8/10 + R 7/10 = 75% -> gagal', () => {
    const o = evaluateGate({ type: 'PERCENT', value: 80 }, sc(8, 10), sc(7, 10, READING_ACADEMIC_SEED_ROWS));
    expect(o.passed).toBe(false);
    expect(o.percentH).toBe(7500);
  });
  it('16/20 lulus dan 15/20 gagal (soal 20 poin gabungan)', () => {
    expect(evaluateGate({ type: 'PERCENT', value: 80 }, sc(8, 10), sc(8, 10, READING_ACADEMIC_SEED_ROWS)).passed).toBe(true);
    expect(evaluateGate({ type: 'PERCENT', value: 80 }, sc(8, 10), sc(7, 10, READING_ACADEMIC_SEED_ROWS)).passed).toBe(false);
  });
  it('tanpa float: 79,995% tidak lulus gerbang 80', () => {
    // 7999,5 dari 10000 poin-sentesimal tidak dapat direpresentasikan; pakai 15999 dari 20000 (79,995%).
    const o = evaluateGate({ type: 'PERCENT', value: 80 }, { rawH: 7999, maxH: 10000, raw40: 0, band: 0 }, { rawH: 8000, maxH: 10000, raw40: 0, band: 0 });
    expect(o.passed).toBe(false);
  });
  it('band tetap dihitung sebagai informasi', () => {
    expect(evaluateGate({ type: 'PERCENT', value: 80 }, sc(9, 10), sc(7, 10, READING_ACADEMIC_SEED_ROWS)).bossBand).toBeGreaterThan(0);
  });
  it('max total 0 -> tidak lulus', () => {
    const zero = { rawH: 0, maxH: 0, raw40: 0, band: 0 };
    expect(evaluateGate({ type: 'PERCENT', value: 80 }, zero, zero).passed).toBe(false);
  });
});

describe('SPEC-014 D4: waktu dan urutan', () => {
  it('deadline attempt = jumlah time_limit + 1800 detik', () => {
    expect(bossDeadlineSeconds([900, 1200, 2400])).toBe(4500 + 1800);
  });
  it('urutan tetap L -> R -> W -> S dan hanya L/R menentukan gerbang', () => {
    expect([...BOSS_SKILL_ORDER]).toEqual(['LISTENING', 'READING', 'WRITING', 'SPEAKING']);
    expect(bossSkillOrder('READING')).toBe(2);
    expect(bossSkillOrder('SPEAKING')).toBe(4);
    expect(isGateSkill('LISTENING') && isGateSkill('READING')).toBe(true);
    expect(isGateSkill('WRITING') || isGateSkill('SPEAKING')).toBe(false);
  });
});

describe('SPEC-014 D8: estimasi Overall Band', () => {
  it('L 6.5, R 6.0, W 6.0, S 6.0 -> 6.125 dibulatkan resmi 6.0', () => {
    expect(overallEstimate(6.5, 6.0, 6.0, 6.0)).toBe(6.0);
  });
  it('salah satu komponen kosong -> null', () => {
    expect(overallEstimate(6.5, 6.0, null, 6.0)).toBeNull();
    expect(overallEstimate(6.5, 6.0, 6.0, null)).toBeNull();
  });
  it('hanya AI_LOCAL non-injeksi yang dihitung', () => {
    expect(countsForEstimate({ method: 'AI_LOCAL', overallBand: 6, injectionSuspected: false })).toBe(true);
    expect(countsForEstimate({ method: 'SELF_ASSESSMENT', overallBand: 6, injectionSuspected: false })).toBe(false);
    expect(countsForEstimate({ method: 'AI_LOCAL', overallBand: 6, injectionSuspected: true })).toBe(false);
    expect(countsForEstimate({ method: 'AI_LOCAL', overallBand: null, injectionSuspected: false })).toBe(false);
  });
});
