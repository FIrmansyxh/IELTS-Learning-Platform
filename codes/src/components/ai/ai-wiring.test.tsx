import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplyTab } from '@/components/player/apply-tab';
import { makeDetail } from '@/components/player/fixtures';
import { QuestionRenderer } from '@/components/quiz/question-renderer';
import { Q, makeAttempt } from '@/components/quiz/fixtures';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import type { SubModuleDetail } from '@/contracts/player';
import type { QuestionPublic } from '@/contracts/attempts';
import { AI_STATUS } from './fixtures';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

beforeEach(() => {
  window.localStorage.clear();
  mockFetch((url) => {
    if (url.pathname === '/api/v1/ai/status') return { body: { data: AI_STATUS } };
    if (url.pathname === '/api/v1/auth/me') return { body: { data: { user: { ...USER, consent_recording_at: '2026-11-01T08:00:00.000Z' } } } };
    return { status: 404, body: errorBody('NOT_FOUND', 'x') };
  });
});

function detailWith(taskType: 'AI_SHORT_WRITING' | 'AI_SHORT_SPEAKING', learnDone: boolean, miniDone = false): SubModuleDetail {
  const base = makeDetail();
  return {
    ...base,
    material: { ...base.material, mini_task: { task_type: taskType, prompt: 'Tulis satu paragraf pasif.', success_criteria: 'Tiga struktur.' } },
    progress: {
      ...base.progress,
      learn_completed_at: learnDone ? '2026-11-03T08:00:00.000Z' : null,
      mini_task_completed_at: miniDone ? '2026-11-03T09:00:00.000Z' : null,
    },
  };
}

describe('ApplyTab Mini-Task AI', () => {
  it('AI_SHORT_WRITING memuat editor Writing (bukan lagi slot "Segera hadir")', () => {
    renderWithProviders(<ApplyTab detail={detailWith('AI_SHORT_WRITING', true)} onMarkDone={() => undefined} marking={false} />);
    expect(screen.getByTestId('mini-task-ai')).toHaveAttribute('data-task-type', 'AI_SHORT_WRITING');
    expect(screen.getByLabelText('Tulisan Anda dalam bahasa Inggris')).toBeInTheDocument();
    expect(screen.queryByText('Segera hadir')).not.toBeInTheDocument();
  });

  it('AI_SHORT_SPEAKING memuat alur Speaking', async () => {
    renderWithProviders(<ApplyTab detail={detailWith('AI_SHORT_SPEAKING', true)} onMarkDone={() => undefined} marking={false} />);
    expect(screen.getByTestId('mini-task-ai')).toHaveAttribute('data-task-type', 'AI_SHORT_SPEAKING');
    await waitFor(() => expect(screen.getByTestId('speaking-task')).toBeInTheDocument());
  });

  it('materi belum selesai: petunjuk menyelesaikan materi, tanpa editor', () => {
    renderWithProviders(<ApplyTab detail={detailWith('AI_SHORT_WRITING', false)} onMarkDone={() => undefined} marking={false} />);
    expect(screen.getByTestId('apply-need-learn-ai')).toHaveTextContent('Selesaikan materi di tab Pelajari terlebih dahulu.');
    expect(screen.queryByLabelText('Tulisan Anda dalam bahasa Inggris')).not.toBeInTheDocument();
  });

  it('Mini-Task yang sudah selesai menampilkan status selesai di atas editor', () => {
    renderWithProviders(<ApplyTab detail={detailWith('AI_SHORT_WRITING', true, true)} onMarkDone={() => undefined} marking={false} />);
    expect(screen.getByText('Mini-Task selesai.')).toBeInTheDocument();
  });
});

describe('AiTaskSlot di dalam attempt', () => {
  const writing: QuestionPublic = {
    ...(Object.values(Q).find((q) => q.question_type === 'WRITING_TASK') as QuestionPublic),
    question_id: 'Q-W2',
    prompt: 'Some people believe that...',
    ai_task: { kind: 'WRITING', task_kind: 'TASK2', min_words: 250, time_limit_minutes: 40 },
  };
  const attempt = makeAttempt([writing]);
  const noop = () => undefined;

  it('dengan attemptId memuat editor Writing dengan batas kata soal', () => {
    renderWithProviders(
      <QuestionRenderer question={writing} value={null} onChange={noop} disabled={false} feedback={null} attemptId={attempt.id} remainingSec={1200} />,
    );
    expect(screen.getByLabelText('Tulisan Anda dalam bahasa Inggris')).toBeInTheDocument();
    expect(screen.getByTestId('word-counter')).toHaveTextContent('0 / min. 250 kata');
    expect(screen.getByTestId('writing-timer')).toHaveTextContent('20:00');
  });

  it('tanpa attemptId tetap petunjuk (perilaku lama)', () => {
    renderWithProviders(<QuestionRenderer question={writing} value={null} onChange={noop} disabled={false} feedback={null} />);
    expect(screen.getByTestId('ai-task-slot')).toHaveTextContent('Tugas dinilai AI. Kerjakan di Tab Terapkan.');
  });
});
