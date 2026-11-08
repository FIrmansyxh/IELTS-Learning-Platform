import { and, eq, ne } from 'drizzle-orm';
import { assessmentSets, attempts, contentAssets } from '@/db/schema';
import type { DbOrTx } from '../db';
import { ApiError } from '../http/errors';
import { newRngSeed, seededCsprng, shuffled } from '../attempts/prng';
import { serveQuestion, type Served } from '../attempts/engine';
import { splitPassages } from '../content/passages';
import type {
  MockPartState,
  MockQuestionState,
  MockSectionState,
  MockTestState,
  SimulationOptionsResponse,
  SimulationSection,
} from '@/contracts/simulation';
import type { Question } from '@/contracts/content';

export const ORDERED_SECTIONS: readonly SimulationSection[] = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];

export interface BankRow {
  id: string;
  bankCode: string | null;
  bankKind: string | null;
  skillCategory: string | null;
  readingPassageMarkdown: string | null;
  listeningAssetId: string | null;
  questionsJson: unknown;
  questionCount: number;
  audioDurationSec?: number | null;
  audioMimeType?: string | null;
  audioAttribution?: string | null;
}

export interface ReadingPackage {
  bank_set_id: string;
  bank_code: string;
  bank_kind: string;
  passage_no: number;
  passage_markdown: string;
  questions: Question[];
  seen_count: number;
}

/** Urutkan section sesuai urutan tetap D2: LISTENING -> READING -> WRITING, dan SPEAKING selalu terakhir. */
export function sortSimulationSections(sections: readonly SimulationSection[]): SimulationSection[] {
  const set = new Set(sections);
  return ORDERED_SECTIONS.filter((s) => set.has(s));
}

export async function getSeenSimulationQuestionIds(db: DbOrTx, userId: string): Promise<Set<string>> {
  const pastAttempts = await db
    .select({ state: attempts.state })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.assessmentType, 'MOCK_TEST'),
        ne(attempts.status, 'ABANDONED'),
      ),
    );

  const seen = new Set<string>();
  for (const a of pastAttempts) {
    const s = a.state as unknown as MockTestState | null;
    if (s && s.schema === 'mock.v1' && Array.isArray(s.sections)) {
      for (const sec of s.sections) {
        if (Array.isArray(sec.questions)) {
          for (const q of sec.questions) {
            if (q.question_id) seen.add(q.question_id);
          }
        }
      }
    }
  }
  return seen;
}

async function loadPublishedBanks(db: DbOrTx): Promise<BankRow[]> {
  const rows = await db
    .select({
      id: assessmentSets.id,
      bankCode: assessmentSets.bankCode,
      bankKind: assessmentSets.bankKind,
      skillCategory: assessmentSets.skillCategory,
      readingPassageMarkdown: assessmentSets.readingPassageMarkdown,
      listeningAssetId: assessmentSets.listeningAssetId,
      questionsJson: assessmentSets.questionsJson,
      questionCount: assessmentSets.questionCount,
      audioDurationSec: contentAssets.durationSec,
      audioMimeType: contentAssets.mimeType,
      audioAttribution: contentAssets.attributionText,
    })
    .from(assessmentSets)
    .leftJoin(contentAssets, eq(assessmentSets.listeningAssetId, contentAssets.id))
    .where(
      and(
        eq(assessmentSets.assessmentType, 'QUESTION_BANK'),
        eq(assessmentSets.status, 'PUBLISHED'),
        eq(assessmentSets.examModule, 'GENERAL_TRAINING'),
      ),
    );

  return rows;
}

/**
 * Cek ketersediaan tiap section untuk GET /api/v1/simulations/options.
 */
export async function checkSimulationOptions(
  db: DbOrTx,
  userId: string,
): Promise<SimulationOptionsResponse['data']> {
  const [activeAttempt] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.assessmentType, 'MOCK_TEST'),
        eq(attempts.status, 'IN_PROGRESS'),
      ),
    )
    .limit(1);

  const banks = await loadPublishedBanks(db);
  const seenIds = await getSeenSimulationQuestionIds(db, userId);

  // 1. LISTENING: butuh S1, S2, S3, S4 masing-masing beraudio, total tepat 40 soal
  const listeningSections = ['LISTENING_GT_S1', 'LISTENING_GT_S2', 'LISTENING_GT_S3', 'LISTENING_GT_S4'];
  const listeningCandidates: Record<string, BankRow[]> = {
    LISTENING_GT_S1: [],
    LISTENING_GT_S2: [],
    LISTENING_GT_S3: [],
    LISTENING_GT_S4: [],
  };

  for (const b of banks) {
    if (b.bankKind && listeningSections.includes(b.bankKind) && b.listeningAssetId && (b.audioDurationSec ?? 0) > 0) {
      listeningCandidates[b.bankKind]?.push(b);
    }
  }

  let listeningAvailable = false;
  let listeningTimeLimit: number | null = null;
  // Cek apakah ada kombinasi 4 bagian dengan total tepat 40 soal
  const l1List = listeningCandidates['LISTENING_GT_S1'] ?? [];
  const l2List = listeningCandidates['LISTENING_GT_S2'] ?? [];
  const l3List = listeningCandidates['LISTENING_GT_S3'] ?? [];
  const l4List = listeningCandidates['LISTENING_GT_S4'] ?? [];

  if (l1List.length > 0 && l2List.length > 0 && l3List.length > 0 && l4List.length > 0) {
    for (const b1 of l1List) {
      for (const b2 of l2List) {
        for (const b3 of l3List) {
          for (const b4 of l4List) {
            const totalQ = b1.questionCount + b2.questionCount + b3.questionCount + b4.questionCount;
            if (totalQ === 40) {
              listeningAvailable = true;
              const totalAudio =
                (b1.audioDurationSec ?? 0) +
                (b2.audioDurationSec ?? 0) +
                (b3.audioDurationSec ?? 0) +
                (b4.audioDurationSec ?? 0);
              listeningTimeLimit = totalAudio + 120;
              break;
            }
          }
          if (listeningAvailable) break;
        }
        if (listeningAvailable) break;
      }
      if (listeningAvailable) break;
    }
  }

  // 2. READING: butuh kombinasi S1, S2, S3 dengan total tepat 40 soal
  const readingPackages = extractReadingPackages(banks, seenIds);
  const readingCombinations = findReadingCombinations(readingPackages);
  const readingAvailable = readingCombinations.length > 0;

  // 3. WRITING: butuh >= 1 Task 1 dan >= 1 Task 2
  const writingT1 = banks.filter((b) => b.bankKind?.startsWith('WRITING_GT_T1'));
  const writingT2 = banks.filter((b) => b.bankKind === 'WRITING_GT_T2');
  const t1Questions = writingT1.flatMap((b) => (b.questionsJson as Question[]) ?? []);
  const t2Questions = writingT2.flatMap((b) => (b.questionsJson as Question[]) ?? []);
  const writingAvailable = t1Questions.length >= 1 && t2Questions.length >= 1;

  // 4. SPEAKING: butuh >= 4 P1, >= 1 P2, >= 4 P3
  const spkP1 = banks.filter((b) => b.bankKind === 'SPEAKING_P1').flatMap((b) => (b.questionsJson as Question[]) ?? []);
  const spkP2 = banks.filter((b) => b.bankKind === 'SPEAKING_P2').flatMap((b) => (b.questionsJson as Question[]) ?? []);
  const spkP3 = banks.filter((b) => b.bankKind === 'SPEAKING_P3').flatMap((b) => (b.questionsJson as Question[]) ?? []);
  const speakingAvailable = spkP1.length >= 4 && spkP2.length >= 1 && spkP3.length >= 4;

  return {
    sections: [
      {
        section: 'LISTENING',
        available: listeningAvailable,
        unavailable_reason: listeningAvailable ? null : 'CONTENT_MISSING',
        unavailable_detail: listeningAvailable
          ? null
          : 'Listening membutuhkan 4 bagian beraudio dengan total 40 soal.',
        time_limit_seconds: listeningTimeLimit,
        question_count: 40,
      },
      {
        section: 'READING',
        available: readingAvailable,
        unavailable_reason: readingAvailable ? null : 'CONTENT_MISSING',
        unavailable_detail: readingAvailable
          ? null
          : 'Reading membutuhkan 3 teks dengan total 40 soal.',
        time_limit_seconds: readingAvailable ? 3600 : null,
        question_count: 40,
      },
      {
        section: 'WRITING',
        available: writingAvailable,
        unavailable_reason: writingAvailable ? null : 'CONTENT_MISSING',
        unavailable_detail: writingAvailable
          ? null
          : 'Writing membutuhkan minimal 1 soal Task 1 dan 1 soal Task 2.',
        time_limit_seconds: writingAvailable ? 3600 : null,
        question_count: 2,
      },
      {
        section: 'SPEAKING',
        available: speakingAvailable,
        unavailable_reason: speakingAvailable ? null : 'CONTENT_MISSING',
        unavailable_detail: speakingAvailable
          ? null
          : 'Speaking membutuhkan minimal 4 soal Part 1, 1 soal Part 2, dan 4 soal Part 3.',
        time_limit_seconds: null,
        question_count: 9,
      },
    ],
    in_progress_attempt_id: activeAttempt?.id ?? null,
  };
}

export function extractReadingPackages(banks: BankRow[], seenIds: Set<string>): ReadingPackage[] {
  const packages: ReadingPackage[] = [];
  const readingKinds = new Set(['READING_GT_S1', 'READING_GT_S2', 'READING_GT_S3']);

  for (const b of banks) {
    if (!b.bankKind || !readingKinds.has(b.bankKind)) continue;
    // Soal disalin apa adanya: properti tambahan (mis. `position`) membuat snapshot gagal validasi skema kontrak
    // saat attempt dibaca ulang lewat GET /attempts/{id} (500).
    const questions = (b.questionsJson as Question[]) ?? [];
    const rawPassages = splitPassages(b.readingPassageMarkdown ?? '');

    // Kelompokkan pertanyaan menurut passage_no
    const passageGroups = new Map<number, Question[]>();
    for (const q of questions) {
      const pNo = (q as { passage_no?: number }).passage_no ?? 1;
      if (!passageGroups.has(pNo)) passageGroups.set(pNo, []);
      passageGroups.get(pNo)!.push(q);
    }

    if (passageGroups.size === 0 && questions.length > 0) {
      // Tidak ada passage_no eksplisit; seluruh bank adalah 1 paket
      const text = rawPassages[0] ?? b.readingPassageMarkdown ?? '';
      const seen = questions.filter((q) => seenIds.has(q.question_id)).length;
      packages.push({
        bank_set_id: b.id,
        bank_code: b.bankCode ?? '',
        bank_kind: b.bankKind,
        passage_no: 1,
        passage_markdown: text,
        questions,
        seen_count: seen,
      });
    } else {
      for (const [pNo, pQuestions] of passageGroups.entries()) {
        const text = rawPassages[pNo - 1] ?? rawPassages[0] ?? b.readingPassageMarkdown ?? '';
        const seen = pQuestions.filter((q) => seenIds.has(q.question_id)).length;
        packages.push({
          bank_set_id: b.id,
          bank_code: b.bankCode ?? '',
          bank_kind: b.bankKind,
          passage_no: pNo,
          passage_markdown: text,
          questions: pQuestions,
          seen_count: seen,
        });
      }
    }
  }

  return packages;
}

export interface ReadingCombination {
  s1: ReadingPackage;
  s2: ReadingPackage;
  s3: ReadingPackage;
  total_seen: number;
}

export function findReadingCombinations(packages: ReadingPackage[]): ReadingCombination[] {
  const s1Packs = packages.filter((p) => p.bank_kind === 'READING_GT_S1');
  const s2Packs = packages.filter((p) => p.bank_kind === 'READING_GT_S2');
  const s3Packs = packages.filter((p) => p.bank_kind === 'READING_GT_S3');

  const combos: ReadingCombination[] = [];
  for (const s1 of s1Packs) {
    for (const s2 of s2Packs) {
      for (const s3 of s3Packs) {
        if (s1.questions.length + s2.questions.length + s3.questions.length === 40) {
          combos.push({
            s1,
            s2,
            s3,
            total_seen: s1.seen_count + s2.seen_count + s3.seen_count,
          });
        }
      }
    }
  }
  return combos;
}

/**
 * Merakit snapshot mock.v1 untuk attempt simulasi.
 */
export async function assembleSimulation(
  db: DbOrTx,
  userId: string,
  sections: SimulationSection[],
  rngSeed?: string,
): Promise<{ state: MockTestState; totalDurationSec: number | null }> {
  const banks = await loadPublishedBanks(db);
  const seenIds = await getSeenSimulationQuestionIds(db, userId);
  return assembleFromPool(banks, sections, seenIds, rngSeed ?? newRngSeed());
}

/**
 * Inti perakit murni (D3): `pool` = bank QUESTION_BANK PUBLISHED GENERAL_TRAINING, `seenIds` = question_id yang pernah
 * muncul pada simulasi lain, `seed` = seed PRNG. Tanpa akses DB sehingga dapat diuji unit.
 */
export function assembleFromPool(
  banks: BankRow[],
  sections: SimulationSection[],
  seenIds: Set<string>,
  seed: string,
): { state: MockTestState; totalDurationSec: number | null } {
  const rng = seededCsprng(seed);

  const ordered = sortSimulationSections(sections);
  const mockSections: MockSectionState[] = [];
  const missingDetails: Array<{ path: string; code: string; message: string }> = [];

  let totalDurationSec = 0;

  for (let order = 1; order <= ordered.length; order++) {
    const sec = ordered[order - 1]!;
    if (sec === 'LISTENING') {
      const candidates: Record<string, BankRow[]> = {
        LISTENING_GT_S1: [],
        LISTENING_GT_S2: [],
        LISTENING_GT_S3: [],
        LISTENING_GT_S4: [],
      };
      for (const b of banks) {
        if (
          b.bankKind &&
          ['LISTENING_GT_S1', 'LISTENING_GT_S2', 'LISTENING_GT_S3', 'LISTENING_GT_S4'].includes(b.bankKind) &&
          b.listeningAssetId &&
          (b.audioDurationSec ?? 0) > 0
        ) {
          candidates[b.bankKind]?.push(b);
        }
      }

      const l1 = candidates['LISTENING_GT_S1'] ?? [];
      const l2 = candidates['LISTENING_GT_S2'] ?? [];
      const l3 = candidates['LISTENING_GT_S3'] ?? [];
      const l4 = candidates['LISTENING_GT_S4'] ?? [];

      const combos: Array<{ banks: [BankRow, BankRow, BankRow, BankRow]; seen: number }> = [];
      for (const b1 of l1) {
        for (const b2 of l2) {
          for (const b3 of l3) {
            for (const b4 of l4) {
              if (b1.questionCount + b2.questionCount + b3.questionCount + b4.questionCount === 40) {
                const qs = [
                  ...((b1.questionsJson as Question[]) ?? []),
                  ...((b2.questionsJson as Question[]) ?? []),
                  ...((b3.questionsJson as Question[]) ?? []),
                  ...((b4.questionsJson as Question[]) ?? []),
                ];
                const seenCount = qs.filter((q) => seenIds.has(q.question_id)).length;
                combos.push({ banks: [b1, b2, b3, b4], seen: seenCount });
              }
            }
          }
        }
      }

      if (combos.length === 0) {
        missingDetails.push({
          path: 'sections.LISTENING',
          code: 'content_missing',
          message: 'Listening membutuhkan 4 bagian beraudio dengan total 40 soal.',
        });
        continue;
      }

      // Pilih kombinasi dengan seen paling sedikit
      combos.sort((a, b) => a.seen - b.seen);
      const minSeen = combos[0]!.seen;
      const bestCombos = combos.filter((c) => c.seen === minSeen);
      const chosen = bestCombos[Math.floor(rng() * bestCombos.length)]!;

      const parts: MockPartState[] = [];
      const questions: MockQuestionState[] = [];
      let pos = 1;
      let audioSecTotal = 0;

      for (let pIdx = 0; pIdx < 4; pIdx++) {
        const b = chosen.banks[pIdx]!;
        const partNo = pIdx + 1;
        audioSecTotal += b.audioDurationSec ?? 0;
        parts.push({
          part_no: partNo,
          bank_set_id: b.id,
          bank_code: b.bankCode ?? '',
          passage_no: null,
          passage_markdown: null,
          listening_asset_id: b.listeningAssetId,
          audio_duration_sec: b.audioDurationSec ?? null,
          attribution_text: b.audioAttribution ?? null,
        });

        const bQs = (b.questionsJson as Question[]) ?? [];
        for (const q of bQs) {
          let optOrder: string[] | null = null;
          const rawOpts = 'options' in q ? (q as { options?: string[] }).options : undefined;
          const opts = Array.isArray(rawOpts) ? rawOpts : null;
          if (opts && opts.length > 0) {
            optOrder = shuffled(opts, rng);
          }
          questions.push({
            position: pos++,
            question_id: q.question_id,
            bank_set_id: b.id,
            part_no: partNo,
            skill: 'LISTENING',
            question_type: q.question_type,
            option_order: optOrder,
            question: q as unknown as Record<string, unknown>,
          });
        }
      }

      const timeLimitSeconds = audioSecTotal + 120;
      totalDurationSec += timeLimitSeconds;
      mockSections.push({
        section: 'LISTENING',
        order,
        time_limit_seconds: timeLimitSeconds,
        parts,
        questions,
      });
    } else if (sec === 'READING') {
      const packages = extractReadingPackages(banks, seenIds);
      const combos = findReadingCombinations(packages);

      if (combos.length === 0) {
        missingDetails.push({
          path: 'sections.READING',
          code: 'content_missing',
          message: 'Reading membutuhkan 3 teks dengan total 40 soal.',
        });
        continue;
      }

      combos.sort((a, b) => a.total_seen - b.total_seen);
      const minSeen = combos[0]!.total_seen;
      const bestCombos = combos.filter((c) => c.total_seen === minSeen);
      const chosen = bestCombos[Math.floor(rng() * bestCombos.length)]!;

      const parts: MockPartState[] = [];
      const questions: MockQuestionState[] = [];
      let pos = 1;

      const chosenPacks = [chosen.s1, chosen.s2, chosen.s3];
      for (let pIdx = 0; pIdx < 3; pIdx++) {
        const pack = chosenPacks[pIdx]!;
        const partNo = pIdx + 1;
        parts.push({
          part_no: partNo,
          bank_set_id: pack.bank_set_id,
          bank_code: pack.bank_code,
          passage_no: pack.passage_no,
          passage_markdown: pack.passage_markdown,
          listening_asset_id: null,
          audio_duration_sec: null,
        });

        for (const q of pack.questions) {
          let optOrder: string[] | null = null;
          const rawOpts = 'options' in q ? (q as { options?: string[] }).options : undefined;
          const opts = Array.isArray(rawOpts) ? rawOpts : null;
          if (opts && opts.length > 0) {
            optOrder = shuffled(opts, rng);
          }
          questions.push({
            position: pos++,
            question_id: q.question_id,
            bank_set_id: pack.bank_set_id,
            part_no: partNo,
            skill: 'READING',
            question_type: q.question_type,
            option_order: optOrder,
            question: q as unknown as Record<string, unknown>,
          });
        }
      }

      const timeLimitSeconds = 3600;
      totalDurationSec += timeLimitSeconds;
      mockSections.push({
        section: 'READING',
        order,
        time_limit_seconds: timeLimitSeconds,
        parts,
        questions,
      });
    } else if (sec === 'WRITING') {
      const writingT1Banks = banks.filter((b) => b.bankKind?.startsWith('WRITING_GT_T1'));
      const writingT2Banks = banks.filter((b) => b.bankKind === 'WRITING_GT_T2');

      const t1Pool: Array<{ bank: BankRow; q: Question }> = [];
      for (const b of writingT1Banks) {
        for (const q of (b.questionsJson as Question[]) ?? []) {
          t1Pool.push({ bank: b, q });
        }
      }

      const t2Pool: Array<{ bank: BankRow; q: Question }> = [];
      for (const b of writingT2Banks) {
        for (const q of (b.questionsJson as Question[]) ?? []) {
          t2Pool.push({ bank: b, q });
        }
      }

      if (t1Pool.length === 0 || t2Pool.length === 0) {
        missingDetails.push({
          path: 'sections.WRITING',
          code: 'content_missing',
          message: 'Writing membutuhkan minimal 1 soal Task 1 dan 1 soal Task 2.',
        });
        continue;
      }

      // Pilih Task 1: D3: Register Task 1 dipilih seragam acak di antara register yang punya soal belum dilihat
      const t1ByRegister = new Map<string, Array<{ bank: BankRow; q: Question }>>();
      for (const item of t1Pool) {
        const reg = item.bank.bankKind ?? 'WRITING_GT_T1_FORMAL';
        if (!t1ByRegister.has(reg)) t1ByRegister.set(reg, []);
        t1ByRegister.get(reg)!.push(item);
      }

      const registersWithUnseen: string[] = [];
      for (const [reg, items] of t1ByRegister.entries()) {
        if (items.some((it) => !seenIds.has(it.q.question_id))) {
          registersWithUnseen.push(reg);
        }
      }

      const chosenRegister =
        registersWithUnseen.length > 0
          ? registersWithUnseen[Math.floor(rng() * registersWithUnseen.length)]!
          : [...t1ByRegister.keys()][Math.floor(rng() * t1ByRegister.size)]!;

      const candidateT1s = t1ByRegister.get(chosenRegister)!;
      const unseenT1s = candidateT1s.filter((it) => !seenIds.has(it.q.question_id));
      const chosenT1 =
        unseenT1s.length > 0
          ? unseenT1s[Math.floor(rng() * unseenT1s.length)]!
          : candidateT1s[Math.floor(rng() * candidateT1s.length)]!;

      // Pilih Task 2: prioritaskan belum dilihat
      const unseenT2s = t2Pool.filter((it) => !seenIds.has(it.q.question_id));
      const chosenT2 =
        unseenT2s.length > 0
          ? unseenT2s[Math.floor(rng() * unseenT2s.length)]!
          : t2Pool[Math.floor(rng() * t2Pool.length)]!;

      const parts: MockPartState[] = [
        {
          part_no: 1,
          bank_set_id: chosenT1.bank.id,
          bank_code: chosenT1.bank.bankCode ?? '',
          passage_no: null,
          passage_markdown: null,
          listening_asset_id: null,
          audio_duration_sec: null,
        },
        {
          part_no: 2,
          bank_set_id: chosenT2.bank.id,
          bank_code: chosenT2.bank.bankCode ?? '',
          passage_no: null,
          passage_markdown: null,
          listening_asset_id: null,
          audio_duration_sec: null,
        },
      ];

      const questions: MockQuestionState[] = [
        {
          position: 1,
          question_id: chosenT1.q.question_id,
          bank_set_id: chosenT1.bank.id,
          part_no: 1,
          skill: 'WRITING',
          question_type: chosenT1.q.question_type,
          option_order: null,
          question: chosenT1.q as unknown as Record<string, unknown>,
        },
        {
          position: 2,
          question_id: chosenT2.q.question_id,
          bank_set_id: chosenT2.bank.id,
          part_no: 2,
          skill: 'WRITING',
          question_type: chosenT2.q.question_type,
          option_order: null,
          question: chosenT2.q as unknown as Record<string, unknown>,
        },
      ];

      const timeLimitSeconds = 3600;
      totalDurationSec += timeLimitSeconds;
      mockSections.push({
        section: 'WRITING',
        order,
        time_limit_seconds: timeLimitSeconds,
        parts,
        questions,
      });
    } else if (sec === 'SPEAKING') {
      const p1Pool: Array<{ bank: BankRow; q: Question }> = [];
      const p2Pool: Array<{ bank: BankRow; q: Question }> = [];
      const p3Pool: Array<{ bank: BankRow; q: Question }> = [];

      for (const b of banks) {
        if (b.bankKind === 'SPEAKING_P1') {
          for (const q of (b.questionsJson as Question[]) ?? []) p1Pool.push({ bank: b, q });
        } else if (b.bankKind === 'SPEAKING_P2') {
          for (const q of (b.questionsJson as Question[]) ?? []) p2Pool.push({ bank: b, q });
        } else if (b.bankKind === 'SPEAKING_P3') {
          for (const q of (b.questionsJson as Question[]) ?? []) p3Pool.push({ bank: b, q });
        }
      }

      if (p1Pool.length < 4 || p2Pool.length < 1 || p3Pool.length < 4) {
        missingDetails.push({
          path: 'sections.SPEAKING',
          code: 'content_missing',
          message: 'Speaking membutuhkan minimal 4 soal Part 1, 1 soal Part 2, dan 4 soal Part 3.',
        });
        continue;
      }

      // Ambil 4 dari P1 (prioritaskan unseen)
      const chosenP1 = selectQuestionsPrioritizingUnseen(p1Pool, 4, seenIds, rng);
      // Ambil 1 dari P2
      const chosenP2 = selectQuestionsPrioritizingUnseen(p2Pool, 1, seenIds, rng);
      // Ambil 4 dari P3
      const chosenP3 = selectQuestionsPrioritizingUnseen(p3Pool, 4, seenIds, rng);

      const parts: MockPartState[] = [
        {
          part_no: 1,
          bank_set_id: chosenP1[0]!.bank.id,
          bank_code: chosenP1[0]!.bank.bankCode ?? '',
          passage_no: null,
          passage_markdown: null,
          listening_asset_id: null,
          audio_duration_sec: null,
        },
        {
          part_no: 2,
          bank_set_id: chosenP2[0]!.bank.id,
          bank_code: chosenP2[0]!.bank.bankCode ?? '',
          passage_no: null,
          passage_markdown: null,
          listening_asset_id: null,
          audio_duration_sec: null,
        },
        {
          part_no: 3,
          bank_set_id: chosenP3[0]!.bank.id,
          bank_code: chosenP3[0]!.bank.bankCode ?? '',
          passage_no: null,
          passage_markdown: null,
          listening_asset_id: null,
          audio_duration_sec: null,
        },
      ];

      const questions: MockQuestionState[] = [];
      let pos = 1;

      for (const item of chosenP1) {
        questions.push({
          position: pos++,
          question_id: item.q.question_id,
          bank_set_id: item.bank.id,
          part_no: 1,
          skill: 'SPEAKING',
          question_type: item.q.question_type,
          option_order: null,
          question: item.q as unknown as Record<string, unknown>,
        });
      }

      for (const item of chosenP2) {
        questions.push({
          position: pos++,
          question_id: item.q.question_id,
          bank_set_id: item.bank.id,
          part_no: 2,
          skill: 'SPEAKING',
          question_type: item.q.question_type,
          option_order: null,
          question: item.q as unknown as Record<string, unknown>,
        });
      }

      for (const item of chosenP3) {
        questions.push({
          position: pos++,
          question_id: item.q.question_id,
          bank_set_id: item.bank.id,
          part_no: 3,
          skill: 'SPEAKING',
          question_type: item.q.question_type,
          option_order: null,
          question: item.q as unknown as Record<string, unknown>,
        });
      }

      mockSections.push({
        section: 'SPEAKING',
        order,
        time_limit_seconds: null,
        parts,
        questions,
      });
    }
  }

  if (missingDetails.length > 0) {
    throw new ApiError('SIMULATION_NOT_ENOUGH_CONTENT', {
      details: missingDetails,
    });
  }

  // `served` harus berbentuk `Served` mesin soal (SPEC-006) agar GET /attempts/{id} dapat membangun DTO publik tanpa galat.
  // MCQ: diturunkan dari `option_order` supaya urutan opsi sama dengan yang disajikan GET .../sections/{section}.
  const allOrder: string[] = [];
  const servedMap: Record<string, Served> = {};
  for (const s of mockSections) {
    for (const q of s.questions) {
      allOrder.push(q.question_id);
      const orig = q.question as unknown as Question;
      const rawOpts = 'options' in orig ? (orig as { options?: string[] }).options : undefined;
      if ((orig.question_type === 'MCQ_SINGLE' || orig.question_type === 'MCQ_MULTI') && Array.isArray(rawOpts) && q.option_order) {
        servedMap[q.question_id] = {
          option_ids: q.option_order.map((_, i) => `o${i}`),
          option_orig_index: q.option_order.map((o) => rawOpts.indexOf(o)),
        };
      } else {
        servedMap[q.question_id] = serveQuestion(orig, rng);
      }
    }
  }

  return {
    state: {
      schema: 'mock.v1',
      rng_seed: seed,
      sections: mockSections,
      v: 1,
      order: allOrder,
      served: servedMap,
      last_resume_at: new Date().toISOString(),
    },
    totalDurationSec: totalDurationSec > 0 ? totalDurationSec : null,
  };
}

export function selectQuestionsPrioritizingUnseen<T extends { q: Question }>(
  pool: T[],
  count: number,
  seenIds: Set<string>,
  rng: () => number,
): T[] {
  const unseen = pool.filter((it) => !seenIds.has(it.q.question_id));
  const seen = pool.filter((it) => seenIds.has(it.q.question_id));

  const shuffledUnseen = shuffled(unseen, rng);
  const shuffledSeen = shuffled(seen, rng);

  const selected: T[] = [];
  for (const it of shuffledUnseen) {
    if (selected.length < count) selected.push(it);
  }
  for (const it of shuffledSeen) {
    if (selected.length < count) selected.push(it);
  }
  return selected.slice(0, count);
}
