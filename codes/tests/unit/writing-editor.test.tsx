// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WritingEditor } from '@/components/writing/writing-editor';
import { AiJobStatus } from '@/components/ai/ai-job-status';
import { EvaluationCard } from '@/components/ai/evaluation-card';
import { SelfAssessmentForm } from '@/components/ai/self-assessment-form';
import type { EvaluationDTO } from '@/contracts/ai';

describe('WritingEditor Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('menampilkan live word counter dan menonaktifkan kirim jika kata kurang dari batas', () => {
    const onSubmit = vi.fn();
    render(
      <WritingEditor
        prompt="Write at least 20 words about education."
        kind="WRITING_TASK2"
        minWords={20}
        onSubmit={onSubmit}
      />,
    );

    const textarea = screen.getByRole('textbox');
    const submitBtn = screen.getByRole('button', { name: /kirim untuk dinilai/i });
    expect(submitBtn).toBeDisabled();

    // Ketik 5 kata
    fireEvent.change(textarea, { target: { value: 'This is a short sentence.' } });
    expect(screen.getByTestId('word-counter')).toHaveTextContent('5 kata');
    expect(submitBtn).toBeDisabled();

    // Ketik 21 kata
    const longText =
      'Education is extremely important for the modern development of individuals and societies across the world today, helping people achieve their fullest potential.';
    fireEvent.change(textarea, { target: { value: longText } });
    expect(screen.getByTestId('word-counter')).toHaveTextContent('22 kata');
    expect(submitBtn).not.toBeDisabled();
  });

  it('membuka dialog konfirmasi sebelum mengirim tulisan', async () => {
    const onSubmit = vi.fn();
    render(
      <WritingEditor
        prompt="Mini-task prompt"
        kind="MINI_TASK_WRITING"
        minWords={5}
        onSubmit={onSubmit}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'First, the limestone is crushed into powder.' } });

    const submitBtn = screen.getByRole('button', { name: /kirim untuk dinilai/i });
    fireEvent.click(submitBtn);

    // Dialog konfirmasi muncul
    expect(await screen.findByText(/kirim tulisan untuk dinilai\?/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /ya, kirim/i });
    fireEvent.click(confirmBtn);

    expect(onSubmit).toHaveBeenCalledWith('First, the limestone is crushed into powder.');
  });
});

describe('AiJobStatus Component', () => {
  it('menampilkan status antrean dengan nomor posisi', () => {
    render(
      <AiJobStatus
        status="RECEIVED"
        job={{
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'GRADE_WRITING',
          status: 'QUEUED',
          stage: null,
          progress_percent: 10,
          queue_position: 3,
          error_code: null,
          attempt: 0,
        }}
      />,
    );

    expect(screen.getByText(/menunggu antrean \(posisi 3\)/i)).toBeInTheDocument();
  });

  it('menampilkan status gagal dengan tombol coba lagi dan nilai sendiri', () => {
    const onRetry = vi.fn();
    const onSelfAssess = vi.fn();

    render(
      <AiJobStatus
        status="FAILED"
        job={{
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'GRADE_WRITING',
          status: 'FAILED',
          stage: 'GRADING',
          progress_percent: 50,
          queue_position: null,
          error_code: 'LLM_ERROR',
          attempt: 1,
        }}
        onRetry={onRetry}
        onSelfAssess={onSelfAssess}
      />,
    );

    expect(screen.getByText(/penilaian ai belum berhasil/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /coba lagi/i });
    const selfBtn = screen.getByRole('button', { name: /nilai sendiri/i });

    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(selfBtn);
    expect(onSelfAssess).toHaveBeenCalledTimes(1);
  });
});

describe('EvaluationCard Component', () => {
  const dummyEvaluation: EvaluationDTO = {
    id: 'f6e5d4c3-3333-4000-8000-0000000000f3',
    run_number: 1,
    method: 'AI_LOCAL',
    overall_band: 6.5,
    criteria: [
      { key: 'task_response', name: 'Task Response', band: 6.5, comment_id: 'Semua poin terjawab.' },
      { key: 'coherence', name: 'Coherence & Cohesion', band: 6.0, comment_id: 'Alur runtut.' },
      { key: 'lexical', name: 'Lexical Resource', band: 6.5, comment_id: 'Kosakata cukup luas.' },
      { key: 'grammar', name: 'Grammatical Range & Accuracy', band: 6.5, comment_id: 'Tata bahasa baik.' },
    ],
    strengths_id: ['Pemilihan frasa penghubung variatif.'],
    improvements_id: ['Tingkatkan variasi kalimat majemuk.'],
    corrections: [
      { original: 'many peoples', improved: 'many people', reason_id: 'People sudah jamak.' },
    ],
    band7_rewrite: 'In modern society, education plays a critical role...',
    task_requirement_met: true,
    flags: {
      injection_suspected: false,
      score_capped: true,
      cap_reason: 'word_count',
      high_band_capped: false,
      non_english_suspected: false,
      overall_recomputed: true,
      pronunciation_estimated: false,
      low_audio_quality: false,
    },
    model_name: 'mock',
    disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
    created_at: '2026-11-04T00:00:00.000Z',
  };

  it('merender skor overall, 4 kriteria, disclaimer, dan banner cap word count', () => {
    render(<EvaluationCard evaluation={dummyEvaluation} />);

    expect(screen.getByText('6.5')).toBeInTheDocument();
    expect(screen.getByText(/perkiraan latihan, bukan skor resmi ielts/i)).toBeInTheDocument();
    expect(screen.getByText('Task Response')).toBeInTheDocument();
    expect(screen.getByText('Coherence & Cohesion')).toBeInTheDocument();
    expect(screen.getByText(/skor dibatasi karena jumlah kata di bawah batas/i)).toBeInTheDocument();
    expect(screen.getByText('many peoples')).toBeInTheDocument();
    expect(screen.getByText('many people')).toBeInTheDocument();
  });
});

describe('SelfAssessmentForm Component', () => {
  it('menghitung rata-rata band secara langsung dan memicu submit', () => {
    const onSubmit = vi.fn();
    render(<SelfAssessmentForm onSubmit={onSubmit} />);

    // Default semua 6.0 -> overall 6.0
    expect(screen.getByText('6.0')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /simpan penilaian/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      task_response: 6.0,
      coherence: 6.0,
      lexical: 6.0,
      grammar: 6.0,
    });
  });
});
