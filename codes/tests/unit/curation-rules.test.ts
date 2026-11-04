import { describe, expect, it } from 'vitest';
import { allowedFields, canTransition, correctRate, escapeLike, mergeQuestionEdit, passageOutOfRange, qualityFlag, type Status } from '@/server/curation/rules';
import { UpdateMaterialRequestSchema, UpdateModuleRequestSchema, UpdateQuestionRequestSchema, UpdateSubModuleRequestSchema, UpdateAssessmentSetRequestSchema, ChangeStatusRequestSchema } from '@/contracts/curation';

const ALL: Status[] = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'];

describe('K1 transisi status', () => {
  const allowed: Array<[Status, Status]> = [
    ['DRAFT', 'IN_REVIEW'], ['DRAFT', 'PUBLISHED'],
    ['IN_REVIEW', 'APPROVED'], ['IN_REVIEW', 'PUBLISHED'], ['IN_REVIEW', 'DRAFT'],
    ['APPROVED', 'PUBLISHED'], ['APPROVED', 'DRAFT'],
    ['PUBLISHED', 'ARCHIVED'], ['PUBLISHED', 'DRAFT'],
    ['ARCHIVED', 'DRAFT'],
  ];
  it('tepat 10 transisi yang diizinkan; sisanya (25 - 10) ditolak, termasuk status yang sama', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from}->${to}`).toBe(expected);
      }
    }
    expect(allowed).toHaveLength(10);
  });
});

describe('K5 kualitas soal', () => {
  it('correct_rate 2 desimal setengah naik; 0 bila belum ada jawaban', () => {
    expect(correctRate(8, 46)).toBe(0.17);
    expect(correctRate(1, 3)).toBe(0.33);
    expect(correctRate(2, 3)).toBe(0.67);
    expect(correctRate(1, 8)).toBe(0.13); // 0,125 -> 0,13
    expect(correctRate(0, 0)).toBe(0);
    expect(correctRate(5, 5)).toBe(1);
  });
  it('flag: >= 20 jawaban; TOO_HARD < 0,20; TOO_EASY > 0,98; batas tidak ber-flag', () => {
    expect(qualityFlag(8, 46)).toBe('TOO_HARD');
    expect(qualityFlag(3, 19)).toBeNull(); // < 20 jawaban
    expect(qualityFlag(0, 19)).toBeNull();
    expect(qualityFlag(4, 20)).toBeNull(); // tepat 0,20
    expect(qualityFlag(3, 20)).toBe('TOO_HARD');
    expect(qualityFlag(0, 20)).toBe('TOO_HARD');
    expect(qualityFlag(98, 100)).toBeNull(); // tepat 0,98
    expect(qualityFlag(99, 100)).toBe('TOO_EASY');
    expect(qualityFlag(20, 20)).toBe('TOO_EASY');
    expect(qualityFlag(49, 50)).toBeNull(); // 0,98 tepat
    expect(qualityFlag(1996, 1997)).toBe('TOO_EASY'); // 0,9995 dibulatkan 1,00 tetap TOO_EASY
    expect(qualityFlag(1997, 5000)).toBeNull();
  });
  it('flag memakai pecahan tepat, bukan nilai bulat: 19,99% di antara >= 20 jawaban tetap TOO_HARD walau dibulatkan 0,20', () => {
    expect(correctRate(1999, 10000)).toBe(0.2);
    expect(qualityFlag(1999, 10000)).toBe('TOO_HARD');
  });
});

describe('escapeLike', () => {
  it('meloloskan %, _, dan \\', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    expect(escapeLike('biasa')).toBe('biasa');
  });
});

describe('skema permintaan', () => {
  it('body kosong -> empty_update; key tak dikenal ditolak; rentang', () => {
    for (const [schema, ok] of [
      [UpdateModuleRequestSchema, { title: 'x' }],
      [UpdateSubModuleRequestSchema, { passing_score_percent: 80 }],
      [UpdateMaterialRequestSchema, { attribution_text: null }],
      [UpdateAssessmentSetRequestSchema, { pass_percent: null }],
      [UpdateQuestionRequestSchema, { target_time_ms: null }],
    ] as const) {
      expect(schema.safeParse(ok).success).toBe(true);
      const empty = schema.safeParse({});
      expect(empty.success).toBe(false);
      expect(empty.error?.issues[0]?.message).toBe('empty_update');
      expect(schema.safeParse({ ...ok, bogus: 1 }).success).toBe(false);
    }
    expect(UpdateSubModuleRequestSchema.safeParse({ passing_score_percent: 0 }).success).toBe(false);
    expect(UpdateSubModuleRequestSchema.safeParse({ passing_score_percent: 101 }).success).toBe(false);
    expect(UpdateModuleRequestSchema.safeParse({ order_index: 0 }).success).toBe(false);
    expect(UpdateAssessmentSetRequestSchema.safeParse({ time_limit_seconds: 29 }).success).toBe(false);
    expect(UpdateAssessmentSetRequestSchema.safeParse({ time_limit_seconds: 14_401 }).success).toBe(false);
    expect(UpdateQuestionRequestSchema.safeParse({ question_type: 'MCQ_MULTI' }).success).toBe(false);
    expect(UpdateQuestionRequestSchema.safeParse({ points: 21 }).success).toBe(false);
    expect(ChangeStatusRequestSchema.safeParse({ status: 'PUBLISHED', confirm_reviewed: 'ya' }).success).toBe(false);
    expect(ChangeStatusRequestSchema.safeParse({ status: 'PUBLISHED', confirm_reviewed: true }).success).toBe(true);
  });
});

describe('mergeQuestionEdit', () => {
  const mcq = { question_id: 'Q-A1', question_type: 'MCQ_SINGLE', skill: 'GRAMMAR', prompt: 'P', explanation_id: 'E', points: 1, options: ['a', 'b', 'c'], correct_answers: ['a'] };
  const ctx = { placement: false, passageMarkdown: null };

  it('perubahan valid menggabungkan field dan tidak mengubah soal asal', () => {
    const copy = structuredClone(mcq);
    const r = mergeQuestionEdit(mcq, { prompt: 'Baru', correct_answers: ['b'] }, ctx);
    expect(r.issues).toEqual([]);
    expect(r.question).toMatchObject({ question_id: 'Q-A1', prompt: 'Baru', correct_answers: ['b'], options: ['a', 'b', 'c'] });
    expect(mcq).toEqual(copy);
  });
  it('jawaban di luar opsi -> answer_not_in_options; opsi ganda -> duplicate_options', () => {
    expect(mergeQuestionEdit(mcq, { correct_answers: ['z'] }, ctx).issues[0]?.code).toBe('answer_not_in_options');
    expect(mergeQuestionEdit(mcq, { options: ['a', 'a', 'b'] }, ctx).issues.map((i) => i.code)).toContain('duplicate_options');
  });
  it('mengubah options yang menghapus jawaban benar -> answer_not_in_options', () => {
    expect(mergeQuestionEdit(mcq, { options: ['x', 'y'] }, ctx).issues.map((i) => i.code)).toContain('answer_not_in_options');
  });
  it('field tidak boleh untuk tipe -> field_not_allowed_for_type (tanpa menggabungkan)', () => {
    const fill = { question_id: 'Q-F1', question_type: 'FILL_IN_BLANK', skill: 'GRAMMAR', prompt: 'P', explanation_id: 'E', points: 1, correct_answers: ['x'], max_words: 2 };
    const r = mergeQuestionEdit(fill, { options: ['a', 'b'], prompt: 'baru' }, ctx);
    expect(r.question).toBeUndefined();
    expect(r.issues).toEqual([expect.objectContaining({ path: 'options', code: 'field_not_allowed_for_type' })]);
    expect(allowedFields('WRITING_TASK')).toEqual(new Set(['prompt', 'explanation_id']));
    expect(allowedFields('SPEAKING_TASK')).toEqual(new Set(['prompt', 'explanation_id']));
    expect(allowedFields('MCQ_SINGLE').has('options')).toBe(true);
    expect(allowedFields('SENTENCE_REORDER').has('correct_answers')).toBe(false);
  });
  it('null menghapus field opsional; difficulty wajib pada Placement; passage_no dibatasi jumlah bagian', () => {
    const q = { ...mcq, target_time_ms: 9000, difficulty: 2, passage_no: 1 };
    const r = mergeQuestionEdit(q, { target_time_ms: null }, { placement: false, passageMarkdown: 'A\n===PASSAGE===\nB' });
    expect(r.question && 'target_time_ms' in r.question).toBe(false);
    expect(mergeQuestionEdit(q, { difficulty: null }, { placement: true, passageMarkdown: 'A' }).issues[0]?.code).toBe('difficulty_required');
    expect(mergeQuestionEdit(q, { passage_no: 3 }, { placement: false, passageMarkdown: 'A\n===PASSAGE===\nB' }).issues[0]?.code).toBe('passage_out_of_range');
    expect(mergeQuestionEdit(q, { passage_no: 2 }, { placement: false, passageMarkdown: 'A\n===PASSAGE===\nB' }).issues).toEqual([]);
    expect(mergeQuestionEdit(q, { prompt: 'x' }, { placement: false, passageMarkdown: null }).issues[0]?.code).toBe('passage_out_of_range'); // soal merujuk teks yang tidak ada
  });
  it('passageOutOfRange', () => {
    const qs = [{ question_id: 'Q-1', passage_no: 2 }, { question_id: 'Q-2' }, { question_id: 'Q-3', passage_no: 1 }];
    expect(passageOutOfRange(qs, 'A\n===PASSAGE===\nB')).toEqual([]);
    expect(passageOutOfRange(qs, 'A')).toEqual(['Q-1']);
    expect(passageOutOfRange(qs, null)).toEqual(['Q-1', 'Q-3']);
  });
});
