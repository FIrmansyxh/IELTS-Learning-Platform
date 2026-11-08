/**
 * Validasi Bank Soal (SPEC-022): skema Zod + aturan silang bank. Murni (tanpa DB) agar dapat dipakai CLI,
 * importer, dan tes. Aturan per soal memakai `checkQuestion` kontrak konten 1.1.
 */
import { QuestionBankPackageSchema, BANK_KIND_SKILL, type QuestionBankPackage } from '@/contracts/question-bank';
import type { ContentIssue } from '@/contracts/content';
import { extractQuestionSlot } from '../attempts/engine';
import { splitPassages } from './passages';
import { checkQuestion, zodIssues } from './validate';

export type BankValidation =
  | { ok: true; data: QuestionBankPackage; warnings: ContentIssue[] }
  | { ok: false; errors: ContentIssue[]; warnings: ContentIssue[] };

type BankQuestion = QuestionBankPackage['banks'][number]['questions'][number];

const err = (path: string, code: string, message: string): ContentIssue => ({ path, code, message, severity: 'error' });
const warn = (path: string, code: string, message: string): ContentIssue => ({ path, code, message, severity: 'warning' });

const PLACEHOLDER_RE = /\b(TODO|TBD|FIXME|lorem ipsum)\b/i;

function kindRule(kind: string, q: BankQuestion): { code: string; message: string } | null {
  if (kind.startsWith('WRITING_GT_')) {
    if (q.question_type !== 'WRITING_TASK') return { code: 'type_not_allowed', message: 'Bank Writing hanya berisi WRITING_TASK.' };
    const wantsT1 = kind.startsWith('WRITING_GT_T1_');
    if (wantsT1 !== (q.task_kind === 'TASK1')) {
      return { code: 'task_kind_mismatch', message: wantsT1 ? 'Bank surat harus bertipe TASK1.' : 'Bank esai harus bertipe TASK2.' };
    }
    return null;
  }
  if (kind.startsWith('SPEAKING_P')) {
    if (q.question_type !== 'SPEAKING_TASK') return { code: 'type_not_allowed', message: 'Bank Speaking hanya berisi SPEAKING_TASK.' };
    const want = kind.slice('SPEAKING_P'.length);
    if (String(q.part) !== want) return { code: 'part_mismatch', message: `part soal harus ${want}.` };
    return null;
  }
  if (q.question_type === 'WRITING_TASK' || q.question_type === 'SPEAKING_TASK') {
    return { code: 'type_not_allowed', message: 'Bank ini hanya untuk soal objektif.' };
  }
  return null;
}

export function validateBankPackage(raw: unknown, seenIds: Set<string> = new Set()): BankValidation {
  const parsed = QuestionBankPackageSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: zodIssues(parsed.error), warnings: [] };

  const issues: ContentIssue[] = [];
  const codes = new Set<string>();

  parsed.data.banks.forEach((bank, bi) => {
    const bp = `banks[${bi}]`;
    if (codes.has(bank.bank_code)) issues.push(err(`${bp}.bank_code`, 'duplicate_bank_code', 'bank_code ganda.'));
    codes.add(bank.bank_code);

    if (BANK_KIND_SKILL[bank.bank_kind] !== bank.skill) {
      issues.push(err(`${bp}.skill`, 'skill_kind_mismatch', `bank_kind ${bank.bank_kind} harus berskill ${BANK_KIND_SKILL[bank.bank_kind]}.`));
    }

    const isReading = bank.skill === 'READING';
    const passageCount = bank.reading_passage_markdown ? splitPassages(bank.reading_passage_markdown).length : 0;
    if (isReading && passageCount === 0) issues.push(err(`${bp}.reading_passage_markdown`, 'passage_required', 'Bank Reading wajib memuat teks bacaan.'));
    if (!isReading && bank.reading_passage_markdown) {
      issues.push(err(`${bp}.reading_passage_markdown`, 'passage_not_allowed', 'Teks bacaan hanya untuk bank Reading.'));
    }

    bank.questions.forEach((q, qi) => {
      const qp = `${bp}.questions[${qi}]`;
      if (seenIds.has(q.question_id)) issues.push(err(`${qp}.question_id`, 'duplicate_question_id', 'question_id ganda.'));
      seenIds.add(q.question_id);

      if (extractQuestionSlot(q.question_id) !== null) {
        issues.push(err(`${qp}.question_id`, 'variant_slot_id', 'ID terbaca sebagai slot variasi paket (P<n> atau segmen A-C); ubah polanya.'));
      }
      if (q.skill !== bank.skill) issues.push(err(`${qp}.skill`, 'question_skill_mismatch', `skill soal harus ${bank.skill}.`));

      if (isReading) {
        if (q.passage_no === undefined) issues.push(err(`${qp}.passage_no`, 'passage_no_required', 'Soal Reading wajib punya passage_no.'));
        else if (q.passage_no > passageCount) {
          issues.push(err(`${qp}.passage_no`, 'passage_no_out_of_range', `passage_no melebihi jumlah teks (${passageCount}).`));
        }
      }

      const kindErr = kindRule(bank.bank_kind, q);
      if (kindErr) issues.push(err(`${qp}.question_type`, kindErr.code, kindErr.message));

      if (PLACEHOLDER_RE.test(JSON.stringify(q))) issues.push(err(qp, 'placeholder_text', 'Soal memuat teks placeholder (TODO/TBD/lorem).'));
      if (q.difficulty === undefined) issues.push(warn(`${qp}.difficulty`, 'difficulty_missing', 'difficulty sebaiknya diisi untuk pemilihan campuran (SPEC-022 D5).'));

      checkQuestion(q, qp, issues, { placement: false });
    });
  });

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, data: parsed.data, warnings };
}
