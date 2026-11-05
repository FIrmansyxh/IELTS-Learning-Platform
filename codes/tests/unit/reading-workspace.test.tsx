// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingWorkspace } from '@/components/reading/reading-workspace';
import { renderHighlightedText, type Highlight } from '@/components/reading/highlight-utils';
import type { Attempt, QuestionPublic } from '@/contracts/attempts';

// Mock navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

const samplePassageMarkdown = `# Teknologi Ramah Lingkungan

[A] Paragraf pertama tentang teknologi ramah lingkungan di masa kini.

[B] Paragraf kedua menjelaskan pemanfaatan energi surya dan angin.

===PASSAGE===

# Konservasi Air Bersih

[A] Paragraf teks kedua tentang konservasi air di perkotaan.
`;

const sampleQuestions: QuestionPublic[] = [
  {
    question_id: 'Q1',
    question_type: 'MCQ_SINGLE',
    skill: 'READING',
    prompt: 'Apa topik paragraf A pada teks 1?',
    points: 1,
    target_time_ms: null,
    options: [
      { option_id: 'opt-a', text: 'Opsi A' },
      { option_id: 'opt-b', text: 'Opsi B' },
      { option_id: 'opt-c', text: 'Opsi C' },
    ],
    choose_count: null,
    fixed_choices: null,
    max_words: null,
    matching: null,
    segments: null,
    tokens: null,
    ai_task: null,
    passage_no: 1,
  },
  {
    question_id: 'Q2',
    question_type: 'TFNG',
    skill: 'READING',
    prompt: 'Energi surya tidak bermanfaat.',
    points: 1,
    target_time_ms: null,
    options: [
      { option_id: 'opt-t', text: 'TRUE' },
      { option_id: 'opt-f', text: 'FALSE' },
      { option_id: 'opt-ng', text: 'NOT GIVEN' },
    ],
    choose_count: null,
    fixed_choices: null,
    max_words: null,
    matching: null,
    segments: null,
    tokens: null,
    ai_task: null,
    passage_no: 1,
  },
  {
    question_id: 'Q3',
    question_type: 'MCQ_SINGLE',
    skill: 'READING',
    prompt: 'Apa fokus teks 2?',
    points: 1,
    target_time_ms: null,
    options: [
      { option_id: 'opt-1', text: 'Air' },
      { option_id: 'opt-2', text: 'Udara' },
      { option_id: 'opt-3', text: 'Tanah' },
    ],
    choose_count: null,
    fixed_choices: null,
    max_words: null,
    matching: null,
    segments: null,
    tokens: null,
    ai_task: null,
    passage_no: 2,
  },
];

const mockAttempt: Attempt = {
  id: 'att-12345',
  assessment_set_id: 'set-reading-1',
  assessment_type: 'SKIP_MODULE_TEST',
  mode: 'EXAM',
  title: 'Reading Test Wave 5',
  status: 'IN_PROGRESS',
  time_limit_seconds: 1200,
  server_now: new Date().toISOString(),
  started_at: new Date().toISOString(),
  deadline_at: new Date(Date.now() + 1200000).toISOString(),
  remaining_seconds: 1200,
  pass_percent: 85,
  question_count: 3,
  answered_count: 0,
  current_index: 0,
  passage_markdown: samplePassageMarkdown,
  listening: null,
  questions: sampleQuestions,
  answers: [],
  resumed: false,
};

describe('ReadingWorkspace and Highlighter (SPEC-010)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders two panels and splitter with separator ARIA attributes (desktop)', () => {
    render(<ReadingWorkspace attempt={mockAttempt} />);

    const separator = screen.getByRole('separator', { name: /pembagi panel bacaan/i });
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuemin', '35');
    expect(separator).toHaveAttribute('aria-valuemax', '65');
    expect(separator).toHaveAttribute('aria-valuenow', '50');
  });

  it('resizes separator with ArrowRight and ArrowLeft keys and clamps between 35 and 65', () => {
    render(<ReadingWorkspace attempt={mockAttempt} />);

    const separator = screen.getByRole('separator', { name: /pembagi panel bacaan/i });

    // Press ArrowRight 3 times: 50 -> 55 -> 60 -> 65
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '55');

    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '60');

    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '65');

    // 4th press stays clamped at 65
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '65');

    // Press ArrowLeft repeatedly to reach minimum 35
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    }
    expect(separator).toHaveAttribute('aria-valuenow', '35');

    // Saved to localStorage['split:v1']
    expect(JSON.parse(localStorage.getItem('split:v1') ?? '{}')).toEqual({ ratio: 35 });
  });

  it('loads saved split ratio from localStorage', () => {
    localStorage.setItem('split:v1', JSON.stringify({ ratio: 42 }));
    render(<ReadingWorkspace attempt={mockAttempt} />);

    const separator = screen.getByRole('separator', { name: /pembagi panel bacaan/i });
    expect(separator).toHaveAttribute('aria-valuenow', '42');
  });

  it('displays passage titles and paragraph margin labels without labels in paragraph body', () => {
    render(<ReadingWorkspace attempt={mockAttempt} />);

    expect(screen.getByText('Teknologi Ramah Lingkungan')).toBeInTheDocument();

    // Paragraph A & B labels exist in margin
    expect(screen.getByLabelText('Paragraf A')).toHaveTextContent('[A]');
    expect(screen.getByLabelText('Paragraf B')).toHaveTextContent('[B]');

    // Paragraph texts do not have the "[A]" or "[B]" prefix in body
    expect(
      screen.getByText('Paragraf pertama tentang teknologi ramah lingkungan di masa kini.'),
    ).toBeInTheDocument();
  });

  it('renders highlighted text cleanly via <mark> without innerHTML', () => {
    const text = 'Energi terbarukan sangat penting bagi masa depan dunia.';
    const highlights: Highlight[] = [
      {
        id: 'hl-1',
        passage_no: 1,
        paragraph_index: 0,
        start: 0,
        end: 17,
        color: 'yellow',
      },
      {
        id: 'hl-2',
        passage_no: 1,
        paragraph_index: 0,
        start: 38,
        end: 54,
        color: 'green',
      },
    ];

    const { container } = render(<div>{renderHighlightedText(text, highlights)}</div>);

    const yellowMark = container.querySelector('[data-testid="highlight-yellow"]');
    const greenMark = container.querySelector('[data-testid="highlight-green"]');

    expect(yellowMark).toBeInTheDocument();
    expect(yellowMark).toHaveTextContent('Energi terbarukan');

    expect(greenMark).toBeInTheDocument();
    expect(greenMark).toHaveTextContent('masa depan dunia');

    // Middle text is unhighlighted plain text
    expect(container).toHaveTextContent('sangat penting bagi');
  });

  it('switches passages and filters questions corresponding to that passage', () => {
    render(<ReadingWorkspace attempt={mockAttempt} />);

    // By default, passage 1 is active with 2 questions (Q1, Q2)
    expect(screen.getByText('Teks 1: Soal 1-2')).toBeInTheDocument();

    // Click Teks 2 tab
    const text2Btn = screen.getByRole('button', { name: /teks 2/i });
    fireEvent.click(text2Btn);

    // Title switches to Konservasi Air Bersih
    expect(screen.getByText('Konservasi Air Bersih')).toBeInTheDocument();
    // Question header switches to Teks 2: Soal 3-3
    expect(screen.getByText('Teks 2: Soal 3-3')).toBeInTheDocument();
  });

  it('flags questions and persists them in localStorage', () => {
    render(<ReadingWorkspace attempt={mockAttempt} />);

    const flagBtn = screen.getByRole('button', { name: /tandai soal/i });
    expect(flagBtn).toHaveAttribute('aria-pressed', 'false');

    // Click flag
    fireEvent.click(flagBtn);
    expect(flagBtn).toHaveAttribute('aria-pressed', 'true');

    // Check localStorage
    const savedFlags = JSON.parse(localStorage.getItem(`flag:v1:${mockAttempt.id}`) ?? '[]');
    expect(savedFlags).toContain('Q1');
  });

  it('supports mobile tab switching between Teks and Soal', () => {
    render(<ReadingWorkspace attempt={mockAttempt} />);

    const textTab = screen.getByRole('tab', { name: /teks/i });
    const questionsTab = screen.getByRole('tab', { name: /soal/i });

    expect(textTab).toBeInTheDocument();
    expect(questionsTab).toBeInTheDocument();
    expect(textTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(questionsTab);
    expect(questionsTab).toHaveAttribute('aria-selected', 'true');
    expect(textTab).toHaveAttribute('aria-selected', 'false');
  });

  it('handles empty or broken passage markdown with fallback card without throwing', () => {
    const brokenAttempt = {
      ...mockAttempt,
      passage_markdown: 'P1\n===PASSAGE===\nP2\n===PASSAGE===\nP3\n===PASSAGE===\nP4',
    };

    render(<ReadingWorkspace attempt={brokenAttempt} />);

    expect(screen.getByText('Teks bacaan tidak dapat ditampilkan')).toBeInTheDocument();
    // Questions are still accessible and rendered
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Soal 1 dari 3');
  });
});
