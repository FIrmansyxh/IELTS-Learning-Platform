/**
 * Struktur kurikulum SPEC-004: 4 Tier, 13 Modul, 33 Sub-Modul (seed `curriculum-structure`).
 * ADR-004: tiap sub-modul membawa tag `exam` (COMMON bila kosong). Sub-modul ACADEMIC disembunyikan dari
 * learner saat EXAM_MODULE=GENERAL_TRAINING (default); sub-modul GENERAL_TRAINING menggantikannya.
 */
export type ExamModuleName = 'COMMON' | 'GENERAL_TRAINING' | 'ACADEMIC';
export interface TierSeed {
  tierNumber: number;
  title: string;
  cefrLevel: string;
  targetBandMin: string;
  targetBandMax: string;
  bossGateType: 'PERCENT' | 'BAND';
  bossGateValue: string;
  skipThresholdPercent: number;
}

export const TIER_SEEDS: TierSeed[] = [
  { tierNumber: 1, title: 'Foundation', cefrLevel: 'A1-A2', targetBandMin: '3.0', targetBandMax: '4.0', bossGateType: 'PERCENT', bossGateValue: '80.0', skipThresholdPercent: 85 },
  { tierNumber: 2, title: 'Bridge to IELTS', cefrLevel: 'B1', targetBandMin: '4.0', targetBandMax: '5.0', bossGateType: 'BAND', bossGateValue: '5.0', skipThresholdPercent: 85 },
  { tierNumber: 3, title: 'Operational IELTS', cefrLevel: 'B2', targetBandMin: '5.5', targetBandMax: '6.5', bossGateType: 'BAND', bossGateValue: '6.0', skipThresholdPercent: 85 },
  { tierNumber: 4, title: 'Band 7.0+ Mastery', cefrLevel: 'C1', targetBandMin: '7.0', targetBandMax: '7.5', bossGateType: 'BAND', bossGateValue: '7.0', skipThresholdPercent: 85 },
];

export type SkillCategoryName = 'GRAMMAR' | 'VOCAB' | 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';

export const MODULE_SEEDS: Array<{ code: string; tier: number; skill: SkillCategoryName; title: string }> = [
  { code: '1.1', tier: 1, skill: 'GRAMMAR', title: 'Core Sentence Architecture' },
  { code: '1.2', tier: 1, skill: 'VOCAB', title: 'Survival Vocabulary & Pronunciation' },
  { code: '1.3', tier: 1, skill: 'READING', title: 'Basic Comprehension (Listening & Reading)' },
  { code: '2.1', tier: 2, skill: 'GRAMMAR', title: 'Complex Grammar & Sentence Combining' },
  { code: '2.2', tier: 2, skill: 'WRITING', title: 'Paragraphing & Paraphrasing' },
  { code: '2.3', tier: 2, skill: 'READING', title: 'Intermediate Listening & Reading Mechanics' },
  { code: '3.1', tier: 3, skill: 'LISTENING', title: 'IELTS Listening Mastery' },
  { code: '3.2', tier: 3, skill: 'READING', title: 'IELTS Reading Strategies' },
  { code: '3.3', tier: 3, skill: 'WRITING', title: 'IELTS Writing Blueprint' },
  { code: '3.4', tier: 3, skill: 'SPEAKING', title: 'IELTS Speaking Fluency' },
  { code: '4.1', tier: 4, skill: 'VOCAB', title: 'Advanced Lexical Resource & Collocations' },
  { code: '4.2', tier: 4, skill: 'WRITING', title: 'High-Scoring Writing & Grammatical Range' },
  { code: '4.3', tier: 4, skill: 'READING', title: 'Speed, Stamina & Trap Evasion' },
];

export const SUB_MODULE_SEEDS: Array<{ code: string; title: string; exam?: ExamModuleName }> = [
  { code: '1.1.1', title: 'Nouns, Pronouns, Articles (a/an/the), & Plurals' },
  { code: '1.1.2', title: 'Present Simple vs. Present Continuous' },
  { code: '1.1.3', title: 'Past Simple vs. Present Perfect' },
  { code: '1.1.4', title: 'Modals of Ability, Obligation & Possibility (can, must, should, might)' },
  { code: '1.2.1', title: '1.000 Kata Inti (Oxford A1-A2) dalam Konteks Kalimat' },
  { code: '1.2.2', title: 'Fonetik Dasar, Bunyi Vokal Panjang/Pendek, & Word Stress' },
  { code: '1.3.1', title: 'Mendengarkan Angka, Ejaan Nama, Waktu, & Alamat' },
  { code: '1.3.2', title: 'Menangkap Ide Pokok & Informasi Spesifik pada Teks Pendek' },
  { code: '2.1.1', title: 'Conjunctions & Discourse Markers (however, although, despite, therefore, whereas)' },
  { code: '2.1.2', title: 'Relative Clauses (who, which, that, whose, where)' },
  { code: '2.1.3', title: 'Passive Voice untuk Deskripsi Proses & Laporan Ilmiah' },
  { code: '2.1.4', title: 'Conditional Sentences (Zero, First, Second, Third) untuk Argumen Esai' },
  { code: '2.2.1', title: 'Anatomi Paragraf Akademik: Topic Sentence + Explanation + Concrete Example' },
  { code: '2.2.2', title: 'Teknik Paraphrasing (Sinonim, Word Form, Aktif-Pasif)' },
  { code: '2.3.1', title: 'Teknik Skimming (Ide Utama) vs. Scanning (Kata Kunci, Nama, Tahun)' },
  { code: '2.3.2', title: 'Mengenali Distractors (Koreksi Informasi & Jebakan Sinonim dalam Audio)' },
  { code: '3.1.1', title: 'Section 1 & 2: Form/Note Completion, Multiple Choice, & Map/Plan Labeling' },
  { code: '3.1.2', title: 'Section 3 & 4: Diskusi Akademik Multi-Pembicara & Monolog Kuliah Universitas' },
  { code: '3.2.1', title: 'Taktik True / False / Not Given & Yes / No / Not Given' },
  { code: '3.2.2', title: 'Strategi Matching Headings, Matching Information, & Summary Completion' },
  { code: '3.3.1', title: 'Task 1 Academic: Analisis Tren Grafik, Perubahan Peta, & Diagram Proses', exam: 'ACADEMIC' },
  { code: '3.3.2', title: 'Task 2 Essay: Kerangka 4 Paragraf untuk Opinion, Discussion, Problem-Solution, Two-Part Questions' },
  { code: '3.3.3', title: 'Task 1 General Training: Menulis Surat Formal, Semi-Formal, dan Informal', exam: 'GENERAL_TRAINING' },
  { code: '3.4.1', title: 'Part 1: Menjawab Lugas dengan Rumus Direct Answer + Reason + Short Example' },
  { code: '3.4.2', title: 'Part 2 (Cue Card): Strategi Mencatat 1 Menit & Berbicara 2 Menit Penuh' },
  { code: '3.4.3', title: 'Part 3: Menjawab Pertanyaan Abstrak & Analitis (Speculating, Comparing, Evaluating)' },
  { code: '4.1.1', title: 'Penguasaan Academic Word List (AWL) & Kolokasi Topik Utama', exam: 'ACADEMIC' },
  { code: '4.1.2', title: 'Eliminasi Kosakata B1/B2 Repetitif menuju Kosakata Presisi Level C1' },
  { code: '4.1.3', title: 'Kosakata & Kolokasi Situasi Sehari-hari dan Dunia Kerja untuk General Training', exam: 'GENERAL_TRAINING' },
  { code: '4.2.1', title: 'Penggunaan Inversion, Participle Clauses, & Nominalization secara Alami' },
  { code: '4.2.2', title: 'Advanced Cohesion (Transisi Antar-Ide Tanpa Linking Words yang Kaku)' },
  { code: '4.3.1', title: 'Menyelesaikan 3 Reading Passages (40 Soal) dalam 50 Menit dengan Akurasi >= 30/40' },
  { code: '4.3.2', title: 'Latihan Shadowing, Intonasi Natural, & Idiomatic Expressions untuk Speaking Band 7.0+' },
];
