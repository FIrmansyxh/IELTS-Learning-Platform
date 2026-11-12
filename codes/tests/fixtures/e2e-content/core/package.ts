/**
 * Paket konten SINTETIS untuk E2E domain Inti Belajar (core-*.spec.ts). BUKAN konten produksi.
 *
 * Satu sumber kebenaran: `buildCorePackage()` menghasilkan content.json + assets.manifest.json, dan `ANSWERS`
 * memuat kunci jawaban per teks prompt (urutan opsi diacak server, jadi spec memilih berdasarkan teks).
 * `materializeCorePackage(dir)` menulis paket + berkas aset (disalin dari content/golden-sample) ke `dir`,
 * lalu diimpor lewat CLI resmi `content-import.ts import` (lihat helpers/core.ts).
 *
 * Peta kode -> isi (kode sengaja menghindari 1.1.x [tracks.spec], 1.5.x/2.3.x/3.4.x dan Boss Tier 1-2 [domain Ujian]):
 *   Tier 1: 1.4.1 (materi lengkap: video, slide, lampiran PDF, Mini-Task SELF_CHECK; drill 4 soal),
 *           1.4.2 (artikel saja; drill 2 soal). Modul 1.1 tidak punya sub-modul terbit (Segera hadir).
 *   Tier 2: 2.1.1 (+ set Skip Modul 2.1, 6 soal), 2.2.1 (drill 10 tipe soal, berbobot), 2.2.2.
 *   Tier 3: set Skip Tier 3 (4 soal, 30 detik). Sub-modul 3.3.3 berasal dari runner.
 *   Tier 4: 4.2.1, [4.2.2 sengaja TIDAK terbit], 4.3.1 + Boss Tier 4 (Listening 4 soal, Reading 4 soal).
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Q = Record<string, unknown>;

// ---------------------------------------------------------------- kunci jawaban (per teks prompt)
export type Answer =
  | { t: 'mcq'; right: string; wrong: string }
  | { t: 'multi'; right: string[]; wrong: string[] }
  | { t: 'choice'; right: string; wrong: string } // TFNG / YNNG
  | { t: 'text'; right: string; wrong: string }
  | { t: 'match'; right: Record<string, string>; wrong: Record<string, string> }
  | { t: 'reorder'; right: string[] }
  | { t: 'error'; right: string[]; wrong: string[] };

export const ANSWERS = new Map<string, Answer>();

let n = 0;
function reg(prompt: string, a: Answer): string {
  ANSWERS.set(prompt, a);
  return prompt;
}
const qid = (tag: string) => `Q-CORE-${tag}-${++n}`;

const mcq = (tag: string, prompt: string, right: string, wrong: string[], extra: Q = {}): Q => {
  reg(prompt, { t: 'mcq', right, wrong: wrong[0]! });
  return {
    question_id: qid(tag),
    question_type: 'MCQ_SINGLE',
    skill: 'GRAMMAR',
    prompt,
    explanation_id: `Pembahasan: jawabannya "${right}".`,
    options: [right, ...wrong],
    correct_answers: [right],
    ...extra,
  };
};

// ---------------------------------------------------------------- drill 1.4.1 (4 soal, lulus 75% = 3 benar)
export const D121 = {
  mcq: 'Pilih kata benda dari daftar berikut.',
  tfng: 'Pernyataan: "Artikel a dipakai sebelum bunyi vokal." (menurut teks)',
  fill: 'Lengkapi: Yesterday I ___ (go) to the market.',
  short: 'Tempat meminjam buku disebut apa? (jawab satu kata)',
};
function drill121(): Q[] {
  reg(D121.mcq, { t: 'mcq', right: 'apple', wrong: 'quickly' });
  reg(D121.tfng, { t: 'choice', right: 'False', wrong: 'True' });
  reg(D121.fill, { t: 'text', right: 'went', wrong: 'goed' });
  reg(D121.short, { t: 'text', right: 'library', wrong: 'kitchen' });
  return [
    { question_id: qid('121'), question_type: 'MCQ_SINGLE', skill: 'VOCAB', prompt: D121.mcq, explanation_id: 'Apple adalah kata benda; quickly adalah kata keterangan.', options: ['apple', 'run', 'quickly'], correct_answers: ['apple'] },
    { question_id: qid('121'), question_type: 'TFNG', skill: 'VOCAB', prompt: D121.tfng, explanation_id: 'Teks menyatakan "an" dipakai sebelum bunyi vokal, bukan "a".', correct_answers: ['False'] },
    { question_id: qid('121'), question_type: 'FILL_IN_BLANK', skill: 'VOCAB', prompt: D121.fill, explanation_id: 'Bentuk lampau go adalah went.', correct_answers: ['went'], max_words: 1 },
    { question_id: qid('121'), question_type: 'SHORT_ANSWER', skill: 'VOCAB', prompt: D121.short, explanation_id: 'Library adalah tempat meminjam buku.', correct_answers: ['library'], max_words: 1 },
  ];
}

/** Drill kecil (2 soal MCQ, lulus butuh keduanya benar) untuk sub-modul pelengkap. */
function drillMini(tag: string): Q[] {
  return [
    mcq(tag, `Soal ${tag}-1: pilih kalimat yang benar.`, `Kalimat benar ${tag}-1`, [`Kalimat salah ${tag}-1a`, `Kalimat salah ${tag}-1b`]),
    mcq(tag, `Soal ${tag}-2: pilih kalimat yang benar.`, `Kalimat benar ${tag}-2`, [`Kalimat salah ${tag}-2a`, `Kalimat salah ${tag}-2b`]),
  ];
}

// ---------------------------------------------------------------- drill 2.2.1 (10 tipe soal, berbobot; maks 14 poin)
export const D221 = {
  mcq: 'Pilih bentuk pasif yang benar untuk laporan.',
  multi: 'Pilih dua kalimat yang berbentuk pasif.',
  tfng: 'Pernyataan: "Passive voice memakai be + past participle." (menurut teks)',
  ynng: 'Apakah penulis menyarankan pasif di setiap kalimat?',
  fill: 'Lengkapi: The bottles ___ (sort) by color.',
  short: 'Apa nama bentuk kata kerja ketiga (V3)? (maks 2 kata)',
  drop: 'Pasangkan bentuk dasar dengan past participle-nya (dropdown).',
  drag: 'Pasangkan auxiliary dengan past participle-nya (seret).',
  reorder: 'Susun kalimat pasif berikut.',
  error: 'Ketuk kata yang salah pada kalimat berikut.',
};
export const D221_MAX = 14;
function drill221(): Q[] {
  const id = () => qid('221');
  reg(D221.mcq, { t: 'mcq', right: 'The data were collected last week.', wrong: 'Collected were data the last week.' });
  reg(D221.multi, { t: 'multi', right: ['The letter was sent.', 'The bridge is being repaired.'], wrong: ['The letter was sent.', 'She sends the letter.'] });
  reg(D221.tfng, { t: 'choice', right: 'True', wrong: 'False' });
  reg(D221.ynng, { t: 'choice', right: 'Not Given', wrong: 'Yes' });
  reg(D221.fill, { t: 'text', right: 'are sorted', wrong: 'is sort' });
  reg(D221.short, { t: 'text', right: 'past participle', wrong: 'past simple' });
  reg(D221.drop, {
    t: 'match',
    right: { break: 'broken', write: 'written', take: 'taken', see: 'seen' },
    // 3 dari 4 benar -> kredit parsial 3 dari 4 poin
    wrong: { break: 'broken', write: 'written', take: 'taken', see: 'spoken' },
  });
  reg(D221.drag, { t: 'match', right: { be: 'been', have: 'had' }, wrong: { be: 'had', have: 'been' } });
  reg(D221.reorder, { t: 'reorder', right: ['The report', 'was written', 'by the team'] });
  reg(D221.error, { t: 'error', right: ['was'], wrong: ['results'] });
  const base = { skill: 'GRAMMAR' as const };
  return [
    { question_id: id(), question_type: 'MCQ_SINGLE', ...base, prompt: D221.mcq, explanation_id: 'Pasif: be + V3.', options: ['The data were collected last week.', 'The data collected last week was.', 'Collected were data the last week.'], correct_answers: ['The data were collected last week.'] },
    { question_id: id(), question_type: 'MCQ_MULTI', ...base, prompt: D221.multi, explanation_id: 'Dua kalimat pasif: was sent dan is being repaired.', options: ['The letter was sent.', 'She sends the letter.', 'The bridge is being repaired.', 'They repair the bridge.'], correct_answers: ['The letter was sent.', 'The bridge is being repaired.'] },
    { question_id: id(), question_type: 'TFNG', ...base, prompt: D221.tfng, explanation_id: 'Sesuai teks: be + past participle.', correct_answers: ['True'] },
    { question_id: id(), question_type: 'YNNG', ...base, prompt: D221.ynng, explanation_id: 'Teks tidak membahas saran itu.', correct_answers: ['Not Given'] },
    { question_id: id(), question_type: 'FILL_IN_BLANK', ...base, prompt: D221.fill, explanation_id: 'Subjek jamak: are sorted.', correct_answers: ['are sorted'], max_words: 2 },
    { question_id: id(), question_type: 'SHORT_ANSWER', ...base, prompt: D221.short, explanation_id: 'V3 disebut past participle.', correct_answers: ['past participle'], max_words: 2 },
    { question_id: id(), question_type: 'MATCHING_DROPDOWN', ...base, points: 4, prompt: D221.drop, explanation_id: 'break-broken, write-written, take-taken, see-seen.', matching: { left: ['break', 'write', 'take', 'see'], right: ['broken', 'written', 'taken', 'seen', 'spoken'] }, correct_answers: [0, 1, 2, 3] },
    { question_id: id(), question_type: 'MATCHING_DRAG', ...base, points: 2, prompt: D221.drag, explanation_id: 'be-been, have-had.', matching: { left: ['be', 'have'], right: ['been', 'had', 'gone'] }, correct_answers: [0, 1] },
    { question_id: id(), question_type: 'SENTENCE_REORDER', ...base, prompt: D221.reorder, explanation_id: 'Subjek + was written + by agent.', segments: ['The report', 'was written', 'by the team'] },
    { question_id: id(), question_type: 'ERROR_RECOGNITION', ...base, prompt: D221.error, explanation_id: 'Subjek jamak "results" butuh "were".', tokens: ['The', 'results', 'was', 'published', 'yesterday'], correct_answers: [2] },
  ];
}

// ---------------------------------------------------------------- set ujian bergaya "pilih teks awalan" (tanpa umpan balik)
export const RIGHT_PREFIX = 'Jawaban benar';
export const WRONG_PREFIX = 'Pengecoh';
function examQuestions(tag: string, count: number, extra: Q = {}): Q[] {
  return Array.from({ length: count }, (_, i) => ({
    question_id: qid(tag),
    question_type: 'MCQ_SINGLE',
    skill: 'GRAMMAR',
    prompt: `Soal ${tag} nomor ${i + 1}: pilih jawaban yang benar.`,
    explanation_id: 'Pembahasan.',
    options: [`${RIGHT_PREFIX} ${tag}-${i + 1}`, `${WRONG_PREFIX} ${tag}-${i + 1}a`, `${WRONG_PREFIX} ${tag}-${i + 1}b`],
    correct_answers: [`${RIGHT_PREFIX} ${tag}-${i + 1}`],
    ...extra,
  }));
}

// ---------------------------------------------------------------- materi
export const VIDEO_ID = 'dQw4w9WgXcQ';
export const VIDEO = { video_id: VIDEO_ID, title: 'Video uji inti belajar', instructor_channel: 'Kanal Uji', language: 'ID', start_sec: 10, end_sec: 200 };
export const TIPS_LABEL = 'Tips Examiner';
export const MISTAKE_LABEL = 'Kesalahan Umum';
export const ARTICLE_121 = [
  '## Mengenal Kata Benda',
  '',
  'Kata benda (**noun**) menamai orang, tempat, atau benda. Contoh: *apple*, *library*, *teacher*.',
  '',
  ':::tips-examiner',
  'Baca soal dua kali sebelum menjawab.',
  ':::',
  '',
  ':::kesalahan-umum',
  'Lupa memakai an sebelum bunyi vokal.',
  ':::',
  '',
  '## Tabel Kosakata Lebar',
  '',
  '| Kolom A | Kolom B | Kolom C | Kolom D | Kolom E | Kolom F | Kolom G | Kolom H | Kolom I | Kolom J | Kolom K | Kolom L |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  '| contoh sangat panjang nomor satu | contoh sangat panjang nomor dua | contoh sangat panjang nomor tiga | contoh sangat panjang nomor empat | contoh sangat panjang nomor lima | contoh sangat panjang nomor enam | contoh sangat panjang nomor tujuh | contoh sangat panjang nomor delapan | contoh sangat panjang nomor sembilan | contoh sangat panjang nomor sepuluh | contoh sangat panjang nomor sebelas | contoh sangat panjang nomor dua belas |',
  '',
  '## Tautan',
  '',
  'Rujukan luar: [Situs contoh](https://example.com/rujukan). (Skema javascript: ditolak validator impor, jadi hanya dapat diuji di tingkat komponen.)',
  '',
  'Gambar Markdown ini harus dibuang: ![gambar luar](http://x.invalid/a.png)',
  '',
  '## Latihan Singkat',
  '',
  'Baca ulang contoh lalu lanjut ke video dan slide.',
].join('\n');
const ARTICLE_SIMPLE = (title: string) => `## ${title}\n\nIni materi singkat untuk ${title}. Pelajari contoh lalu kerjakan latihan.\n\n- Poin satu\n- Poin dua\n`;

const MINI_SELF = {
  task_type: 'SELF_CHECK',
  prompt: 'Tulis lima kata benda dari kamarmu di buku catatan.',
  ai_rubric_criteria: 'Lima kata benda ditulis dengan benar.',
};

const SKIP_MODULE_21_COUNT = 6;
const SKIP_TIER_3_COUNT = 4;
export const SKIP_MODULE_TITLE = 'E2E Core Uji Kompetensi Modul 2.1';
export const SKIP_TIER_TITLE = 'E2E Core Uji Kompetensi Tier 3';
export const BOSS_TITLE = 'E2E Core Boss Stage Tier 4';

export const SUB_TITLES: Record<string, string> = {
  '1.4.1': '1.000 Kata Inti (Oxford A1-A2) dalam Konteks Kalimat',
  '1.4.2': 'Fonetik Dasar, Bunyi Vokal Panjang/Pendek, & Word Stress',
  '2.1.1': 'Conjunctions & Discourse Markers (however, although, despite, therefore, whereas)',
  '2.2.1': 'Anatomi Paragraf Akademik: Topic Sentence + Explanation + Concrete Example',
  '2.2.2': 'Teknik Paraphrasing (Sinonim, Word Form, Aktif-Pasif)',
  '4.2.1': 'Penggunaan Inversion, Participle Clauses, & Nominalization secara Alami',
  '4.3.1': 'Menyelesaikan 3 Reading Passages (40 Soal) dalam 50 Menit dengan Akurasi >= 30/40',
};

function sub(tier: number, module: string, category: string, code: string, materials: Q, drill: Q[], timeLimit = 300): Q {
  return {
    tier_number: tier,
    module_code: module,
    module_category: category,
    sub_module_code: code,
    sub_module_title: SUB_TITLES[code],
    passing_score_percent: 75,
    origin: 'ORIGINAL_AUTHORED',
    materials,
    active_drill: { time_limit_seconds: timeLimit, questions: drill },
  };
}

export function buildCorePackage(): { content: Record<string, unknown>; manifest: Record<string, unknown> } {
  n = 0;
  ANSWERS.clear();
  const content = {
    contract_version: '1.1',
    sub_modules: [
      sub(
        1, '1.4', 'VOCAB', '1.4.1',
        {
          article_markdown: ARTICLE_121,
          videos: [VIDEO],
          slides: [1, 2, 3].map((i) => ({ order: i, asset_code: `e2e-core/slide-${i}`, caption: `Keterangan slide ${i}`, alt: `Gambar slide ${i}` })),
          attachments: [{ title: 'Cheatsheet Kata Benda', file_type: 'PDF', asset_code: 'e2e-core/cheatsheet' }],
          mini_task: MINI_SELF,
        },
        drill121(),
      ),
      sub(1, '1.4', 'VOCAB', '1.4.2', { article_markdown: ARTICLE_SIMPLE('Fonetik Dasar') }, drillMini('122')),
      sub(2, '2.1', 'GRAMMAR', '2.1.1', { article_markdown: ARTICLE_SIMPLE('Conjunctions') }, drillMini('211')),
      sub(2, '2.2', 'WRITING', '2.2.1', { article_markdown: ARTICLE_SIMPLE('Anatomi Paragraf') }, drill221(), 600),
      sub(2, '2.2', 'WRITING', '2.2.2', { article_markdown: ARTICLE_SIMPLE('Paraphrasing') }, drillMini('222')),
      sub(4, '4.2', 'WRITING', '4.2.1', { article_markdown: ARTICLE_SIMPLE('Inversion') }, drillMini('421')),
      sub(4, '4.3', 'READING', '4.3.1', { article_markdown: ARTICLE_SIMPLE('Reading Stamina') }, drillMini('431')),
    ],
    assessment_sets: [
      { set_type: 'SKIP_MODULE_TEST', title: SKIP_MODULE_TITLE, module_code: '2.1', time_limit_seconds: 120, origin: 'ORIGINAL_AUTHORED', questions: examQuestions('SM21', SKIP_MODULE_21_COUNT) },
      { set_type: 'SKIP_TIER_TEST', title: SKIP_TIER_TITLE, tier_number: 3, time_limit_seconds: 30, origin: 'ORIGINAL_AUTHORED', questions: examQuestions('ST3', SKIP_TIER_3_COUNT) },
      { set_type: 'TIER_BOSS_EXAM', title: BOSS_TITLE, tier_number: 4, origin: 'ORIGINAL_AUTHORED', questions: [] },
      {
        set_type: 'BOSS_SECTION', title: 'E2E Core Boss T4 Listening', tier_number: 4, skill_category: 'LISTENING', time_limit_seconds: 600,
        listening_asset_code: 'gt-listening/gt-l-s1-001', origin: 'ORIGINAL_AUTHORED',
        questions: examQuestions('BL4', 4, { skill: 'LISTENING', section_no: 1 }),
      },
      {
        set_type: 'BOSS_SECTION', title: 'E2E Core Boss T4 Reading', tier_number: 4, skill_category: 'READING', time_limit_seconds: 900,
        reading_passage_markdown: 'Ini teks bacaan singkat untuk uji Boss Stage. Pembaca diminta memilih jawaban yang benar.',
        origin: 'ORIGINAL_AUTHORED',
        questions: examQuestions('BR4', 4, { skill: 'READING', passage_no: 1 }),
      },
    ],
  };
  const manifest = {
    contract_version: '1.1',
    assets: [
      ...[1, 2, 3].map((i) => ({
        asset_code: `e2e-core/slide-${i}`,
        kind: 'SLIDE_IMAGE',
        title: `Slide inti belajar ${i}`,
        source_code: 'OWN',
        rights_status: 'OWN_ORIGINAL',
        file: `slides/slide-${i}.webp`,
      })),
      { asset_code: 'e2e-core/cheatsheet', kind: 'DOCUMENT', title: 'Cheatsheet kata benda', source_code: 'OWN', rights_status: 'OWN_ORIGINAL', file: 'docs/cheatsheet.pdf' },
    ],
  };
  return { content, manifest };
}

/** Tulis content.json, assets.manifest.json, dan assets/ (disalin dari content/golden-sample) ke `dir`. */
export function materializeCorePackage(dir: string, codesDir: string): void {
  const { content, manifest } = buildCorePackage();
  mkdirSync(path.join(dir, 'assets', 'slides'), { recursive: true });
  mkdirSync(path.join(dir, 'assets', 'docs'), { recursive: true });
  const gs = path.join(codesDir, 'content', 'golden-sample', 'assets');
  const slideSrc = ['passive-formula.webp', 'passive-transform.webp', 'passive-process.webp'];
  slideSrc.forEach((f, i) => copyFileSync(path.join(gs, 'slides', f), path.join(dir, 'assets', 'slides', `slide-${i + 1}.webp`)));
  copyFileSync(path.join(gs, 'docs', 'passive-voice-cheatsheet.pdf'), path.join(dir, 'assets', 'docs', 'cheatsheet.pdf'));
  writeFileSync(path.join(dir, 'content.json'), JSON.stringify(content, null, 2));
  writeFileSync(path.join(dir, 'assets.manifest.json'), JSON.stringify(manifest, null, 2));
}

// Isi ANSWERS saat modul dimuat.
buildCorePackage();
