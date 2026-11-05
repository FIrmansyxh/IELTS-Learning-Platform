import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET as getStatsRoute } from '@/app/api/v1/me/stats/route';
import { GET as getPointsRoute } from '@/app/api/v1/me/points/route';
import type { StatsDTO, PointsHistoryResponse } from '@/contracts/gamification';

vi.mock('@/server/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/server/auth/guards', () => ({
  requireUser: vi.fn().mockResolvedValue({
    user: { id: '11111111-1111-4111-8111-111111111111', role: 'user' },
    refreshedCookie: null,
  }),
}));

vi.mock('@/server/gamification/service', () => ({
  getUserStats: vi.fn(),
  getPointsHistory: vi.fn(),
}));

import { getUserStats, getPointsHistory } from '@/server/gamification/service';

describe('Gamification Routes (SPEC-016)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/me/stats', () => {
    it('mengembalikan status 200 dengan data statistik pengguna', async () => {
      const mockStats: StatsDTO = {
        total_points: 365,
        daily_streak_days: 5,
        longest_daily_streak: 7,
        best_speed_streak: 6,
        gold_crowns: 2,
        silver_crowns: 4,
        last_active_date: '2026-11-04',
        streak_at_risk: false,
      };

      vi.mocked(getUserStats).mockResolvedValueOnce(mockStats);

      const req = new Request('http://localhost/api/v1/me/stats');
      const res = await getStatsRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(mockStats);
      expect(json.data.total_points).toBe(365);
      expect(json.data.daily_streak_days).toBe(5);
    });
  });

  describe('GET /api/v1/me/points', () => {
    it('mengembalikan status 200 dengan data riwayat poin terpaginasi', async () => {
      const mockPointsRes: PointsHistoryResponse = {
        data: [
          {
            id: 1042,
            source: 'CROWN',
            points: 50,
            note: 'Mahkota Perak 2.1.3',
            source_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
            created_at: '2026-11-04T10:00:00.000Z',
          },
        ],
        meta: {
          page: 1,
          page_size: 20,
          total: 1,
        },
      };

      vi.mocked(getPointsHistory).mockResolvedValueOnce(mockPointsRes);

      const req = new Request('http://localhost/api/v1/me/points?page=1&page_size=20');
      const res = await getPointsRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].points).toBe(50);
      expect(json.meta.total).toBe(1);
    });

    it('menolak page_size > 50 dengan status 400 VALIDATION_ERROR', async () => {
      const req = new Request('http://localhost/api/v1/me/points?page_size=51');
      const res = await getPointsRoute(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

