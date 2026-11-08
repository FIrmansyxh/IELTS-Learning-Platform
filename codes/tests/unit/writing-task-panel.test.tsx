/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WritingTaskPanel } from '@/components/writing/writing-task-panel';
import { submissionsApi } from '@/lib/api/submissions';
import type { SubmissionDTO } from '@/contracts/ai';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base: SubmissionDTO = {
  id: '3b241101-e2bb-4255-8caf-4136c566a962',
  kind: 'WRITING_TASK1',
  status: 'RECEIVED',
  attempt_id: '11111111-e2bb-4255-8caf-4136c566a962',
  sub_module_id: null,
  question_id: 'Q-GTWF-001',
  prompt_snapshot: 'Write a letter.',
  response_text: 'Dear Sir or Madam, ...',
  word_count: 160,
  duration_sec: 600,
  created_at: '2026-11-08T10:00:00.000Z',
  updated_at: '2026-11-08T10:00:00.000Z',
  job: { id: '22222222-e2bb-4255-8caf-4136c566a962', kind: 'GRADE_WRITING', status: 'QUEUED', stage: null, progress_percent: 0, queue_position: 1, error_code: null, attempt: 0 },
  evaluation: null,
  recording: null,
};
const graded: SubmissionDTO = {
  ...base,
  status: 'GRADED',
  job: null,
  evaluation: {
    id: '33333333-e2bb-4255-8caf-4136c566a962',
    run_number: 1,
    method: 'AI_LOCAL',
    overall_band: 6.5,
    criteria: [
      { key: 'task_response', name: 'Task Achievement', band: 6.5, comment_id: 'Semua poin terjawab.' },
      { key: 'coherence', name: 'Coherence & Cohesion', band: 6.5, comment_id: null },
      { key: 'lexical', name: 'Lexical Resource', band: 6, comment_id: null },
      { key: 'grammar', name: 'Grammatical Range & Accuracy', band: 6.5, comment_id: null },
    ],
    strengths_id: ['Struktur surat jelas.'],
    improvements_id: ['Variasikan kosakata.'],
    corrections: [],
    band7_rewrite: null,
    task_requirement_met: true,
    flags: { injection_suspected: false, score_capped: false, cap_reason: null, high_band_capped: false, non_english_suspected: false, overall_recomputed: false, pronunciation_estimated: false, low_audio_quality: false },
    model_name: 'qwen',
    disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
    created_at: '2026-11-08T10:01:00.000Z',
  },
};

const ctx = { kind: 'WRITING_TASK1', attempt_id: base.attempt_id!, question_id: 'Q-GTWF-001' } as const;
const LETTER = Array.from({ length: 40 }, () => 'word').join(' ');

describe('WritingTaskPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function typeAndSend() {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: LETTER } });
    fireEvent.click(screen.getByRole('button', { name: /Kirim untuk Dinilai/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Ya, kirim/i }));
  }

  it('mengirim tulisan dengan konteks soal, polling sampai GRADED, lalu menampilkan hasil', async () => {
    const create = vi.spyOn(submissionsApi, 'createWriting').mockResolvedValue({ submission: base, quota: { limit: 10, used: 1, remaining: 9, resets_at: null } });
    const get = vi.spyOn(submissionsApi, 'get').mockResolvedValue(graded);

    render(<WritingTaskPanel context={ctx} minWords={20} />);
    await typeAndSend();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const body = create.mock.calls[0]![0];
    expect(body).toMatchObject({ kind: 'WRITING_TASK1', attempt_id: base.attempt_id, question_id: 'Q-GTWF-001', response_text: LETTER });
    expect(body).not.toHaveProperty('overall_band');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await waitFor(() => expect(get).toHaveBeenCalledWith(base.id, expect.anything()));
    expect(await screen.findByText('6.5')).toBeInTheDocument();
  });

  it('status FALLBACK menawarkan Nilai Sendiri', async () => {
    vi.spyOn(submissionsApi, 'createWriting').mockResolvedValue({
      submission: { ...base, status: 'FALLBACK_SELF_ASSESSMENT', job: null },
      quota: { limit: 0, used: 0, remaining: 0, resets_at: null },
    });
    render(<WritingTaskPanel context={ctx} minWords={20} />);
    await typeAndSend();
    expect(await screen.findByRole('button', { name: /Nilai Sendiri/i })).toBeInTheDocument();
  });
});
