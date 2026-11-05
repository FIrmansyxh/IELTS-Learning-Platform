import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET as getRadarRoute } from '@/app/api/v1/me/skills/radar/route';
import { GET as getBandPredictionsRoute } from '@/app/api/v1/me/band-predictions/route';
import { GET as getExamHistoryRoute } from '@/app/api/v1/me/exam-history/route';
import type {
  BandPredictionsResponse,
  ExamHistoryResponse,
  RadarDataDTO,
} from '@/contracts/skills';

vi.mock('@/server/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/server/auth/guards', () => ({
  requireUser: vi.fn().mockResolvedValue({
    user: { id: '11111111-1111-4111-8111-111111111111', role: 'user' },
    refreshedCookie: null,
  }),
}));

vi.mock('@/server/skills/service', () => ({
  getRadarData: vi.fn(),
  getBandPredictionsHistory: vi.fn(),
  getExamHistory: vi.fn(),
}));

import {
  getRadarData,
  getBandPredictionsHistory,
  getExamHistory,
} from '@/server/skills/service';

describe('Radar & History Routes (SPEC-017)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/me/skills/radar', () => {
    it('mengembalikan status 200 dengan 6 skills dan prediksi', async () => {
      const mockRadar: RadarDataDTO = {
        skills: [
          { skill: 'LISTENING', score_percent: 80.0, estimated_band: 7.5, sample_size: 50, is_proxy: false, updated_at: '2026-11-04T10:00:00.000Z' },
          { skill: 'READING', score_percent: 75.0, estimated_band: null, sample_size: 4, is_proxy: false, updated_at: '2026-11-04T10:00:00.000Z' },
          { skill: 'WRITING', score_percent: 66.67, estimated_band: 6.0, sample_size: 3, is_proxy: false, updated_at: '2026-11-04T10:00:00.000Z' },
          { skill: 'SPEAKING', score_percent: null, estimated_band: null, sample_size: 0, is_proxy: false, updated_at: null },
          { skill: 'GRAMMAR', score_percent: 60.0, estimated_band: 6.0, sample_size: 20, is_proxy: true, updated_at: '2026-11-04T10:00:00.000Z' },
          { skill: 'VOCAB', score_percent: null, estimated_band: null, sample_size: 0, is_proxy: true, updated_at: null },
        ],
        target_band: 6.5,
        prediction: {
          overall_band: null,
          indicative_band: 7.0,
          range_low: 6.5,
          range_high: 7.5,
          complete: false,
          components: { LISTENING: 7.5, READING: null, WRITING: 6.0, SPEAKING: null },
          basis_note: 'Indikatif: berdasarkan Listening dan Writing. Selesaikan Writing dan Speaking untuk prediksi lengkap.',
        },
        disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
      };

      vi.mocked(getRadarData).mockResolvedValueOnce(mockRadar);

      const req = new Request('http://localhost/api/v1/me/skills/radar');
      const res = await getRadarRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.skills).toHaveLength(6);
      expect(json.data.target_band).toBe(6.5);
      expect(json.data.prediction.indicative_band).toBe(7.0);
    });
  });

  describe('GET /api/v1/me/band-predictions', () => {
    it('mengembalikan status 200 dengan data riwayat prediksi', async () => {
      const mockPredictions: BandPredictionsResponse = {
        data: [
          {
            id: '11aa22bb-0001-4000-8000-000000000001',
            overall_band: 5.0,
            components: { LISTENING: 5.5, READING: 4.5, WRITING: null, SPEAKING: null },
            trigger: 'BOSS',
            attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
            created_at: '2026-11-01T12:00:00.000Z',
          },
        ],
        meta: { page: 1, page_size: 20, total: 1 },
      };

      vi.mocked(getBandPredictionsHistory).mockResolvedValueOnce(mockPredictions);

      const req = new Request('http://localhost/api/v1/me/band-predictions?page=1&page_size=20');
      const res = await getBandPredictionsRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].trigger).toBe('BOSS');
    });
  });

  describe('GET /api/v1/me/exam-history', () => {
    it('mengembalikan status 200 dengan data riwayat ujian', async () => {
      const mockHistory: ExamHistoryResponse = {
        data: [
          {
            attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
            assessment_type: 'TIER_BOSS_EXAM',
            title: 'Boss Stage Tier 2',
            status: 'GRADED',
            score_percent: 57.5,
            band_score: 6.0,
            passed: true,
            submitted_at: '2026-11-01T12:00:00.000Z',
            result_path: '/ujian/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/hasil',
          },
        ],
        meta: { page: 1, page_size: 20, total: 1 },
      };

      vi.mocked(getExamHistory).mockResolvedValueOnce(mockHistory);

      const req = new Request('http://localhost/api/v1/me/exam-history?assessment_type=TIER_BOSS_EXAM');
      const res = await getExamHistoryRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data[0].assessment_type).toBe('TIER_BOSS_EXAM');
    });

    it('menolak assessment_type=FOO dengan status 400 VALIDATION_ERROR', async () => {
      const req = new Request('http://localhost/api/v1/me/exam-history?assessment_type=FOO');
      const res = await getExamHistoryRoute(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

