import { z } from 'zod';
import { ContentPackageSchema } from '@/contracts/content';
import { CSV_ALL_HEADERS } from './file-check';

/** Templat JSON valid minimal: 1 modul + 1 sub-modul dengan 2 soal (kode contoh 1.99 / 1.99.1 agar tidak bentrok dengan kurikulum). */
export const CONTENT_PACKAGE_TEMPLATE = {
  contract_version: '1.1',
  modules: [{ tier_number: 1, module_code: '1.99', module_category: 'GRAMMAR', title: 'Contoh Modul (ganti dengan modul Anda)' }],
  sub_modules: [
    {
      tier_number: 1,
      module_code: '1.99',
      sub_module_code: '1.99.1',
      sub_module_title: 'Contoh Sub-Modul: Simple Present',
      origin: 'ORIGINAL_AUTHORED',
      active_drill: {
        time_limit_seconds: 300,
        questions: [
          {
            question_id: 'Q-199-1',
            question_type: 'MCQ_SINGLE',
            skill: 'GRAMMAR',
            prompt: 'She ___ to school every day.',
            options: ['go', 'goes', 'going', 'gone'],
            correct_answers: ['goes'],
            explanation_id: 'Subjek orang ketiga tunggal memakai verba dengan akhiran -s/-es pada simple present.',
          },
          {
            question_id: 'Q-199-2',
            question_type: 'TFNG',
            skill: 'GRAMMAR',
            prompt: 'Pernyataan: "He play football" adalah kalimat yang benar secara tata bahasa.',
            correct_answers: ['False'],
            explanation_id: 'Seharusnya "He plays football" karena subjek orang ketiga tunggal.',
          },
        ],
      },
    },
  ],
} as const;

const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const QUESTIONS_CSV_TEMPLATE =
  [
    CSV_ALL_HEADERS.join(','),
    ['ACTIVE_DRILL', '1.99.1', 'Q-199-3', 'MCQ_SINGLE', 'GRAMMAR', 'They ___ football on Sundays.', 'play || plays || playing', 'play', '', 'Subjek jamak memakai verba bentuk dasar.', '1', '', '', '', ''].map(q).join(','),
    ['ACTIVE_DRILL', '1.99.1', 'Q-199-4', 'FILL_IN_BLANK', 'GRAMMAR', 'He ___ (watch) TV every night.', '', 'watches', '1', 'Verba berakhiran -ch memakai -es.', '1', '', '', '', ''].map(q).join(','),
  ].join('\r\n') + '\r\n';

export function templateFor(kind: string): { body: string; filename: string; contentType: string } | null {
  if (kind === 'content-package') {
    return { body: JSON.stringify(CONTENT_PACKAGE_TEMPLATE, null, 2) + '\n', filename: 'content-package.template.json', contentType: 'application/json; charset=utf-8' };
  }
  if (kind === 'questions-csv') {
    return { body: QUESTIONS_CSV_TEMPLATE, filename: 'questions.template.csv', contentType: 'text/csv; charset=utf-8' };
  }
  return null;
}

export function contractJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ContentPackageSchema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}
