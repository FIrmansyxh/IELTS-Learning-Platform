/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildSpeakingExternalPrompt,
  computeSpeakingOverall,
  parseExternalSpeakingResult,
} from '@/lib/speaking-external-prompt';
import { ExternalSpeakingEvaluationRequestSchema } from '@/contracts/ai';
import { ExternalScoreForm } from '@/components/speaking/external-score-form';
import { speakingExternalApi } from '@/lib/api/speaking-external';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('prompt Speaking eksternal lengkap (SPEC-013 addendum)', () => {
  const p2 = buildSpeakingExternalPrompt({ part: 2, prompt: 'Describe a person who helped you.', cuePoints: ['who', 'why'], prepSeconds: 60, recordSeconds: 120 });

  it('memuat soal, 4 kriteria dengan deskriptor band 4-8, aturan kalibrasi, dan blok hasil', () => {
    expect(p2).toContain('Describe a person who helped you.');
    for (const c of ['1) FLUENCY', '2) LEXICAL', '3) GRAMMAR', '4) PRONUNCIATION']) expect(p2).toContain(c);
    for (const b of [4, 5, 6, 7, 8]) expect(p2).toContain(`- Band ${b}:`);
    expect(p2).toContain('CALIBRATION RULES');
    expect(p2).toContain('=== PLATFORM RESULT ===');
    expect(p2).toContain('=== END ===');
    expect(p2).toContain('rounded to the nearest 0.5');
  });
  it('aturan kalibrasi mengikuti part', () => {
    expect(p2).toContain('less than 60 seconds');
    const p1 = buildSpeakingExternalPrompt({ part: 1, prompt: 'Where do you live?' });
    const p3 = buildSpeakingExternalPrompt({ part: 3, prompt: 'Why?' });
    expect(p1).toContain('single short sentence');
    expect(p3).toContain('analysing causes');
    expect(p3).not.toContain('less than 60 seconds');
  });
  it('tanpa konten Academic dan blok hasil adalah bagian terakhir', () => {
    expect(p2).not.toMatch(/Academic/);
    const lastBlock = p2.lastIndexOf('=== PLATFORM RESULT ===');
    expect(p2.indexOf('Start now by greeting', lastBlock)).toBeGreaterThan(lastBlock);
  });
});

describe('parseExternalSpeakingResult', () => {
  it('membaca blok baku', () => {
    const r = parseExternalSpeakingResult('Feedback...\n=== PLATFORM RESULT ===\nFLUENCY: 6.5\nLEXICAL: 6.0\nGRAMMAR: 6.0\nPRONUNCIATION: 7.0\nOVERALL: 6.5\n=== END ===');
    expect(r.scores).toEqual({ fluency: 6.5, lexical: 6, grammar: 6, pronunciation: 7 });
    expect(r.overall).toBe(6.5);
    expect(r.problems).toEqual([]);
  });
  it('toleran terhadap markdown, huruf kecil, koma desimal, dan akhiran /9', () => {
    const r = parseExternalSpeakingResult('**FLUENCY:** 6,5/9\n- lexical = 5.5\n> Grammar: **6**\nPronunciation: 6.0');
    expect(r.scores).toEqual({ fluency: 6.5, lexical: 5.5, grammar: 6, pronunciation: 6 });
  });
  it('memakai blok TERAKHIR dan mengabaikan placeholder <score> dari prompt yang ikut tertempel', () => {
    const t = '=== PLATFORM RESULT ===\nFLUENCY: <score>\nLEXICAL: <score>\nGRAMMAR: <score>\nPRONUNCIATION: <score>\n=== END ===\n\nHasil:\n=== PLATFORM RESULT ===\nFLUENCY: 5.5\nLEXICAL: 5.5\nGRAMMAR: 5.0\nPRONUNCIATION: 6.0\nOVERALL: 5.5\n=== END ===';
    const r = parseExternalSpeakingResult(t);
    expect(r.scores).toEqual({ fluency: 5.5, lexical: 5.5, grammar: 5, pronunciation: 6 });
  });
  it('menolak nilai bukan kelipatan 0.5, di luar 0-9, atau hilang', () => {
    const r = parseExternalSpeakingResult('FLUENCY: 6.3\nLEXICAL: 10\nGRAMMAR: 6.0');
    expect(r.scores).toEqual({ grammar: 6 });
    expect(r.problems).toEqual(
      expect.arrayContaining([
        { field: 'fluency', reason: 'not_half_step' },
        { field: 'lexical', reason: 'out_of_range' },
        { field: 'pronunciation', reason: 'missing' },
      ]),
    );
  });
  it('tidak macet pada masukan panjang yang berbahaya', () => {
    const t0 = Date.now();
    parseExternalSpeakingResult('=' .repeat(50000) + ' ' .repeat(50000) + 'FLUENCY');
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe('computeSpeakingOverall (aturan pembulatan IELTS)', () => {
  const o = (f: number, l: number, g: number, p: number) => computeSpeakingOverall({ fluency: f, lexical: l, grammar: g, pronunciation: p });
  it('x.25 naik ke x.5 dan x.75 naik ke bilangan bulat berikutnya', () => {
    expect(o(6, 6, 6, 7)).toBe(6.5); // 6.25
    expect(o(6, 7, 7, 7)).toBe(7); // 6.75
    expect(o(6, 6, 6, 6)).toBe(6);
    expect(o(5.5, 6, 6, 6.5)).toBe(6); // 6.0
  });
});

describe('ExternalSpeakingEvaluationRequestSchema', () => {
  const base = { kind: 'SPEAKING_PART1', attempt_id: '3b241101-e2bb-4255-8caf-4136c566a962', question_id: 'Q-GTSPK1-001', tool: 'CLAUDE', criteria_scores: { fluency: 6, lexical: 6, grammar: 6, pronunciation: 6 } };
  it('menerima permintaan benar', () => expect(ExternalSpeakingEvaluationRequestSchema.safeParse(base).success).toBe(true));
  it('menolak overall dari klien, kunci tak dikenal, dan band bukan kelipatan 0.5', () => {
    expect(ExternalSpeakingEvaluationRequestSchema.safeParse({ ...base, overall_band: 7 }).success).toBe(false);
    expect(ExternalSpeakingEvaluationRequestSchema.safeParse({ ...base, criteria_scores: { ...base.criteria_scores, fluency: 6.3 } }).success).toBe(false);
    expect(ExternalSpeakingEvaluationRequestSchema.safeParse({ ...base, criteria_scores: { fluency: 6, lexical: 6, grammar: 6 } }).success).toBe(false);
    expect(ExternalSpeakingEvaluationRequestSchema.safeParse({ ...base, tool: 'BARD' }).success).toBe(false);
  });
});

describe('ExternalScoreForm', () => {
  beforeEach(() => vi.restoreAllMocks());
  const ctx = { kind: 'SPEAKING_PART1', attempt_id: '3b241101-e2bb-4255-8caf-4136c566a962', question_id: 'Q-GTSPK1-001' } as const;

  it('isi otomatis dari tempelan, tampilkan overall, dan kirim tanpa field overall', async () => {
    const rec = vi.spyOn(speakingExternalApi, 'record').mockResolvedValue({} as never);
    render(<ExternalScoreForm context={ctx} />);
    expect(screen.getByRole('button', { name: 'Simpan skor' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Tempel jawaban AI (opsional)'), {
      target: { value: '=== PLATFORM RESULT ===\nFLUENCY: 6.0\nLEXICAL: 6.0\nGRAMMAR: 6.0\nPRONUNCIATION: 7.0\nOVERALL: 6.5\n=== END ===' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Isi otomatis dari tempelan' }));
    expect(screen.getByTestId('external-overall').textContent).toContain('6.5');

    fireEvent.click(screen.getByRole('button', { name: 'Simpan skor' }));
    await waitFor(() => expect(rec).toHaveBeenCalledTimes(1));
    const body = rec.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.criteria_scores).toEqual({ fluency: 6, lexical: 6, grammar: 6, pronunciation: 7 });
    expect(body.tool).toBe('CLAUDE');
    expect(body).not.toHaveProperty('overall_band');
    expect(body).toMatchObject(ctx);
  });

  it('tombol simpan tetap mati sampai keempat skor terisi', () => {
    render(<ExternalScoreForm context={ctx} />);
    fireEvent.change(screen.getByLabelText('Fluency & Coherence'), { target: { value: '6' } });
    expect(screen.getByRole('button', { name: 'Simpan skor' })).toBeDisabled();
    expect(screen.getByTestId('external-overall').textContent).toContain('-');
  });
});
