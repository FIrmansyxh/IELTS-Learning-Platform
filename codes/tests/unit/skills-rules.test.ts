import { describe, expect, it } from 'vitest';
import { ADEQUATE_SAMPLE, MIN_SAMPLE_FOR_BAND, aiScorePercentHundredths, aiSkillOfKind, bandTableFor, computePrediction, isProxy, percentHundredths, predictionSampleSize, predictionValue } from '@/server/skills/rules';
import { convertRawToBand, scaleToForty } from '@/server/band/convert';
import { LISTENING_SEED_ROWS, READING_ACADEMIC_SEED_ROWS } from '@/server/band/seed-data';

describe('R1 skor objektif', () => {
  it('persen sentesimal: 40/50 = 80,00; 3/4 = 75,00; 12/20 = 60,00; setengah naik (1/3 = 33,33; 2/3 = 66,67; 1/8 = 12,50)', () => {
    expect(percentHundredths(40, 50)).toBe(8000);
    expect(percentHundredths(3, 4)).toBe(7500);
    expect(percentHundredths(12, 20)).toBe(6000);
    expect(percentHundredths(1, 3)).toBe(3333);
    expect(percentHundredths(2, 3)).toBe(6667);
    expect(percentHundredths(1, 8)).toBe(1250);
    expect(percentHundredths(1, 16)).toBe(625);
    expect(percentHundredths(0, 7)).toBe(0);
    expect(percentHundredths(7, 7)).toBe(10000);
  });
  it('vektor uji: LISTENING 40/50 -> raw_40 32 -> band 7.5; GRAMMAR 12/20 -> raw_40 24 -> band 6.0 (tabel Reading)', () => {
    expect(scaleToForty(40, 50)).toBe(32);
    expect(convertRawToBand(LISTENING_SEED_ROWS, 32)).toBe(7.5);
    expect(scaleToForty(12, 20)).toBe(24);
    expect(convertRawToBand(READING_ACADEMIC_SEED_ROWS, 24)).toBe(6);
  });
  it('tabel band: LISTENING -> LISTENING; READING/GRAMMAR/VOCAB -> READING_ACADEMIC; proksi hanya GRAMMAR/VOCAB', () => {
    expect(bandTableFor('LISTENING')).toBe('LISTENING');
    expect(bandTableFor('READING')).toBe('READING_ACADEMIC');
    expect(bandTableFor('GRAMMAR')).toBe('READING_ACADEMIC');
    expect(bandTableFor('VOCAB')).toBe('READING_ACADEMIC');
    expect(['LISTENING', 'READING', 'WRITING', 'SPEAKING', 'GRAMMAR', 'VOCAB'].map((s) => isProxy(s as 'LISTENING'))).toEqual([false, false, false, false, true, true]);
  });
});

describe('R2 skor AI', () => {
  it('band 6.0 -> 66,67%; 7.5 -> 83,33%; 9 -> 100%; 0 -> 0', () => {
    expect(aiScorePercentHundredths(6)).toBe(6667);
    expect(aiScorePercentHundredths(7.5)).toBe(8333);
    expect(aiScorePercentHundredths(9)).toBe(10000);
    expect(aiScorePercentHundredths(0)).toBe(0);
  });
  it('kind -> skill', () => {
    expect(['WRITING_TASK1', 'WRITING_TASK2', 'MINI_TASK_WRITING'].map(aiSkillOfKind)).toEqual(['WRITING', 'WRITING', 'WRITING']);
    expect(['SPEAKING_PART1', 'SPEAKING_PART2', 'SPEAKING_PART3', 'MINI_TASK_SPEAKING'].map(aiSkillOfKind)).toEqual(['SPEAKING', 'SPEAKING', 'SPEAKING', 'SPEAKING']);
    expect(aiSkillOfKind('LAINNYA')).toBeNull();
  });
});

describe('R4 prediksi', () => {
  const none = { LISTENING: null, READING: null, WRITING: null, SPEAKING: null };
  it('semua null: tidak ada overall/indikatif/rentang, complete=false', () => {
    const p = computePrediction(none);
    expect(p).toMatchObject({ overall_band: null, indicative_band: null, range_low: null, range_high: null, complete: false });
    expect(predictionValue(p)).toBeNull();
  });
  it('(7.0, 6.0, 6.0, 6.5) -> overall 6.5 (rata-rata 6.375), complete, rentang 6.0-7.0', () => {
    const p = computePrediction({ LISTENING: 7, READING: 6, WRITING: 6, SPEAKING: 6.5 }, 40);
    expect(p).toMatchObject({ overall_band: 6.5, indicative_band: 6.5, complete: true, range_low: 6, range_high: 7, basis_note: 'Berdasarkan Listening, Reading, Writing, dan Speaking.' });
    expect(predictionValue(p)).toBe(6.5);
  });
  it('hanya (6.5, 6.0) -> indikatif 6.5 (6.25), overall null, rentang 6.0-7.0', () => {
    const p = computePrediction({ ...none, LISTENING: 6.5, READING: 6 }, 40);
    expect(p).toMatchObject({ overall_band: null, indicative_band: 6.5, complete: false, range_low: 6, range_high: 7 });
    expect(p.basis_note).toBe('Indikatif: berdasarkan Listening dan Reading. Selesaikan Writing dan Speaking untuk prediksi lengkap.');
  });
  it('contoh spec: Listening 7.5 + Writing 6.0 -> indikatif 7.0 (6.75), rentang 6.5-7.5, catatan "Listening dan Writing"', () => {
    const p = computePrediction({ ...none, LISTENING: 7.5, WRITING: 6 }, 40);
    expect(p).toMatchObject({ indicative_band: 7, range_low: 6.5, range_high: 7.5 });
    expect(p.basis_note).toBe('Indikatif: berdasarkan Listening dan Writing. Selesaikan Writing dan Speaking untuk prediksi lengkap.');
  });
  it('tiga komponen memakai koma dan "dan"; rentang dijepit 0..9', () => {
    expect(computePrediction({ LISTENING: 5, READING: 5, WRITING: 5, SPEAKING: null }).basis_note).toContain('Listening, Reading, dan Writing');
    expect(computePrediction({ ...none, LISTENING: 0 }, 40)).toMatchObject({ range_low: 0, range_high: 0.5 });
    expect(computePrediction({ LISTENING: 9, READING: 9, WRITING: 9, SPEAKING: 9 }, 50)).toMatchObject({ overall_band: 9, range_low: 8.5, range_high: 9 });
  });
});

describe('F-17-02 sampel kecil', () => {
  const none = { LISTENING: null, READING: null, WRITING: null, SPEAKING: null };
  it('minimum sampel naik ke 10; sampel memadai mulai 30', () => {
    expect(MIN_SAMPLE_FOR_BAND).toBe(10);
    expect(ADEQUATE_SAMPLE).toBe(30);
  });
  it('sampel < 30: rentang +/-1,0, low_sample=true, sample_size dikirim, catatan menyebut sampel kecil', () => {
    const p = computePrediction({ ...none, LISTENING: 7, READING: 6.5 }, 12);
    expect(p).toMatchObject({ indicative_band: 7, range_low: 6, range_high: 8, sample_size: 12, low_sample: true });
    expect(p.basis_note).toContain('Sampel masih kecil (12 soal)');
  });
  it('sampel >= 30: rentang +/-0,5, low_sample=false, catatan tidak berubah', () => {
    const p = computePrediction({ ...none, LISTENING: 7, READING: 6.5 }, 30);
    expect(p).toMatchObject({ range_low: 6.5, range_high: 7.5, sample_size: 30, low_sample: false });
    expect(p.basis_note).not.toContain('Sampel');
  });
  it('tanpa komponen objektif (hanya Writing): sampel null -> indikatif lebar', () => {
    const p = computePrediction({ ...none, WRITING: 6 }, null);
    expect(p).toMatchObject({ range_low: 5, range_high: 7, sample_size: null, low_sample: true });
  });
  it('tanpa data sama sekali: low_sample=false (tidak ada klaim)', () => {
    expect(computePrediction(none)).toMatchObject({ sample_size: null, low_sample: false });
  });
  it('predictionSampleSize: terkecil di antara Listening/Reading yang punya band; Writing/Speaking diabaikan', () => {
    const c = { LISTENING: 7, READING: 6.5, WRITING: 6, SPEAKING: null };
    expect(predictionSampleSize(c, { LISTENING: 40, READING: 15, WRITING: 3 })).toBe(15);
    expect(predictionSampleSize({ ...none, WRITING: 6 }, { WRITING: 3 })).toBeNull();
    expect(predictionSampleSize({ ...none, LISTENING: 7 }, { LISTENING: 25 })).toBe(25);
  });
});
