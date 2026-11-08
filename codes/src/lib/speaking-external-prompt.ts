/**
 * Prompt latihan Speaking untuk AI pihak ketiga bermode suara (Claude, ChatGPT, Gemini) (ADR-004, SPEC-013 addendum).
 * Prompt memuat soal, alur sesi, rubrik platform, aturan kalibrasi, dan blok hasil baku yang dibaca
 * `parseExternalSpeakingResult`. Murni (tanpa DB/DOM) sehingga dipakai server (DTO soal), klien, dan tes.
 */

export interface SpeakingPromptInput {
  /** Bagian ujian Speaking: 1 (wawancara), 2 (cue card), 3 (diskusi). */
  part: 1 | 2 | 3;
  /** Pertanyaan / topik kartu. */
  prompt: string;
  /** Butir cue card (Part 2). */
  cuePoints?: readonly string[];
  prepSeconds?: number;
  recordSeconds?: number;
}

const PART_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Part 1 (Interview: short answers about familiar everyday topics)',
  2: 'Part 2 (Long turn: speak about a topic card for 1 to 2 minutes)',
  3: 'Part 3 (Discussion: abstract, deeper follow-up questions)',
};

/** Rubrik platform (parafrase orisinal; bukan salinan teks resmi). Band 4-8 per kriteria. */
const RUBRIC = `PLATFORM RUBRIC (score each criterion separately, in steps of 0.5, between 4.0 and 8.0 unless the answer is clearly outside that range)

1) FLUENCY (Fluency and Coherence)
- Band 4: long pauses and repetition; short broken sentences; ideas often not connected.
- Band 5: keeps going but hesitates or repeats often; relies on basic linkers (and, but, because); gets stuck on harder topics.
- Band 6: speaks at length with some hesitation; uses a range of linkers but sometimes stiffly; ideas are easy to follow.
- Band 7: flows with rare hesitation; flexible discourse markers; ideas develop logically.
- Band 8: flows almost without effort; pauses are for thinking about content, not searching for words; well-developed, relevant answers.

2) LEXICAL (Lexical Resource)
- Band 4: basic vocabulary; frequent wrong word choices; struggles outside familiar topics.
- Band 5: enough for familiar topics but limited and repetitive; paraphrasing often fails.
- Band 6: wide enough to discuss topics; occasional wrong word choice; paraphrasing usually works.
- Band 7: flexible vocabulary across topics; some idiomatic phrases and collocations, occasionally imprecise; paraphrasing is effective.
- Band 8: wide and precise; idioms used naturally with only slight slips; word-searching is barely noticeable.

3) GRAMMAR (Grammatical Range and Accuracy)
- Band 4: mostly simple structures; frequent errors, some block understanding.
- Band 5: simple structures fairly accurate; complex sentences attempted but often wrong.
- Band 6: mix of simple and complex sentences; errors occur but rarely block understanding.
- Band 7: many complex structures used flexibly; most sentences error-free; only small slips remain.
- Band 8: wide range used flexibly and accurately; errors are rare and unsystematic.

4) PRONUNCIATION
- Band 4: many mispronounced sounds, flat intonation; often hard to understand.
- Band 5: some correct features but inconsistent; listener needs effort for some words.
- Band 6: understandable most of the time; stress and intonation control inconsistent.
- Band 7: pronunciation features used flexibly with occasional lapses; easy to understand throughout.
- Band 8: easy to understand; stress, rhythm and intonation wide-ranging and effective; accent does not interfere.`;

function calibrationRules(part: 1 | 2 | 3): string {
  const lines = [
    '- Be strict and honest. Never raise a score to be kind. If unsure between two bands, choose the lower one.',
    '- An answer that is off-topic caps FLUENCY at 5.0.',
    '- Judge PRONUNCIATION only from what you actually hear. If audio quality was poor, say so and score conservatively.',
  ];
  if (part === 1) {
    lines.push('- If most answers are a single short sentence, cap FLUENCY at 5.5 and LEXICAL at 6.0. Good Part 1 answers give a direct answer, a reason, and a short example.');
  } else if (part === 2) {
    lines.push('- If I speak for less than 60 seconds, cap FLUENCY at 5.5. A strong long turn covers every bullet point and ends with a clear conclusion.');
  } else {
    lines.push('- If my answers stay concrete and personal instead of analysing causes, comparisons and future trends, cap FLUENCY at 6.0 and LEXICAL at 6.0.');
  }
  return lines.join('\n');
}

const RESULT_BLOCK = `=== PLATFORM RESULT ===
FLUENCY: <score>
LEXICAL: <score>
GRAMMAR: <score>
PRONUNCIATION: <score>
OVERALL: <score>
=== END ===`;

export function buildSpeakingExternalPrompt(input: SpeakingPromptInput): string {
  const { part, prompt, cuePoints = [], prepSeconds, recordSeconds } = input;
  const lines: string[] = [];

  lines.push(
    'You are a strict but supportive IELTS General Training Speaking examiner. We will practise by VOICE.',
    `Practice item: ${PART_LABEL[part]}.`,
    '',
    'HOW THE SESSION WORKS',
  );

  if (part === 2) {
    lines.push(
      `1. Read me this topic card, then wait silently while I prepare (${prepSeconds ?? 60} seconds).`,
      `2. I will then speak for about ${Math.round((recordSeconds ?? 120) / 60) || 2} minutes. Do NOT interrupt me. If I stop early, ask at most one short prompt such as "Can you tell me more?".`,
      '3. After my answer, ask ONE rounding-off question related to the topic, and let me answer it briefly.',
    );
  } else if (part === 3) {
    lines.push(
      '1. Ask me the question below. Do NOT interrupt me while I answer.',
      '2. Then ask 2 follow-up questions that go deeper (reasons, comparisons, opinions about society, future trends), one at a time, waiting for each answer.',
    );
  } else {
    lines.push(
      '1. Ask me the question below. Do NOT interrupt me while I answer.',
      '2. Then ask 2 more related Part 1 questions, one at a time, waiting for each answer.',
    );
  }

  lines.push('', 'THE TASK', `Question / topic: ${prompt}`);
  if (cuePoints.length > 0) {
    lines.push('You should say:', ...cuePoints.map((c) => `- ${c}`));
  }

  lines.push(
    '',
    RUBRIC,
    '',
    'CALIBRATION RULES',
    calibrationRules(part),
    '- OVERALL = the average of the four scores, rounded to the nearest 0.5 (an average ending in .25 rounds up to .5; an average ending in .75 rounds up to the next whole number).',
    '',
    'AFTER THE LAST ANSWER, EVALUATE ME (not before). Give, in this order:',
    '- A score and a one-line reason for each of the four criteria.',
    '- 3 strengths.',
    '- The 3 to 5 most important mistakes I made, quoting my words, with the corrected version and a short reason.',
    '- Pronunciation or stress problems you noticed, with how to fix them.',
    '- A Band 7 model answer to the first question (natural, not memorised-sounding).',
    '- One specific exercise I should do next.',
    '- The final result block below, LAST, with real numbers instead of <score>. Put nothing after it.',
    '',
    RESULT_BLOCK,
    '',
    'RULES',
    '- Write all explanations and feedback in Indonesian. Keep my corrected sentences and the model answer in English.',
    '- Remind me before the result block that this is a practice estimate, not an official IELTS score.',
    '',
    'Start now by greeting me briefly in English and asking the first question.',
  );

  return lines.join('\n');
}

// ------------------------------------------------------------------ parser blok hasil

export type SpeakingCriterion = 'fluency' | 'lexical' | 'grammar' | 'pronunciation';
export const SPEAKING_CRITERIA: readonly SpeakingCriterion[] = ['fluency', 'lexical', 'grammar', 'pronunciation'];

export interface ParsedSpeakingResult {
  scores: Partial<Record<SpeakingCriterion, number>>;
  /** OVERALL dari AI (hanya informasi; platform menghitung sendiri). */
  overall?: number;
  /** Kriteria yang tidak ditemukan atau nilainya tidak valid. */
  problems: Array<{ field: SpeakingCriterion | 'overall'; reason: 'missing' | 'not_half_step' | 'out_of_range' }>;
}

const FIELD_RES: Array<[SpeakingCriterion | 'overall', RegExp]> = [
  ['fluency', /^\s*[*_`>#-]*\s*FLUENCY[^:=\n]*[:=]\s*([^\n]*)$/im],
  ['lexical', /^\s*[*_`>#-]*\s*LEXICAL[^:=\n]*[:=]\s*([^\n]*)$/im],
  ['grammar', /^\s*[*_`>#-]*\s*GRAMMAR[^:=\n]*[:=]\s*([^\n]*)$/im],
  ['pronunciation', /^\s*[*_`>#-]*\s*PRONUNCIATION[^:=\n]*[:=]\s*([^\n]*)$/im],
  ['overall', /^\s*[*_`>#-]*\s*OVERALL[^:=\n]*[:=]\s*([^\n]*)$/im],
];

/**
 * Membaca blok `PLATFORM RESULT` dari jawaban AI. Toleran terhadap huruf besar/kecil, markdown (**), koma
 * desimal ("6,5"), dan akhiran seperti "/9". Hanya kelipatan 0,5 dalam 0-9 yang diterima.
 */
export function parseExternalSpeakingResult(text: string): ParsedSpeakingResult {
  // Bila ada blok bertanda, ambil blok TERAKHIR agar contoh `<score>` di prompt yang ikut tertempel diabaikan.
  const marker = 'platform result';
  const startAt = text.toLowerCase().lastIndexOf(marker);
  let scope = text;
  if (startAt >= 0) {
    const lines = text.slice(startAt + marker.length).split('\n');
    const endAt = lines.findIndex((l) => {
      const t = l.trim().toLowerCase();
      return t.startsWith('=') && t.replaceAll('=', '').trim() === 'end';
    });
    scope = (endAt >= 0 ? lines.slice(0, endAt) : lines).join('\n');
  }

  const scores: ParsedSpeakingResult['scores'] = {};
  const problems: ParsedSpeakingResult['problems'] = [];
  let overall: number | undefined;

  for (const [field, re] of FIELD_RES) {
    const m = re.exec(scope);
    const raw = m?.[1]?.replace(/\*+/g, '').trim() ?? '';
    const num = /^\d+[.,]?\d*/.exec(raw);
    if (!num) {
      if (field !== 'overall') problems.push({ field, reason: 'missing' });
      continue;
    }
    const v = Number(num[0].replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 9) {
      problems.push({ field, reason: 'out_of_range' });
      continue;
    }
    if (!Number.isInteger(v * 2)) {
      problems.push({ field, reason: 'not_half_step' });
      continue;
    }
    if (field === 'overall') overall = v;
    else scores[field] = v;
  }
  return { scores, overall, problems };
}

/** Overall platform: rata-rata 4 kriteria dibulatkan ke 0,5 terdekat (sama dengan server). */
export function computeSpeakingOverall(s: Record<SpeakingCriterion, number>): number {
  return Math.round(((s.fluency + s.lexical + s.grammar + s.pronunciation) / 4) * 2) / 2;
}
