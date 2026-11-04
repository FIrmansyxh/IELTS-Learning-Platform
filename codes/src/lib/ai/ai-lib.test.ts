import { describe, expect, it } from 'vitest';
import { AiStatusResponseSchema, CreateSubmissionResponseSchema, SubmissionResponseSchema } from '@/lib/api/ai-contract';
import { annotateText } from './annotate';
import { activeSubKey, clearDraft, draftKey, loadDraft, saveDraft } from './draft';
import { isTerminalStatus, pollIntervalMs } from './job';
import { litSegments, micErrorKind, pickRecorderMime, rmsLevel } from './recorder';
import { AI_STATUS, QUOTA, graded, makeSubmission } from '@/components/ai/fixtures';

describe('annotateText', () => {
  const c = (original: string) => ({ original, improved: 'X', reason_id: 'Y' });

  it('menandai kemunculan pertama persis dan menyisakan teks lain', () => {
    const { segments, unmatched } = annotateText('a b a b', [c('b')]);
    expect(segments.map((s) => [s.text, !!s.correction])).toEqual([['a ', false], ['b', true], [' a b', false]]);
    expect(unmatched).toEqual([]);
  });

  it('koreksi yang tidak ditemukan atau bertabrakan masuk daftar unmatched', () => {
    const { segments, unmatched } = annotateText('hello world', [c('missing'), c('hello'), c('lo wo'), c('')]);
    expect(unmatched.map((u) => u.original)).toEqual(['missing', 'lo wo', '']);
    expect(segments.filter((s) => s.correction).map((s) => s.text)).toEqual(['hello']);
  });

  it('tanpa koreksi mengembalikan satu segmen utuh; urutan mengikuti posisi di teks', () => {
    expect(annotateText('abc', []).segments).toEqual([{ text: 'abc', correction: null }]);
    const r = annotateText('one two three', [c('three'), c('one')]);
    expect(r.segments.filter((s) => s.correction).map((s) => s.text)).toEqual(['one', 'three']);
    expect(r.segments.map((s) => s.text).join('')).toBe('one two three');
  });

  it('tidak pernah menafsirkan HTML: tag tetap teks biasa', () => {
    const { segments } = annotateText('<script>alert(1)</script> ok', [c('ok')]);
    expect(segments[0]?.text).toBe('<script>alert(1)</script> ');
  });
});

describe('job helpers', () => {
  it('polling 2 detik selama 30 detik pertama lalu 5 detik', () => {
    expect(pollIntervalMs(0)).toBe(2000);
    expect(pollIntervalMs(29_999)).toBe(2000);
    expect(pollIntervalMs(30_000)).toBe(5000);
  });
  it('status terminal', () => {
    expect(['GRADED', 'FAILED', 'FALLBACK_SELF_ASSESSMENT'].every((s) => isTerminalStatus(s as 'GRADED'))).toBe(true);
    expect(['RECEIVED', 'TRANSCRIBING', 'GRADING'].some((s) => isTerminalStatus(s as 'GRADED'))).toBe(false);
  });
});

describe('draft', () => {
  it('kunci mengikuti konvensi spec', () => {
    expect(draftKey({ userId: 'u1', attemptId: 'a1', questionId: 'q1' })).toBe('draft:v1:u1:a1:q1');
    expect(draftKey({ userId: 'u1', subModuleId: 's1' })).toBe('draft:v1:u1:s1:mini');
    expect(activeSubKey({ userId: 'u1', subModuleId: 's1', suffix: 'mini-speaking' })).toBe('ai-sub:v1:u1:s1:mini-speaking');
  });
  it('tanpa userId kunci kosong dan tidak ada yang tersimpan', () => {
    expect(draftKey({ subModuleId: 's1' })).toBe('');
    expect(activeSubKey({ subModuleId: 's1' })).toBe('');
    expect(saveDraft('', 'halo')).toBe(false);
    expect(loadDraft('')).toBe('');
  });
  it('tanpa localStorage (node/diblokir) tidak melempar', () => {
    expect(loadDraft('x')).toBe('');
    expect(saveDraft('x', 'halo')).toBe(false);
    expect(() => clearDraft('x')).not.toThrow();
  });
});

describe('recorder helpers', () => {
  it('memilih MIME pertama yang didukung', () => {
    expect(pickRecorderMime(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickRecorderMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecorderMime(() => false)).toBeNull();
  });
  it('level RMS dan segmen menyala', () => {
    expect(rmsLevel(new Uint8Array(64).fill(128))).toBe(0);
    expect(rmsLevel(new Uint8Array(64).fill(255))).toBe(1);
    expect(litSegments(0)).toBe(0);
    expect(litSegments(0.55)).toBe(6);
    expect(litSegments(5)).toBe(10);
  });
  it('klasifikasi galat mikrofon', () => {
    expect(micErrorKind(new DOMException('x', 'NotAllowedError'))).toBe('denied');
    expect(micErrorKind(new DOMException('x', 'NotFoundError'))).toBe('notfound');
    expect(micErrorKind(new Error('x'))).toBe('other');
  });
});

describe('skema kontrak AI', () => {
  it('menerima respons GRADED sesuai contoh spec dan fixture', () => {
    expect(SubmissionResponseSchema.safeParse({ data: { submission: graded() } }).success).toBe(true);
    expect(CreateSubmissionResponseSchema.safeParse({ data: { submission: makeSubmission(), quota: QUOTA } }).success).toBe(true);
    expect(AiStatusResponseSchema.safeParse({ data: AI_STATUS }).success).toBe(true);
  });
  it('quota AI mati (limit 0, resets_at null) valid', () => {
    const q = { limit: 0, used: 0, remaining: 0, resets_at: null };
    expect(CreateSubmissionResponseSchema.safeParse({ data: { submission: makeSubmission({ job: null, status: 'FALLBACK_SELF_ASSESSMENT' }), quota: q } }).success).toBe(true);
  });
  it('drift (field tak dikenal / raw_output) ditolak, tidak ditambal', () => {
    const bad = { data: { submission: { ...graded(), evaluation: { ...graded().evaluation, raw_output: 'x' } } } };
    expect(SubmissionResponseSchema.safeParse(bad).success).toBe(false);
    expect(SubmissionResponseSchema.safeParse({ data: { submission: { ...graded(), status: 'DONE' } } }).success).toBe(false);
  });
});
