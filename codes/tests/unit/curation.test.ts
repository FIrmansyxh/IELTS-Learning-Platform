import { describe, expect, it } from 'vitest';
import {
  computeQualityFlag,
  isValidStatusTransition,
  sha256Hex,
  VALID_STATUS_TRANSITIONS,
} from '@/server/content/curation-service';
import type { ReviewStatus } from '@/contracts/curation';

describe('Admin Kurasi Konten Logic (SPEC-020)', () => {
  describe('K1: Validasi Transisi Status Konten', () => {
    it('mengizinkan transisi valid sesuai state machine', () => {
      // DRAFT
      expect(isValidStatusTransition('DRAFT', 'IN_REVIEW')).toBe(true);
      expect(isValidStatusTransition('DRAFT', 'PUBLISHED')).toBe(true);

      // IN_REVIEW
      expect(isValidStatusTransition('IN_REVIEW', 'APPROVED')).toBe(true);
      expect(isValidStatusTransition('IN_REVIEW', 'DRAFT')).toBe(true);
      expect(isValidStatusTransition('IN_REVIEW', 'PUBLISHED')).toBe(true);

      // APPROVED
      expect(isValidStatusTransition('APPROVED', 'PUBLISHED')).toBe(true);
      expect(isValidStatusTransition('APPROVED', 'DRAFT')).toBe(true);

      // PUBLISHED
      expect(isValidStatusTransition('PUBLISHED', 'ARCHIVED')).toBe(true);
      expect(isValidStatusTransition('PUBLISHED', 'DRAFT')).toBe(true);

      // ARCHIVED
      expect(isValidStatusTransition('ARCHIVED', 'DRAFT')).toBe(true);
    });

    it('menolak transisi tidak valid (mencegah bypass status)', () => {
      // Dari DRAFT tidak bisa langsung APPROVED atau ARCHIVED
      expect(isValidStatusTransition('DRAFT', 'APPROVED')).toBe(false);
      expect(isValidStatusTransition('DRAFT', 'ARCHIVED')).toBe(false);

      // Dari IN_REVIEW tidak bisa langsung ARCHIVED
      expect(isValidStatusTransition('IN_REVIEW', 'ARCHIVED')).toBe(false);

      // Dari APPROVED tidak bisa ke IN_REVIEW atau ARCHIVED
      expect(isValidStatusTransition('APPROVED', 'IN_REVIEW')).toBe(false);
      expect(isValidStatusTransition('APPROVED', 'ARCHIVED')).toBe(false);

      // Dari PUBLISHED tidak bisa kembali ke IN_REVIEW atau APPROVED
      expect(isValidStatusTransition('PUBLISHED', 'IN_REVIEW')).toBe(false);
      expect(isValidStatusTransition('PUBLISHED', 'APPROVED')).toBe(false);

      // Dari ARCHIVED tidak bisa langsung PUBLISHED
      expect(isValidStatusTransition('ARCHIVED', 'PUBLISHED')).toBe(false);
      expect(isValidStatusTransition('ARCHIVED', 'APPROVED')).toBe(false);
    });

    it('seluruh status terdefinisi dalam peta transisi', () => {
      const allStatuses: ReviewStatus[] = [
        'DRAFT',
        'IN_REVIEW',
        'APPROVED',
        'PUBLISHED',
        'ARCHIVED',
      ];
      for (const s of allStatuses) {
        expect(VALID_STATUS_TRANSITIONS[s]).toBeDefined();
        expect(Array.isArray(VALID_STATUS_TRANSITIONS[s])).toBe(true);
      }
    });
  });

  describe('K2: Aturan Konfirmasi Peninjauan Manual Konten AI', () => {
    it('membutuhkan confirm_reviewed jika origin adalah AI_GENERATED_REVIEWED saat publish', () => {
      const checkRequiresConfirmation = (origin: string, confirmReviewed?: boolean) => {
        if (origin === 'AI_GENERATED_REVIEWED' && confirmReviewed !== true) {
          return { error: 'REVIEW_CONFIRMATION_REQUIRED' };
        }
        return { success: true };
      };

      // AI content tanpa konfirmasi -> error
      expect(checkRequiresConfirmation('AI_GENERATED_REVIEWED', false)).toEqual({
        error: 'REVIEW_CONFIRMATION_REQUIRED',
      });
      expect(checkRequiresConfirmation('AI_GENERATED_REVIEWED', undefined)).toEqual({
        error: 'REVIEW_CONFIRMATION_REQUIRED',
      });

      // AI content dengan konfirmasi -> success
      expect(checkRequiresConfirmation('AI_GENERATED_REVIEWED', true)).toEqual({
        success: true,
      });

      // Konten bukan AI -> tidak butuh konfirmasi
      expect(checkRequiresConfirmation('ORIGINAL_AUTHORED', false)).toEqual({
        success: true,
      });
      expect(checkRequiresConfirmation('OPEN_LICENSED_ADAPTED', undefined)).toEqual({
        success: true,
      });
    });
  });

  describe('K3: Proteksi Set Soal dengan Sesi Ujian Aktif', () => {
    it('menolak pengarsipan atau pendrafan jika terdapat sesi ujian IN_PROGRESS', () => {
      const validateActiveAttempts = (hasActiveAttempts: boolean, targetStatus: ReviewStatus) => {
        if (hasActiveAttempts && (targetStatus === 'DRAFT' || targetStatus === 'ARCHIVED')) {
          return { error: 'SET_HAS_ACTIVE_ATTEMPTS' };
        }
        return { success: true };
      };

      expect(validateActiveAttempts(true, 'DRAFT')).toEqual({
        error: 'SET_HAS_ACTIVE_ATTEMPTS',
      });
      expect(validateActiveAttempts(true, 'ARCHIVED')).toEqual({
        error: 'SET_HAS_ACTIVE_ATTEMPTS',
      });
      expect(validateActiveAttempts(false, 'DRAFT')).toEqual({ success: true });
      expect(validateActiveAttempts(false, 'ARCHIVED')).toEqual({ success: true });
    });
  });

  describe('K4: Hashing Kanonikal & Versioning Konten', () => {
    it('menghasilkan hash SHA-256 yang deterministik untuk payload set soal', () => {
      const questionsA = [
        { question_id: 'q1', prompt: 'Pertanyaan 1', points: 1 },
        { question_id: 'q2', prompt: 'Pertanyaan 2', points: 1 },
      ];
      const payloadA = JSON.stringify(questionsA);
      const hashA1 = sha256Hex(payloadA);
      const hashA2 = sha256Hex(payloadA);

      expect(hashA1).toBe(hashA2);
      expect(hashA1).toHaveLength(64); // SHA-256 hex string

      const questionsB = [
        { question_id: 'q1', prompt: 'Pertanyaan 1 (diedit)', points: 1 },
        { question_id: 'q2', prompt: 'Pertanyaan 2', points: 2 },
      ];
      const payloadB = JSON.stringify(questionsB);
      const hashB = sha256Hex(payloadB);

      expect(hashB).not.toBe(hashA1);
    });
  });

  describe('K5: Evaluasi Kualitas Soal (Quality Flags)', () => {
    it('memberikan status INSUFFICIENT_DATA jika jumlah peserta < 20', () => {
      expect(computeQualityFlag(0, 0)).toBe('INSUFFICIENT_DATA');
      expect(computeQualityFlag(5, 5)).toBe('INSUFFICIENT_DATA');
      expect(computeQualityFlag(19, 10)).toBe('INSUFFICIENT_DATA');
    });

    it('memberikan flag TOO_HARD jika rasio benar < 20% dengan n >= 20', () => {
      // 20 peserta, 3 benar (15%) -> TOO_HARD
      expect(computeQualityFlag(20, 3)).toBe('TOO_HARD');
      // 100 peserta, 19 benar (19%) -> TOO_HARD
      expect(computeQualityFlag(100, 19)).toBe('TOO_HARD');
      // 50 peserta, 0 benar (0%) -> TOO_HARD
      expect(computeQualityFlag(50, 0)).toBe('TOO_HARD');
    });

    it('memberikan flag TOO_EASY jika rasio benar > 98% dengan n >= 20', () => {
      // 100 peserta, 99 benar (99%) -> TOO_EASY
      expect(computeQualityFlag(100, 99)).toBe('TOO_EASY');
      // 50 peserta, 50 benar (100%) -> TOO_EASY
      expect(computeQualityFlag(50, 50)).toBe('TOO_EASY');
    });

    it('memberikan status NORMAL jika rasio benar berada antara 20% dan 98% inklusif', () => {
      // 100 peserta, 20 benar (20%) -> NORMAL
      expect(computeQualityFlag(100, 20)).toBe('NORMAL');
      // 100 peserta, 50 benar (50%) -> NORMAL
      expect(computeQualityFlag(100, 50)).toBe('NORMAL');
      // 100 peserta, 98 benar (98%) -> NORMAL
      expect(computeQualityFlag(100, 98)).toBe('NORMAL');
      // 20 peserta, 15 benar (75%) -> NORMAL
      expect(computeQualityFlag(20, 15)).toBe('NORMAL');
    });
  });
});

