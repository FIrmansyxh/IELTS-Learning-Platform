import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExamShell } from './exam-shell';
import { QuestionNavigatorGrid } from './question-navigator-grid';

describe('QuestionNavigatorGrid', () => {
  it('status terjawab/ditandai/kosong lewat nama aksesibel, bukan warna; klik memilih soal', () => {
    const onSelect = vi.fn();
    render(
      <QuestionNavigatorGrid
        currentIndex={1}
        onSelect={onSelect}
        items={[
          { questionId: 'a', answered: true, flagged: false },
          { questionId: 'b', answered: false, flagged: true },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ke soal 1, Terjawab' })).toBeInTheDocument();
    const second = screen.getByRole('button', { name: 'Ke soal 2, Kosong, Ditandai' });
    expect(second).toHaveAttribute('aria-current', 'step');
    fireEvent.click(second);
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

describe('ExamShell', () => {
  it('timer, dialog konfirmasi akhiri dengan jumlah belum dijawab, dan beforeunload aktif', () => {
    const onEnd = vi.fn();
    render(
      <ExamShell title="Skip Test" remainingSeconds={125} unansweredCount={3} onEnd={onEnd}>
        <p>isi</p>
      </ExamShell>,
    );
    expect(screen.getByRole('timer')).toHaveTextContent('02:05');
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Akhiri' }));
    expect(screen.getByText(/3 soal belum dijawab/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya, akhiri' }));
    expect(onEnd).toHaveBeenCalled();
  });
});
