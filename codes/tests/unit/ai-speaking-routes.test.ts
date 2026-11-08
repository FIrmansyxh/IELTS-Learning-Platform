import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST as postConsent } from '@/app/api/v1/me/recording-consent/route';
import { PATCH as patchPreferences } from '@/app/api/v1/me/recording-preferences/route';
import { POST as postSpeaking } from '@/app/api/v1/submissions/speaking/route';
import {
  GET as getRecording,
  DELETE as deleteRecordingRoute,
} from '@/app/api/v1/submissions/[submission_id]/recording/route';
import type {
  RecordingDTO,
  SubmissionDTO,
  SubmissionQuotaDTO,
} from '@/contracts/ai';
import { Readable } from 'node:stream';
import { ApiError } from '@/server/http/errors';

vi.mock('@/server/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/server/auth/guards', () => ({
  requireUser: vi.fn().mockResolvedValue({
    user: { id: '11111111-1111-4111-8111-111111111111', role: 'admin' },
    refreshedCookie: null,
  }),
  toSessionUser: (r: Record<string, unknown>) => ({
    id: r.id,
    email: r.email,
    displayName: r.displayName,
    role: r.role,
    targetBand: r.targetBand ? Number(r.targetBand) : null,
    mustChangePassword: Boolean(r.mustChangePassword),
    consentRecordingAt: r.consentRecordingAt ?? null,
    keepRecordings: r.keepRecordings ?? true,
    placementCompletedAt: r.placementCompletedAt ?? null,
    tokenVersion: 1,
  }),
  toUserDTO: (u: Record<string, unknown>) => ({
    id: u.id,
    email: u.email,
    display_name: u.displayName,
    role: u.role,
    target_band: u.targetBand,
    must_change_password: u.mustChangePassword,
    consent_recording_at: u.consentRecordingAt
      ? (u.consentRecordingAt as Date).toISOString()
      : null,
    keep_recordings: u.keepRecordings,
    placement_completed_at: null,
  }),
}));

vi.mock('@/server/ai/service', () => ({
  recordConsent: vi.fn(),
  updateRecordingPreferences: vi.fn(),
  createSpeakingSubmission: vi.fn(),
  getRecordingStream: vi.fn(),
  deleteRecording: vi.fn(),
}));

import { getDb } from '@/server/db';
import {
  recordConsent,
  updateRecordingPreferences,
  createSpeakingSubmission,
  getRecordingStream,
  deleteRecording,
} from '@/server/ai/service';

describe('AI Speaking Endpoints (SPEC-013)', () => {
  const dummyRecording: RecordingDTO = {
    id: 'c3d4e5f6-7777-4000-8000-0000000000c3',
    mime_type: 'audio/webm',
    size_bytes: 1048576,
    duration_ms: 45000,
    transcript: 'Hello and welcome to the speaking test.',
    stt_confidence: 0.92,
    available: true,
    retention_expires_at: '2027-02-01T00:00:00.000Z',
    purged_at: null,
  };

  const dummySubmission: SubmissionDTO = {
    id: 'a1b2c3d4-9999-4000-8000-0000000000a1',
    kind: 'SPEAKING_PART2',
    status: 'RECEIVED',
    attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
    sub_module_id: null,
    question_id: 'Q-T1-S-01',
    prompt_snapshot: 'Describe a place you like to visit...',
    response_text: null,
    word_count: null,
    duration_sec: 45,
    created_at: '2026-11-04T00:00:00.000Z',
    updated_at: '2026-11-04T00:00:00.000Z',
    job: {
      id: 'b2c3d4e5-8888-4000-8000-0000000000b2',
      kind: 'STT_TRANSCRIBE',
      status: 'QUEUED',
      stage: null,
      progress_percent: 0,
      queue_position: 1,
      error_code: null,
      attempt: 0,
    },
    evaluation: null,
    recording: dummyRecording,
  };

  const dummyQuota: SubmissionQuotaDTO = {
    limit: 10,
    used: 1,
    remaining: 9,
    resets_at: '2026-11-05T00:00:00.000Z',
  };

  const dummyUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'learner@example.com',
    role: 'learner' as const,
    displayName: 'Test Learner',
    targetBand: '7.0',
    mustChangePassword: false,
    consentRecordingAt: new Date('2026-11-04T10:00:00.000Z'),
    keepRecordings: true,
    placementCompletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockReturnValue({} as unknown as ReturnType<typeof getDb>);
  });

  describe('POST /api/v1/me/recording-consent', () => {
    it('mengembalikan status 200 dengan data user saat persetujuan diberikan', async () => {
      vi.mocked(recordConsent).mockResolvedValueOnce(
        dummyUser as unknown as Awaited<ReturnType<typeof recordConsent>>
      );

      const req = new Request('http://localhost:3000/api/v1/me/recording-consent', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const res = await postConsent(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.user.consent_recording_at).toBe('2026-11-04T10:00:00.000Z');
    });
  });

  describe('PATCH /api/v1/me/recording-preferences', () => {
    it('mengembalikan status 200 dan memperbarui keep_recordings', async () => {
      vi.mocked(updateRecordingPreferences).mockResolvedValueOnce({
        ...dummyUser,
        keepRecordings: false,
      } as unknown as Awaited<ReturnType<typeof updateRecordingPreferences>>);

      const req = new Request('http://localhost:3000/api/v1/me/recording-preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ keep_recordings: false }),
      });

      const res = await patchPreferences(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.user.keep_recordings).toBe(false);
    });

    it('mengembalikan 400 jika request body bukan boolean', async () => {
      const req = new Request('http://localhost:3000/api/v1/me/recording-preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ keep_recordings: 'invalid' }),
      });

      const res = await patchPreferences(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/submissions/speaking', () => {
    it('mengembalikan 415 jika request bukan multipart/form-data', async () => {
      const req = new Request('http://localhost:3000/api/v1/submissions/speaking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      });

      const res = await postSpeaking(req);
      expect(res.status).toBe(415);
      const json = await res.json();
      expect(json.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('mengembalikan 202 saat multipart speaking valid dan diproses', async () => {
      vi.mocked(createSpeakingSubmission).mockResolvedValueOnce({
        submission: dummySubmission,
        quota: dummyQuota,
      });

      const webmHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      const padding = Buffer.alloc(1500, 0);
      const fakeWebm = Buffer.concat([webmHeader, padding]);

      const form = new FormData();
      form.append('kind', 'SPEAKING_PART2');
      form.append('attempt_id', '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a');
      form.append('question_id', 'Q-T1-S-01');
      form.append('duration_sec', '45');
      form.append('audio', new Blob([fakeWebm], { type: 'audio/webm' }), 'rec.webm');

      const req = new Request('http://localhost:3000/api/v1/submissions/speaking', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
        body: form,
      });

      const res = await postSpeaking(req);
      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.data.submission.id).toBe(dummySubmission.id);
      expect(json.data.submission.recording?.id).toBe(dummyRecording.id);
    });

    it('mengembalikan 415 jika magic bytes tidak didukung', async () => {
      vi.mocked(createSpeakingSubmission).mockRejectedValueOnce(
        new ApiError('UNSUPPORTED_AUDIO_TYPE', { message: 'Format rekaman tidak didukung.' })
      );

      const invalidAudio = Buffer.alloc(1500, 0x41); // 'AAAA...'

      const form = new FormData();
      form.append('kind', 'SPEAKING_PART2');
      form.append('attempt_id', '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a');
      form.append('question_id', 'Q-T1-S-01');
      form.append('audio', new Blob([invalidAudio], { type: 'audio/webm' }), 'rec.webm');

      const req = new Request('http://localhost:3000/api/v1/submissions/speaking', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
        body: form,
      });

      const res = await postSpeaking(req);
      expect(res.status).toBe(415);
      const json = await res.json();
      expect(json.error.code).toBe('UNSUPPORTED_AUDIO_TYPE');
    });
  });

  describe('GET /api/v1/submissions/[submission_id]/recording', () => {
    it('mengembalikan 200 dan stream audio saat rekaman tersedia', async () => {
      const stream = Readable.from([Buffer.from('dummy audio content')]);
      vi.mocked(getRecordingStream).mockResolvedValueOnce({
        status: 200,
        headers: {
          'Content-Type': 'audio/webm',
          'Accept-Ranges': 'bytes',
        },
        stream: stream as unknown as NodeJS.ReadableStream,
      } as unknown as Awaited<ReturnType<typeof getRecordingStream>>);

      const req = new Request(
        'http://localhost:3000/api/v1/submissions/a1b2c3d4-9999-4000-8000-0000000000a1/recording',
        { method: 'GET' }
      );

      const res = await getRecording(req, {
        params: Promise.resolve({
          submission_id: 'a1b2c3d4-9999-4000-8000-0000000000a1',
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('audio/webm');
      expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    });
  });

  describe('DELETE /api/v1/submissions/[submission_id]/recording', () => {
    it('mengembalikan 204 saat rekaman berhasil dihapus pengguna', async () => {
      vi.mocked(deleteRecording).mockResolvedValueOnce();

      const req = new Request(
        'http://localhost:3000/api/v1/submissions/a1b2c3d4-9999-4000-8000-0000000000a1/recording',
        {
          method: 'DELETE',
          headers: { origin: 'http://localhost:3000' },
        }
      );

      const res = await deleteRecordingRoute(req, {
        params: Promise.resolve({
          submission_id: 'a1b2c3d4-9999-4000-8000-0000000000a1',
        }),
      });

      expect(res.status).toBe(204);
    });
  });
});
