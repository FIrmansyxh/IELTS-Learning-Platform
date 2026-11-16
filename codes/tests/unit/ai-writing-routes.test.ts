import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST as postWriting } from '@/app/api/v1/submissions/writing/route';
import { GET as getSubmissionRoute } from '@/app/api/v1/submissions/[submission_id]/route';
import { POST as retryRoute } from '@/app/api/v1/submissions/[submission_id]/retry/route';
import { POST as selfAssessRoute } from '@/app/api/v1/submissions/[submission_id]/self-assessment/route';
import { GET as listRoute } from '@/app/api/v1/submissions/route';
import { GET as statusRoute } from '@/app/api/v1/ai/status/route';
import type {
  EvaluationDTO,
  JobDTO,
  SubmissionDTO,
  SubmissionQuotaDTO,
} from '@/contracts/ai';

vi.mock('@/server/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/server/auth/guards', () => ({
  requireUser: vi.fn().mockResolvedValue({
    user: { id: '11111111-1111-4111-8111-111111111111', role: 'admin' },
    refreshedCookie: null,
  }),
}));

vi.mock('@/server/ai/service', () => ({
  createWritingSubmission: vi.fn(),
  getSubmission: vi.fn(),
  retrySubmission: vi.fn(),
  selfAssessSubmission: vi.fn(),
  listSubmissions: vi.fn(),
  getAiStatus: vi.fn(),
}));

import { getDb } from '@/server/db';
import {
  createWritingSubmission,
  getSubmission,
  retrySubmission,
  selfAssessSubmission,
  listSubmissions,
  getAiStatus,
} from '@/server/ai/service';

describe('AI Writing Endpoints (SPEC-012)', () => {
  const dummyJob: JobDTO = {
    id: 'e5d4c3b2-2222-4000-8000-0000000000f2',
    kind: 'GRADE_WRITING',
    status: 'QUEUED',
    stage: null,
    progress_percent: 0,
    queue_position: 1,
    error_code: null,
    attempt: 0,
  };

  const dummySubmission: SubmissionDTO = {
    id: 'd4c3b2a1-1111-4000-8000-0000000000f1',
    kind: 'MINI_TASK_WRITING',
    status: 'RECEIVED',
    attempt_id: null,
    sub_module_id: '7a1b2c3d-0213-4000-8000-000000000213',
    question_id: null,
    prompt_snapshot: 'Test prompt',
    response_text: 'First limestone is harvested. Then it is crushed into powder. Finally it is heated.',
    word_count: 14,
    duration_sec: 120,
    created_at: '2026-11-04T00:00:00.000Z',
    updated_at: '2026-11-04T00:00:00.000Z',
    job: dummyJob,
    evaluation: null,
    recording: null,
  };

  const dummyQuota: SubmissionQuotaDTO = {
    limit: 10,
    used: 1,
    remaining: 9,
    resets_at: '2026-11-05T00:00:00.000Z',
  };

  const dummyEval: EvaluationDTO = {
    id: 'eval-1',
    run_number: 1,
    method: 'SELF_ASSESSMENT',
    overall_band: 6.0,
    criteria: [
      { key: 'task_response', name: 'Task Response', band: 6.0, comment_id: null },
      { key: 'coherence', name: 'Coherence', band: 6.0, comment_id: null },
      { key: 'lexical', name: 'Lexical', band: 6.0, comment_id: null },
      { key: 'grammar', name: 'Grammar', band: 6.0, comment_id: null },
    ],
    strengths_id: [],
    improvements_id: [],
    corrections: [],
    band7_rewrite: null,
    task_requirement_met: true,
    flags: {
      injection_suspected: false,
      score_capped: false,
      cap_reason: null,
      high_band_capped: false,
      non_english_suspected: false,
      overall_recomputed: false,
      pronunciation_estimated: false,
      low_audio_quality: false,
    },
    model_name: null,
    disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
    created_at: '2026-11-04T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockReturnValue({} as unknown as ReturnType<typeof getDb>);
  });

  it('POST /api/v1/submissions/writing: merespons 202 Accepted saat sukses', async () => {
    vi.mocked(createWritingSubmission).mockResolvedValue({
      submission: dummySubmission,
      quota: dummyQuota,
    });

    const req = new Request('http://localhost:3000/api/v1/submissions/writing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        kind: 'MINI_TASK_WRITING',
        sub_module_id: '7a1b2c3d-0213-4000-8000-000000000213',
        response_text: 'First limestone is harvested. Then it is crushed into powder. Finally it is heated.',
        duration_sec: 120,
      }),
    });

    const res = await postWriting(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.submission.id).toBe(dummySubmission.id);
    expect(body.data.quota.remaining).toBe(9);
  });

  it('GET /api/v1/submissions/{id}: merespons 200 dengan submission detail', async () => {
    vi.mocked(getSubmission).mockResolvedValue(dummySubmission);

    const req = new Request('http://localhost:3000/api/v1/submissions/d4c3b2a1-1111-4000-8000-0000000000f1');
    const res = await getSubmissionRoute(req, {
      params: Promise.resolve({ submission_id: 'd4c3b2a1-1111-4000-8000-0000000000f1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.submission.id).toBe(dummySubmission.id);
  });

  it('POST /api/v1/submissions/{id}/retry: merespons 202 Accepted', async () => {
    vi.mocked(retrySubmission).mockResolvedValue({
      submission: dummySubmission,
      quota: dummyQuota,
    });

    const req = new Request('http://localhost:3000/api/v1/submissions/d4c3b2a1-1111-4000-8000-0000000000f1/retry', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });
    const res = await retryRoute(req, {
      params: Promise.resolve({ submission_id: 'd4c3b2a1-1111-4000-8000-0000000000f1' }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.submission.id).toBe(dummySubmission.id);
  });

  it('POST /api/v1/submissions/{id}/self-assessment: merespons 201 Created', async () => {
    vi.mocked(selfAssessSubmission).mockResolvedValue({
      submission: { ...dummySubmission, status: 'GRADED' },
      evaluation: dummyEval,
    });

    const req = new Request('http://localhost:3000/api/v1/submissions/d4c3b2a1-1111-4000-8000-0000000000f1/self-assessment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        criteria_scores: {
          task_response: 6.0,
          coherence: 6.0,
          lexical: 6.0,
          grammar: 6.0,
        },
      }),
    });
    const res = await selfAssessRoute(req, {
      params: Promise.resolve({ submission_id: 'd4c3b2a1-1111-4000-8000-0000000000f1' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.submission.status).toBe('GRADED');
  });

  it('GET /api/v1/submissions: merespons 200 dengan daftar submission paginated', async () => {
    vi.mocked(listSubmissions).mockResolvedValue({
      data: [
        {
          id: dummySubmission.id,
          kind: dummySubmission.kind,
          status: dummySubmission.status,
          overall_band: 6.0,
          method: 'AI_LOCAL',
          word_count: 14,
          prompt_excerpt: 'Test prompt',
          created_at: dummySubmission.created_at,
        },
      ],
      meta: { page: 1, page_size: 20, total: 1 },
    });

    const req = new Request('http://localhost/api/v1/submissions?page=1&page_size=20');
    const res = await listRoute(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.meta.total).toBe(1);
  });

  it('GET /api/v1/ai/status: merespons 200 dengan status AI service', async () => {
    vi.mocked(getAiStatus).mockResolvedValue({
      enabled: true,
      available: true,
      speaking_enabled: true,
      queue: { waiting: 1, estimated_wait_sec: 45 },
      quota: dummyQuota,
      recording_retention_days: 90,
    });

    const req = new Request('http://localhost/api/v1/ai/status');
    const res = await statusRoute(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.enabled).toBe(true);
    expect(body.data.available).toBe(true);
  });
});
