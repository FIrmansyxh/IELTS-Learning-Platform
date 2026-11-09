#!/usr/bin/env node
/**
 * Pembangkit paket konten SINTETIS untuk E2E domain Ujian dan Penilaian (exam-*.spec.ts).
 * Hasil: content.json + assets.manifest.json di folder ini. Jalankan ulang bila struktur berubah:
 *   node tests/fixtures/e2e-content/exams/generate.mjs
 * Isi hanyalah teks uji buatan (bukan materi belajar). Semua kunci jawaban = opsi PERTAMA ("Right ...") atau
 * jawaban isian yang tertulis di sini; urutan opsi diacak server, jadi tes memilih opsi berdasarkan teks.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PROV = { origin: 'AI_GENERATED_REVIEWED', source_code: 'OWN' };
const AUDIO = 'e2e/listening/exam-tone';

const mcq = (id, prompt, right, wrongs, extra = {}) => ({
  question_id: id,
  question_type: 'MCQ_SINGLE',
  skill: extra.skill ?? 'READING',
  prompt,
  options: [right, ...wrongs],
  correct_answers: [right],
  explanation_id: 'Pembahasan uji E2E.',
  ...(extra.difficulty ? { difficulty: extra.difficulty } : {}),
  ...(extra.passage_no ? { passage_no: extra.passage_no } : {}),
  ...(extra.section_no ? { section_no: extra.section_no } : {}),
});
const tfng = (id, prompt, answer, extra = {}) => ({
  question_id: id,
  question_type: 'TFNG',
  skill: 'READING',
  prompt,
  correct_answers: [answer],
  explanation_id: 'Pembahasan uji E2E.',
  ...(extra.passage_no ? { passage_no: extra.passage_no } : {}),
});
const fill = (id, prompt, answer, extra = {}) => ({
  question_id: id,
  question_type: 'FILL_IN_BLANK',
  skill: extra.skill ?? 'READING',
  prompt,
  correct_answers: [answer],
  max_words: 1,
  explanation_id: 'Pembahasan uji E2E.',
  ...(extra.passage_no ? { passage_no: extra.passage_no } : {}),
  ...(extra.section_no ? { section_no: extra.section_no } : {}),
});

// ------------------------------------------------------------- Teks Reading (2 bagian, paragraf berlabel)
const PASSAGE = [
  '# The Saturday Market',
  '',
  '[A] Green Lane Market opens every Saturday morning from eight until one. Local farmers sell fresh vegetables and fruit.',
  '',
  '[B] Visitors can also buy bread, cheese and flowers. Parking is free for the first two hours.',
  '',
  ...['C', 'D', 'E', 'F', 'G', 'H'].flatMap((l) => [
    `[${l}] This extra paragraph only adds length so that the text panel can scroll on small screens. It says nothing about opening times, parking or prices, and it is repeated several times on purpose to fill the panel with plain words that need no thinking at all.`,
    '',
  ]),
  '===PASSAGE===',
  '# Library Notice',
  '',
  '[A] The city library will close for repairs for one week in March. Books can be returned in the box outside.',
  '',
  '[B] Members who borrow books during the closure will receive a one week extension.',
].join('\n');

const readingQs = (p) => [
  mcq(`Q-E2E-${p}-R1`, 'When does the market open?', 'Every Saturday morning', ['Every day', 'On Sundays only', 'Never'], { passage_no: 1 }),
  tfng(`Q-E2E-${p}-R2`, 'Parking is free for the whole day.', 'False', { passage_no: 1 }),
  fill(`Q-E2E-${p}-R3`, 'Parking is free for the first ___ hours.', 'two', { passage_no: 1 }),
  mcq(`Q-E2E-${p}-R4`, 'How long will the library be closed?', 'One week', ['One day', 'One month', 'One year'], { passage_no: 2 }),
  tfng(`Q-E2E-${p}-R5`, 'Books can be returned during the closure.', 'True', { passage_no: 2 }),
  fill(`Q-E2E-${p}-R6`, 'Members receive a one ___ extension.', 'week', { passage_no: 2 }),
];

// ------------------------------------------------------------- Listening (4 soal, 2 section)
const listeningQs = (p) => [
  mcq(`Q-E2E-${p}-L1`, 'What is the speaker doing?', 'Joining the library', ['Buying a ticket', 'Booking a hotel', 'Ordering food'], { skill: 'LISTENING', section_no: 1 }),
  fill(`Q-E2E-${p}-L2`, 'Write the surname given by the speaker: ___', 'Archer', { skill: 'LISTENING', section_no: 1 }),
  mcq(`Q-E2E-${p}-L3`, 'Which day is mentioned?', 'Tuesday', ['Monday', 'Friday', 'Sunday'], { skill: 'LISTENING', section_no: 2 }),
  fill(`Q-E2E-${p}-L4`, 'How many books can a member borrow? ___', 'six', { skill: 'LISTENING', section_no: 2 }),
];

const writingQ = (p, kind = 'TASK1') => ({
  question_id: `Q-E2E-${p}-W1`,
  question_type: 'WRITING_TASK',
  skill: 'WRITING',
  prompt: 'Write a short letter to a neighbour about noise at night.',
  task_kind: kind,
  min_words: 20,
  time_limit_minutes: 20,
});
const speakingQ = (p) => ({
  question_id: `Q-E2E-${p}-S1`,
  question_type: 'SPEAKING_TASK',
  skill: 'SPEAKING',
  prompt: 'Describe a place you like to visit and explain why.',
  part: 2,
  prep_seconds: 60,
  record_seconds: 120,
  cue_points: ['where it is', 'what you do there', 'why you like it'],
});

// ------------------------------------------------------------- Sub-modul sintetis
const drill = (p, audio) => ({
  time_limit_seconds: 300,
  pass_percent: 60,
  ...(audio ? { listening_asset_code: AUDIO } : {}),
  questions: [
    mcq(`Q-E2E-${p}-D1`, 'Pick the right answer one.', 'Right one', ['Wrong a', 'Wrong b', 'Wrong c']),
    mcq(`Q-E2E-${p}-D2`, 'Pick the right answer two.', 'Right two', ['Wrong a', 'Wrong b', 'Wrong c']),
    mcq(`Q-E2E-${p}-D3`, 'Pick the right answer three.', 'Right three', ['Wrong a', 'Wrong b', 'Wrong c']),
  ],
});
const sub = (tier, module, code, title, category, p, mini, audio) => ({
  tier_number: tier,
  module_code: module,
  module_category: category,
  sub_module_code: code,
  sub_module_title: title,
  passing_score_percent: 60,
  ...PROV,
  materials: {
    article_markdown: `## ${title}\n\nMateri sintetis untuk uji E2E ujian dan penilaian.`,
    ...(mini ? { mini_task: mini } : {}),
  },
  active_drill: drill(p, audio),
});

const subModules = [
  sub(1, '1.3', '1.3.2', 'E2E Reading Dasar (sintetis)', 'READING', 'X132'),
  sub(2, '2.3', '2.3.2', 'E2E Listening Menengah (sintetis)', 'READING', 'X232', undefined, true),
  sub(3, '3.4', '3.4.1', 'E2E Speaking Part 1 (sintetis)', 'SPEAKING', 'X341', {
    task_type: 'AI_SHORT_SPEAKING',
    prompt: 'Jawab dalam bahasa Inggris: What do you usually do on weekends?',
    ai_rubric_criteria: 'Fluency, lexical resource, grammar, pronunciation.',
  }),
];

// ------------------------------------------------------------- Set penilaian
const boss = (tier) => {
  const p = `B${tier}`;
  return [
    { set_type: 'TIER_BOSS_EXAM', title: `E2E Boss Stage Tier ${tier}`, tier_number: tier, ...PROV, questions: [] },
    { set_type: 'BOSS_SECTION', title: `E2E Boss T${tier} Listening`, tier_number: tier, skill_category: 'LISTENING', time_limit_seconds: 600, listening_asset_code: AUDIO, ...PROV, questions: listeningQs(p) },
    { set_type: 'BOSS_SECTION', title: `E2E Boss T${tier} Reading`, tier_number: tier, skill_category: 'READING', time_limit_seconds: 600, reading_passage_markdown: PASSAGE, ...PROV, questions: readingQs(p) },
    { set_type: 'BOSS_SECTION', title: `E2E Boss T${tier} Writing`, tier_number: tier, skill_category: 'WRITING', time_limit_seconds: 600, ...PROV, questions: [writingQ(p)] },
    { set_type: 'BOSS_SECTION', title: `E2E Boss T${tier} Speaking`, tier_number: tier, skill_category: 'SPEAKING', time_limit_seconds: 300, ...PROV, questions: [speakingQ(p)] },
  ];
};

// Placement: 30 soal, 6 per tingkat kesulitan 1-5. Opsi benar selalu "Right <id>".
const placementQs = [];
for (let d = 1; d <= 5; d++) {
  for (let k = 1; k <= 6; k++) {
    const n = `${d}${k}`;
    placementQs.push(
      mcq(`Q-E2E-PL-${n}`, `Placement level ${d} item ${k}: choose the right option.`, `Right ${n}`, [`Wrong ${n} a`, `Wrong ${n} b`, `Wrong ${n} c`], {
        skill: k % 2 ? 'GRAMMAR' : 'VOCAB',
        difficulty: d,
      }),
    );
  }
}

const content = {
  contract_version: '1.1',
  sub_modules: subModules,
  assessment_sets: [
    {
      set_type: 'SKIP_MODULE_TEST',
      title: 'E2E Skip Modul 1.3 (Reading, 2 teks)',
      module_code: '1.3',
      time_limit_seconds: 600,
      pass_percent: 85,
      reading_passage_markdown: PASSAGE,
      ...PROV,
      questions: readingQs('SK13'),
    },
    {
      set_type: 'SKIP_MODULE_TEST',
      title: 'E2E Skip Modul 2.3 (Listening, 2 section)',
      module_code: '2.3',
      time_limit_seconds: 600,
      pass_percent: 85,
      listening_asset_code: AUDIO,
      ...PROV,
      questions: listeningQs('SK23'),
    },
    ...boss(1),
    ...boss(2),
    { set_type: 'PLACEMENT_TEST', title: 'E2E Placement Test (sintetis, 30 soal)', time_limit_seconds: 1500, ...PROV, questions: placementQs },
  ],
};

const manifest = {
  contract_version: '1.1',
  assets: [
    {
      asset_code: AUDIO,
      kind: 'AUDIO_LISTENING',
      title: 'Audio uji E2E (sintetis)',
      source_code: 'OWN',
      rights_status: 'OWN_ORIGINAL',
      file: 'audio/e2e-exam-tone.wav',
      attribution_text: 'Audio dibuat dengan suara sintetis.',
    },
  ],
};

// Nada sinus 440 Hz 12 detik (WAV 8 kHz 16-bit mono) sebagai audio uji; bukan rekaman nyata.
function toneWav(seconds, hz, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), 44 + i * 2);
  return buf;
}
mkdirSync(path.join(dir, 'assets', 'audio'), { recursive: true });
writeFileSync(path.join(dir, 'assets', 'audio', 'e2e-exam-tone.wav'), toneWav(12, 440));
writeFileSync(path.join(dir, 'content.json'), JSON.stringify(content, null, 2));
writeFileSync(path.join(dir, 'assets.manifest.json'), JSON.stringify(manifest, null, 2));
console.log('content.json + assets.manifest.json ditulis di', dir);
