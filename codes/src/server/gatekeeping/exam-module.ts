/**
 * Jenis ujian yang sedang dilayani platform (ADR-004). Default IELTS General Training.
 * Sub-modul bertag COMMON selalu tampil; GENERAL_TRAINING/ACADEMIC hanya bila sama dengan nilai ini.
 */
export type ActiveExamModule = 'GENERAL_TRAINING' | 'ACADEMIC';

export function activeExamModule(): ActiveExamModule {
  return process.env.EXAM_MODULE === 'ACADEMIC' ? 'ACADEMIC' : 'GENERAL_TRAINING';
}
