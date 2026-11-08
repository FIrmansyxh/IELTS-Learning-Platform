import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateBankPackage } from '@/server/content/bank-validate';

const DIR = path.join(process.cwd(), 'content', 'gt-bank');
const load = (f: string): unknown => JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));

const mcq = (id: string, over: Record<string, unknown> = {}) => ({
  question_id: id,
  question_type: 'MCQ_SINGLE',
  skill: 'GRAMMAR',
  prompt: 'Pilih salam yang tepat.',
  options: ['Dear Sir or Madam,', 'Hey,'],
  correct_answers: ['Dear Sir or Madam,'],
  explanation_id: 'Formal.',
  difficulty: 1,
  ...over,
});
const pkg = (questions: unknown[], bank: Record<string, unknown> = {}) => ({
  bank_contract_version: '1.0',
  banks: [
    {
      bank_code: 'GT-TEST-1',
      bank_kind: 'GRAMMAR_GT_REGISTER',
      title: 'Uji',
      skill: 'GRAMMAR',
      exam_module: 'GENERAL_TRAINING',
      origin: 'ORIGINAL_AUTHORED',
      questions,
      ...bank,
    },
  ],
});
const codes = (r: ReturnType<typeof validateBankPackage>) => (r.ok ? [] : r.errors.map((e) => e.code));

describe('bank soal GT yang dikirim bersama repo (SPEC-022)', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
  it('ada berkas bank', () => expect(files.length).toBeGreaterThanOrEqual(5));

  it('seluruh berkas valid tanpa ID ganda antar berkas', () => {
    const seen = new Set<string>();
    let total = 0;
    for (const f of files) {
      const r = validateBankPackage(load(f), seen);
      expect(r.ok, `${f}: ${r.ok ? '' : JSON.stringify(r.errors.slice(0, 3))}`).toBe(true);
      if (r.ok) total += r.data.banks.reduce((s, b) => s + b.questions.length, 0);
    }
    expect(total).toBeGreaterThanOrEqual(71);
  });

  it('cakupan minimum SPEC-022 (kriteria 2)', () => {
    const all = files.flatMap((f) => {
      const r = validateBankPackage(load(f));
      return r.ok ? r.data.banks : [];
    });
    const count = (kind: string) => all.filter((b) => b.bank_kind === kind).reduce((s, b) => s + b.questions.length, 0);
    expect(count('WRITING_GT_T1_FORMAL')).toBeGreaterThanOrEqual(3);
    expect(count('WRITING_GT_T1_SEMI')).toBeGreaterThanOrEqual(3);
    expect(count('WRITING_GT_T1_INFORMAL')).toBeGreaterThanOrEqual(3);
    expect(count('WRITING_GT_T2')).toBeGreaterThanOrEqual(9);
    expect(count('SPEAKING_P1')).toBeGreaterThanOrEqual(9);
    expect(count('SPEAKING_P2')).toBeGreaterThanOrEqual(6);
    expect(count('SPEAKING_P3')).toBeGreaterThanOrEqual(6);
    expect(count('READING_GT_S1') + count('READING_GT_S2')).toBeGreaterThanOrEqual(16);
    expect(count('GRAMMAR_GT_REGISTER')).toBeGreaterThanOrEqual(16);
  });

  it('Task 1 = surat dan tidak memuat konten Academic', () => {
    for (const f of ['writing-task1.json']) {
      const r = validateBankPackage(load(f));
      if (!r.ok) throw new Error('invalid');
      for (const b of r.data.banks) {
        for (const q of b.questions) {
          expect(q.prompt).toMatch(/Begin your letter: Dear /);
          expect(q.prompt).not.toMatch(/graph|chart|diagram|map/i);
        }
      }
    }
  });
});

describe('validateBankPackage menolak bank rusak', () => {
  it('menerima bank minimal yang benar', () => {
    expect(validateBankPackage(pkg([mcq('Q-GTX-001')])).ok).toBe(true);
  });
  it('ID ganda', () => {
    expect(codes(validateBankPackage(pkg([mcq('Q-GTX-001'), mcq('Q-GTX-001')])))).toContain('duplicate_question_id');
  });
  it('jawaban di luar opsi', () => {
    expect(codes(validateBankPackage(pkg([mcq('Q-GTX-001', { correct_answers: ['Yo,'] })])))).toContain('answer_not_in_options');
  });
  it('ID yang terbaca sebagai slot variasi paket', () => {
    expect(codes(validateBankPackage(pkg([mcq('Q-GTX-P1-001')])))).toContain('variant_slot_id');
    expect(codes(validateBankPackage(pkg([mcq('Q-GTX-A-001')])))).toContain('variant_slot_id');
  });
  it('skill soal tidak sama dengan skill bank', () => {
    expect(codes(validateBankPackage(pkg([mcq('Q-GTX-001', { skill: 'VOCAB' })])))).toContain('question_skill_mismatch');
  });
  it('bank_kind tidak cocok dengan skill', () => {
    expect(codes(validateBankPackage(pkg([mcq('Q-GTX-001')], { bank_kind: 'WRITING_GT_T2' })))).toContain('skill_kind_mismatch');
  });
  it('Reading wajib teks dan passage_no valid', () => {
    const q = (extra: Record<string, unknown>) => mcq('Q-GTX-002', { skill: 'READING', ...extra });
    const base = { bank_kind: 'READING_GT_S1', skill: 'READING' };
    expect(codes(validateBankPackage(pkg([q({ passage_no: 1 })], base)))).toContain('passage_required');
    expect(codes(validateBankPackage(pkg([q({})], { ...base, reading_passage_markdown: 'Teks.' })))).toContain('passage_no_required');
    expect(codes(validateBankPackage(pkg([q({ passage_no: 2 })], { ...base, reading_passage_markdown: 'Teks.' })))).toContain('passage_no_out_of_range');
  });
  it('bank Writing hanya WRITING_TASK dan task_kind cocok', () => {
    const w = { question_id: 'Q-GTX-003', question_type: 'WRITING_TASK', skill: 'WRITING', prompt: 'Write.', task_kind: 'TASK2', difficulty: 1 };
    const base = { bank_kind: 'WRITING_GT_T1_FORMAL', skill: 'WRITING' };
    expect(codes(validateBankPackage(pkg([w], base)))).toContain('task_kind_mismatch');
    expect(codes(validateBankPackage(pkg([mcq('Q-GTX-004', { skill: 'WRITING' })], base)))).toContain('type_not_allowed');
  });
  it('bank objektif menolak soal Speaking dan placeholder', () => {
    const s = { question_id: 'Q-GTX-005', question_type: 'SPEAKING_TASK', skill: 'GRAMMAR', prompt: 'Talk.', part: 1, difficulty: 1 };
    expect(codes(validateBankPackage(pkg([s])))).toContain('type_not_allowed');
    expect(codes(validateBankPackage(pkg([mcq('Q-GTX-006', { prompt: 'TODO isi soal' })])))).toContain('placeholder_text');
  });
  it('skema: exam_module selain General Training ditolak', () => {
    expect(validateBankPackage(pkg([mcq('Q-GTX-001')], { exam_module: 'ACADEMIC' })).ok).toBe(false);
  });
});
