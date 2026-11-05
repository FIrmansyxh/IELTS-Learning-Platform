import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getCurriculumRoute } from '@/app/api/v1/admin/curriculum/route';
import { GET as getAssessmentSetsRoute } from '@/app/api/v1/admin/assessment-sets/route';
import { GET as getAssessmentSetDetailRoute, PATCH as patchAssessmentSetRoute } from '@/app/api/v1/admin/assessment-sets/[set_id]/route';
import { POST as postStatusRoute } from '@/app/api/v1/admin/[entity]/[id]/status/route';
import { GET as getQualityRoute } from '@/app/api/v1/admin/assessment-sets/[set_id]/quality/route';
import { GET as getRevisionsRoute } from '@/app/api/v1/admin/content-revisions/route';
import {
  changeEntityStatus,
  getAssessmentSetDetail,
  getAssessmentSetsList,
  getContentRevisions,
  getCurriculumTree,
  getQuestionQuality,
  updateAssessmentSet,
} from '@/server/content/curation-service';

vi.mock('@/server/db', () => ({
  getDb: vi.fn(() => ({
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
  })),
}));

vi.mock('@/server/auth/guards', () => ({
  requireUser: vi.fn().mockResolvedValue({
    user: { id: '00000000-0000-4000-8000-000000000001', role: 'admin' },
    refreshedCookie: null,
  }),
}));

vi.mock('@/server/content/curation-service', () => ({
  getCurriculumTree: vi.fn(),
  getAssessmentSetsList: vi.fn(),
  getAssessmentSetDetail: vi.fn(),
  updateAssessmentSet: vi.fn(),
  changeEntityStatus: vi.fn(),
  getQuestionQuality: vi.fn(),
  getContentRevisions: vi.fn(),
}));

describe('Admin Curation API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/admin/curriculum', () => {
    it('mengembalikan pohon kurikulum dengan status 200', async () => {
      vi.mocked(getCurriculumTree).mockResolvedValueOnce([
        {
          tier_number: 1,
          tier_name: 'Foundation',
          modules: [],
        },
      ] as unknown as Awaited<ReturnType<typeof getCurriculumTree>>);

      const req = new Request('http://localhost/api/v1/admin/curriculum');
      const res = await getCurriculumRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].tier_name).toBe('Foundation');
    });
  });

  describe('GET /api/v1/admin/assessment-sets', () => {
    it('mengembalikan daftar set soal dengan pagination', async () => {
      vi.mocked(getAssessmentSetsList).mockResolvedValueOnce({
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Drill Set 1',
            assessment_type: 'ACTIVE_DRILL',
            status: 'PUBLISHED',
            question_count: 5,
            version: 1,
            origin: 'ORIGINAL_AUTHORED',
            scope_label: 'SUB_MODULE',
            updated_at: new Date().toISOString(),
          },
        ] as unknown as Awaited<ReturnType<typeof getAssessmentSetsList>>['data'],
        meta: {
          page: 1,
          page_size: 20,
          total: 1,
        },
      });

      const req = new Request('http://localhost/api/v1/admin/assessment-sets?page=1&page_size=20');
      const res = await getAssessmentSetsRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].title).toBe('Drill Set 1');
    });
  });

  describe('GET & PATCH /api/v1/admin/assessment-sets/[set_id]', () => {
    it('mengembalikan detail set soal dengan status 200', async () => {
      const setId = '22222222-2222-4222-8222-222222222222';
      vi.mocked(getAssessmentSetDetail).mockResolvedValueOnce({
        id: setId,
        title: 'Detail Set',
        assessment_type: 'TIER_BOSS_EXAM',
        status: 'IN_REVIEW',
        question_count: 10,
        version: 2,
        origin: 'AI_GENERATED_REVIEWED',
        scope_label: 'TIER',
        updated_at: new Date().toISOString(),
        time_limit_seconds: 3600,
        pass_percent: 80,
        reading_passage_markdown: null,
        listening_asset_id: null,
        attribution_text: null,
        reviewed_at: null,
        questions: [],
        blockers: [],
      } as unknown as Awaited<ReturnType<typeof getAssessmentSetDetail>>);

      const req = new Request(`http://localhost/api/v1/admin/assessment-sets/${setId}`);
      const res = await getAssessmentSetDetailRoute(req, {
        params: Promise.resolve({ set_id: setId }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.title).toBe('Detail Set');
    });

    it('memperbarui set soal via PATCH', async () => {
      const setId = '22222222-2222-4222-8222-222222222222';
      vi.mocked(updateAssessmentSet).mockResolvedValueOnce({
        id: setId,
        version: 3,
        content_hash: 'abc123hash',
      } as unknown as Awaited<ReturnType<typeof updateAssessmentSet>>);

      const req = new Request(`http://localhost:3000/api/v1/admin/assessment-sets/${setId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ title: 'Judul Baru' }),
      });
      const res = await patchAssessmentSetRoute(req, {
        params: Promise.resolve({ set_id: setId }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.version).toBe(3);
    });
  });

  describe('POST /api/v1/admin/[entity]/[id]/status', () => {
    it('mengubah status entitas dan mengembalikan 200', async () => {
      const id = '33333333-3333-4333-8333-333333333333';
      vi.mocked(changeEntityStatus).mockResolvedValueOnce({
        id,
        entity: 'modules',
        status: 'APPROVED',
        reviewed_at: null,
      });

      const req = new Request(`http://localhost:3000/api/v1/admin/modules/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      });
      const res = await postStatusRoute(req, {
        params: Promise.resolve({ entity: 'modules', id }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.status).toBe('APPROVED');
    });

    it('mengembalikan 404 jika entity slug tidak valid', async () => {
      const id = '33333333-3333-4333-8333-333333333333';
      const req = new Request(`http://localhost:3000/api/v1/admin/invalid-entity/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      });
      const res = await postStatusRoute(req, {
        params: Promise.resolve({ entity: 'invalid-entity', id }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/admin/assessment-sets/[set_id]/quality', () => {
    it('mengembalikan analisis kualitas soal', async () => {
      const setId = '44444444-4444-4444-8444-444444444444';
      vi.mocked(getQuestionQuality).mockResolvedValueOnce({
        set_id: setId,
        questions: [
          {
            question_id: 'q1',
            attempts_count: 50,
            correct_rate: 0.15,
            flag: 'TOO_HARD',
          },
        ],
      });

      const req = new Request(`http://localhost/api/v1/admin/assessment-sets/${setId}/quality`);
      const res = await getQualityRoute(req, {
        params: Promise.resolve({ set_id: setId }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.questions[0].flag).toBe('TOO_HARD');
    });
  });

  describe('GET /api/v1/admin/content-revisions', () => {
    it('mengembalikan daftar riwayat revisi', async () => {
      const entityId = '55555555-5555-4555-8555-555555555555';
      vi.mocked(getContentRevisions).mockResolvedValueOnce({
        data: [
          {
            id: 'rev-1',
            entityType: 'SUB_MODULE',
            entityId,
            version: 2,
            changedByName: 'Admin User',
            importBatchId: null,
            createdAt: new Date(),
          },
        ] as unknown as Awaited<ReturnType<typeof getContentRevisions>>['data'],
        meta: {
          page: 1,
          page_size: 20,
          total: 1,
        },
      });

      const req = new Request(
        `http://localhost/api/v1/admin/content-revisions?entity_type=sub_modules&entity_id=${entityId}`
      );
      const res = await getRevisionsRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].version).toBe(2);
    });
  });
});
