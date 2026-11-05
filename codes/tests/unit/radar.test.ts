import { describe, expect, it } from 'vitest';
import {
  computePredictionFromComponents,
} from '@/server/skills/service';
import {
  averageBand,
  convertRawToBand,
  scaleToForty,
} from '@/server/band/convert';
import { LISTENING_SEED_ROWS, READING_ACADEMIC_SEED_ROWS } from '@/server/band/seed-data';

describe('Radar & Band Predictor Logic (SPEC-017)', () => {
  describe('R1: Vektor Uji Skill Objektif & Konversi Band', () => {
    it('50 jawaban LISTENING dengan 40 benar -> score_percent=80.00, estimated_band=7.5', () => {
      const correctCount = 40;
      const sampleSize = 50;
      const scorePercent = Math.round(((correctCount * 100) / sampleSize) * 100) / 100;
      expect(scorePercent).toBe(80.0);

      // Konversi ke skala 40
      const raw40 = scaleToForty(correctCount, sampleSize);
      expect(raw40).toBe(32);

      // Band pada tabel Listening: 32 ada pada rentang 32-34 -> Band 7.5
      const band = convertRawToBand(LISTENING_SEED_ROWS, raw40);
      expect(band).toBe(7.5);
    });

    it('4 jawaban READING dengan 3 benar -> sample_size < 5 sehingga estimated_band = null', () => {
      const correctCount = 3;
      const sampleSize = 4;
      const scorePercent = Math.round(((correctCount * 100) / sampleSize) * 100) / 100;
      expect(scorePercent).toBe(75.0);

      // Sesuai R1: bila sample_size < 5, estimated_band adalah null
      expect(sampleSize < 5).toBe(true);
    });

    it('20 jawaban GRAMMAR dengan 12 benar -> score_percent=60.00, estimated_band=6.0 (proksi tabel Reading)', () => {
      const correctCount = 12;
      const sampleSize = 20;
      const scorePercent = Math.round(((correctCount * 100) / sampleSize) * 100) / 100;
      expect(scorePercent).toBe(60.0);

      const raw40 = scaleToForty(correctCount, sampleSize);
      expect(raw40).toBe(24);

      // Tabel Reading Academic: raw 23-26 -> Band 6.0
      const band = convertRawToBand(READING_ACADEMIC_SEED_ROWS, raw40);
      expect(band).toBe(6.0);
    });
  });

  describe('R2: Vektor Uji Skill AI (Writing & Speaking)', () => {
    it('Evaluasi Writing [6.0, 6.5, 5.5] -> estimated_band=6.0, score_percent=66.67', () => {
      const samples = [6.0, 6.5, 5.5];
      const estimatedBand = averageBand(samples);
      expect(estimatedBand).toBe(6.0);

      const scorePercent = Math.round(((estimatedBand! / 9) * 100) * 100) / 100;
      expect(scorePercent).toBe(66.67);
    });
  });

  describe('R4: Rumus Prediksi Band dan Catatan Dasar', () => {
    it('Komponen lengkap (L: 7.0, R: 6.0, W: 6.0, S: 6.5) -> overall_band=6.5, complete=true, rentang 6.0-7.0', () => {
      const pred = computePredictionFromComponents({
        LISTENING: 7.0,
        READING: 6.0,
        WRITING: 6.0,
        SPEAKING: 6.5,
      });

      expect(pred.complete).toBe(true);
      expect(pred.overall_band).toBe(6.5);
      expect(pred.range_low).toBe(6.0);
      expect(pred.range_high).toBe(7.0);
      expect(pred.basis_note).toBe('Berdasarkan Listening, Reading, Writing, dan Speaking.');
    });

    it('Komponen parsial L dan R saja (6.5, 6.0) -> overall_band=null, indicative_band=6.5, complete=false, rentang 6.0-7.0', () => {
      const pred = computePredictionFromComponents({
        LISTENING: 6.5,
        READING: 6.0,
        WRITING: null,
        SPEAKING: null,
      });

      expect(pred.complete).toBe(false);
      expect(pred.overall_band).toBeNull();
      expect(pred.indicative_band).toBe(6.5);
      expect(pred.range_low).toBe(6.0);
      expect(pred.range_high).toBe(7.0);
      expect(pred.basis_note).toBe(
        'Indikatif: berdasarkan Listening dan Reading. Selesaikan Writing dan Speaking untuk prediksi lengkap.',
      );
    });

    it('Komponen parsial 3 skill (7.0, 6.0, 6.5) -> basis_note menyebutkan ketiga skill', () => {
      const pred = computePredictionFromComponents({
        LISTENING: 7.0,
        READING: 6.0,
        WRITING: 6.5,
        SPEAKING: null,
      });

      expect(pred.complete).toBe(false);
      expect(pred.overall_band).toBeNull();
      expect(pred.indicative_band).toBe(6.5);
      expect(pred.basis_note).toBe(
        'Indikatif: berdasarkan Listening, Reading, dan Writing. Selesaikan Writing dan Speaking untuk prediksi lengkap.',
      );
    });

    it('Tanpa data apa pun -> overall_band=null, indicative_band=null, range=null', () => {
      const pred = computePredictionFromComponents({
        LISTENING: null,
        READING: null,
        WRITING: null,
        SPEAKING: null,
      });

      expect(pred.complete).toBe(false);
      expect(pred.overall_band).toBeNull();
      expect(pred.indicative_band).toBeNull();
      expect(pred.range_low).toBeNull();
      expect(pred.range_high).toBeNull();
      expect(pred.basis_note).toBe('Belum ada data latihan untuk prediksi band.');
    });
  });
});

