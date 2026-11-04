import {
  AiStatusResponseSchema,
  CreateSubmissionResponseSchema,
  RetryResponseSchema,
  SelfAssessmentResponseSchema,
  SubmissionListResponseSchema,
  SubmissionResponseSchema,
  UserEnvelopeSchema,
  type CriteriaScores,
  type SubmissionKindType,
} from './ai-contract';
import { apiFetch, buildUrl } from './client';
import { uploadMultipart, type UploadOptions } from './upload';

export type WritingSubmissionInput =
  | { kind: 'WRITING_TASK1' | 'WRITING_TASK2'; attempt_id: string; question_id: string; response_text: string; duration_sec?: number }
  | { kind: 'MINI_TASK_WRITING'; sub_module_id: string; response_text: string; duration_sec?: number };

export type SpeakingSubmissionInput = {
  kind: Extract<SubmissionKindType, `SPEAKING_${string}` | 'MINI_TASK_SPEAKING'>;
  attempt_id?: string;
  question_id?: string;
  sub_module_id?: string;
  duration_sec?: number;
  audio: Blob;
};

export const aiApi = {
  status: async (signal?: AbortSignal) => (await apiFetch('/ai/status', { schema: AiStatusResponseSchema, signal })).data,
  createWriting: async (body: WritingSubmissionInput) =>
    (await apiFetch('/submissions/writing', { method: 'POST', body, schema: CreateSubmissionResponseSchema })).data,
  createSpeaking: async (input: SpeakingSubmissionInput, opts?: UploadOptions) => {
    const form = new FormData();
    form.set('kind', input.kind);
    if (input.attempt_id) form.set('attempt_id', input.attempt_id);
    if (input.question_id) form.set('question_id', input.question_id);
    if (input.sub_module_id) form.set('sub_module_id', input.sub_module_id);
    if (input.duration_sec !== undefined) form.set('duration_sec', String(Math.round(input.duration_sec)));
    // Ekstensi/Content-Type diabaikan server (MIME dari magic bytes); nama berkas netral.
    form.set('audio', input.audio, 'recording');
    return (await uploadMultipart('/submissions/speaking', form, CreateSubmissionResponseSchema, opts)).data;
  },
  get: async (submissionId: string, signal?: AbortSignal) =>
    (await apiFetch(`/submissions/${submissionId}`, { schema: SubmissionResponseSchema, signal })).data.submission,
  list: async (query: { kind?: SubmissionKindType; page?: number; page_size?: number }, signal?: AbortSignal) =>
    apiFetch('/submissions', { query, schema: SubmissionListResponseSchema, signal }),
  retry: async (submissionId: string) =>
    (await apiFetch(`/submissions/${submissionId}/retry`, { method: 'POST', schema: RetryResponseSchema })).data,
  selfAssess: async (submissionId: string, criteria_scores: CriteriaScores) =>
    (
      await apiFetch(`/submissions/${submissionId}/self-assessment`, {
        method: 'POST',
        body: { criteria_scores },
        schema: SelfAssessmentResponseSchema,
      })
    ).data,
  recordingUrl: (submissionId: string) => buildUrl(`/submissions/${submissionId}/recording`),
  deleteRecording: async (submissionId: string) => {
    await apiFetch(`/submissions/${submissionId}/recording`, { method: 'DELETE' });
  },
  giveConsent: async () => (await apiFetch('/me/recording-consent', { method: 'POST', schema: UserEnvelopeSchema })).data.user,
  setKeepRecordings: async (keep_recordings: boolean) =>
    (await apiFetch('/me/recording-preferences', { method: 'PATCH', body: { keep_recordings }, schema: UserEnvelopeSchema })).data
      .user,
};
