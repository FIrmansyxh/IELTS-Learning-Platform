import { fireEvent, render, screen, within } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AnswerResponse, QuestionPublic } from '@/contracts/attempts';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initialResponse, isAnswerReady } from './answer-utils';
import { Q } from './fixtures';
import { QuestionRenderer } from './question-renderer';

/** Pembungkus stateful: meniru induk yang menyimpan jawaban lalu memeriksa respons akhir. */
function Harness({ q, onValue, disabled = false }: { q: QuestionPublic; onValue?: (v: AnswerResponse | null) => void; disabled?: boolean }) {
  const [value, setValue] = React.useState<AnswerResponse | null>(initialResponse(q));
  return (
    <TooltipProvider>
      <QuestionRenderer
        question={q}
        value={value}
        disabled={disabled}
        feedback={null}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
      />
    </TooltipProvider>
  );
}

describe('renderer per tipe soal', () => {
  it('MCQ_SINGLE: radio, satu pilihan, huruf A-D, hanya option_id yang dikirim', () => {
    const spy = vi.fn();
    render(<Harness q={Q.mcq} onValue={spy} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    fireEvent.click(radios[1]!);
    expect(spy).toHaveBeenLastCalledWith({ option_ids: ['o3x9aw'] });
    fireEvent.click(radios[2]!);
    expect(spy).toHaveBeenLastCalledWith({ option_ids: ['oh2m5d'] });
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('MCQ_MULTI: "Pilih 2 jawaban" dan dibatasi sebanyak choose_count', () => {
    const spy = vi.fn();
    render(<Harness q={Q.multi} onValue={spy} />);
    expect(screen.getByText('Pilih 2 jawaban')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[2]!);
    expect(spy).toHaveBeenLastCalledWith({ option_ids: ['oa1', 'oc3'] });
    expect(boxes[1]).toBeDisabled();
  });

  it('TFNG: tiga tombol segmented bahasa Inggris', () => {
    const spy = vi.fn();
    render(<Harness q={Q.tfng} onValue={spy} />);
    const group = screen.getByRole('radiogroup');
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: 'Not Given' }));
    expect(spy).toHaveBeenLastCalledWith({ choice: 'Not Given' });
  });

  it('YNNG memakai Yes/No/Not Given', () => {
    render(<Harness q={Q.ynng} />);
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeInTheDocument();
  });

  it('FILL_IN_BLANK: penghitung kata live dan peringatan role=alert saat melebihi batas (tombol tetap bisa dipakai)', () => {
    const spy = vi.fn();
    render(<Harness q={Q.fill} onValue={spy} />);
    expect(screen.getByText('Maksimal 2 kata dan/atau angka')).toBeInTheDocument();
    const input = screen.getByLabelText('Jawaban Anda');
    fireEvent.change(input, { target: { value: 'are sorted quickly' } });
    expect(screen.getByText('3 kata')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('melebihi 2 kata');
    expect(spy).toHaveBeenLastCalledWith({ text: 'are sorted quickly' });
    expect(isAnswerReady(Q.fill, { text: 'are sorted quickly' })).toBe(true);
    expect(isAnswerReady(Q.fill, { text: '   ' })).toBe(false);
  });

  it('SHORT_ANSWER memakai input yang sama', () => {
    render(<Harness q={Q.short} />);
    expect(screen.getByText('Maksimal 3 kata dan/atau angka')).toBeInTheDocument();
  });

  it('MATCHING_DROPDOWN: alternatif <select> menyusun pairs; pilihan yang dipakai butir lain dinonaktifkan', () => {
    const spy = vi.fn();
    render(<Harness q={Q.matchSelect} onValue={spy} />);
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    fireEvent.change(selects[0]!, { target: { value: 'cB' } });
    fireEvent.change(selects[1]!, { target: { value: 'cA' } });
    expect(spy).toHaveBeenLastCalledWith({
      pairs: [
        { item_id: 'i0', choice_id: 'cB' },
        { item_id: 'i1', choice_id: 'cA' },
      ],
    });
    expect(within(selects[1]!).getByRole('option', { name: 'cepat' })).toBeDisabled();
    fireEvent.change(selects[0]!, { target: { value: '' } });
    expect(spy).toHaveBeenLastCalledWith({ pairs: [{ item_id: 'i1', choice_id: 'cA' }] });
  });

  it('MATCHING_DRAG: tersedia toggle ke pilihan daftar (alternatif non-drag) yang bisa dipakai tanpa mouse', () => {
    const spy = vi.fn();
    render(<Harness q={Q.matchDrag} onValue={spy} />);
    // Tanpa matchMedia (jsdom) desktop = mode drag; chip seret tampil.
    expect(screen.getByRole('button', { name: 'Seret cepat' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gunakan pilihan daftar' }));
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'cB' } });
    expect(spy).toHaveBeenLastCalledWith({ pairs: [{ item_id: 'i0', choice_id: 'cB' }] });
    expect(screen.getByRole('button', { name: 'Gunakan seret & lepas' })).toBeInTheDocument();
  });

  it('SENTENCE_REORDER: tombol Naik/Turun (keyboard) mengubah urutan; nilai awal = urutan disajikan', () => {
    const spy = vi.fn();
    render(<Harness q={Q.reorder} onValue={spy} />);
    const items = () => screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items()[0]).toContain('are sorted');
    fireEvent.click(screen.getByRole('button', { name: 'Turunkan "are sorted"' }));
    expect(spy).toHaveBeenLastCalledWith({ segment_ids: ['s1', 's2', 's3'] });
    expect(items()[0]).toContain('The bottles');
    expect(screen.getByRole('button', { name: 'Naikkan "The bottles"' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Turunkan "are sorted"' }));
    expect(spy).toHaveBeenLastCalledWith({ segment_ids: ['s1', 's3', 's2'] });
    expect(screen.getByText(/dipindah ke posisi 3 dari 3/)).toBeInTheDocument();
  });

  it('ERROR_RECOGNITION: ketuk token memberi tanda teks "Ditandai" dan dibatasi 3', () => {
    const spy = vi.fn();
    render(<Harness q={Q.error} onValue={spy} />);
    const go = screen.getByRole('button', { name: 'go' });
    fireEvent.click(go);
    expect(go).toHaveAttribute('aria-pressed', 'true');
    expect(within(go).getByText('Ditandai')).toBeInTheDocument();
    expect(spy).toHaveBeenLastCalledWith({ token_indexes: [1] });
    fireEvent.click(go);
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it('WRITING/SPEAKING: slot AI tanpa input jawaban', () => {
    const { rerender } = render(<Harness q={Q.writing} />);
    expect(screen.getByText('Tugas dinilai AI. Kerjakan di Tab Terapkan.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    rerender(<Harness q={Q.speaking} />);
    expect(screen.getByTestId('ai-task-slot')).toHaveAttribute('data-kind', 'SPEAKING');
  });

  it('disabled mengunci input (setelah diperiksa)', () => {
    render(<Harness q={Q.mcq} disabled />);
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled();
  });

  it('teks Inggris diberi lang="en"', () => {
    const { container } = render(<Harness q={Q.mcq} />);
    expect(container.querySelector('[lang="en"]')).not.toBeNull();
  });
});
