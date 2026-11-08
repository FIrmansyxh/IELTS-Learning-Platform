import { randomUUID } from 'node:crypto';
import { execute, getDb } from '@/server/db';
import { assessmentSets, contentAssets, contentSources } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function seedSimulationFixtures() {
  const db = getDb();

  const [src] = await db.select().from(contentSources).limit(1);
  const sourceId = src?.id ?? randomUUID();

  // 1. Buat Content Assets untuk Listening Audio (AC-16: 5+5+5+5 detik = 20s)
  const assetIds: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const id = randomUUID();
    assetIds.push(id);
    await db
      .insert(contentAssets)
      .values({
        id,
        assetCode: `gt-listening/sim-audio-${i}`,
        kind: 'AUDIO_LISTENING',
        title: `Listening S${i} Audio Fixture`,
        sourceId,
        rightsStatus: 'OWN_ORIGINAL',
        storageBackend: 'FILESYSTEM',
        storageKey: `audio/sim-l-s${i}.mp3`,
        mimeType: 'audio/mpeg',
        durationSec: 5,
        attributionText: `Listening S${i} Audio Fixture`,
      })
      .onConflictDoNothing();
  }

  // 2. Buat Bank Listening S1..S4 (10 soal per bagian = 40 soal)
  for (let part = 1; part <= 4; part++) {
    const qs = [];
    for (let q = 1; q <= 10; q++) {
      qs.push({
        question_id: `Q-SIM-L${part}-${q.toString().padStart(2, '0')}`,
        question_type: 'MCQ_SINGLE',
        skill: 'LISTENING',
        prompt: `Listening Part ${part} Question ${q}`,
        options: ['A', 'B', 'C', 'D'],
        correct_answers: ['A'],
        explanation_id: `Exp L${part}-${q}`,
        points: 1,
      });
    }

    await db
      .insert(assessmentSets)
      .values({
        id: randomUUID(),
        assessmentType: 'QUESTION_BANK',
        bankCode: `SIM-BANK-L-S${part}`,
        bankKind: `LISTENING_GT_S${part}`,
        title: `Sim Listening Section ${part}`,
        skillCategory: 'LISTENING',
        timeLimitSeconds: 0,
        listeningAssetId: assetIds[part - 1]!,
        questionsJson: qs,
        questionCount: 10,
        origin: 'ORIGINAL_AUTHORED',
        status: 'PUBLISHED',
        examModule: 'GENERAL_TRAINING',
      })
      .onConflictDoNothing();
  }

  // 3. Buat Bank Reading S1 (14 soal), S2 (13 soal), S3 (13 soal) = 40 soal
  const readingConfigs = [
    { kind: 'READING_GT_S1', code: 'SIM-BANK-RD-S1', count: 14, part: 1 },
    { kind: 'READING_GT_S2', code: 'SIM-BANK-RD-S2', count: 13, part: 2 },
    { kind: 'READING_GT_S3', code: 'SIM-BANK-RD-S3', count: 13, part: 3 },
  ];

  for (const cfg of readingConfigs) {
    const qs = [];
    for (let q = 1; q <= cfg.count; q++) {
      qs.push({
        question_id: `Q-SIM-RD${cfg.part}-${q.toString().padStart(2, '0')}`,
        question_type: 'MCQ_SINGLE',
        skill: 'READING',
        prompt: `Reading Part ${cfg.part} Question ${q}`,
        options: ['True', 'False', 'Not Given'],
        correct_answers: ['True'],
        explanation_id: `Exp RD${cfg.part}-${q}`,
        passage_no: 1,
        points: 1,
      });
    }

    await db
      .insert(assessmentSets)
      .values({
        id: randomUUID(),
        assessmentType: 'QUESTION_BANK',
        bankCode: cfg.code,
        bankKind: cfg.kind,
        title: `Sim Reading Section ${cfg.part}`,
        skillCategory: 'READING',
        timeLimitSeconds: 0,
        readingPassageMarkdown: `Reading Passage Section ${cfg.part}\n\nThis is paragraph one for section ${cfg.part}.\n\nThis is paragraph two.`,
        questionsJson: qs,
        questionCount: cfg.count,
        origin: 'ORIGINAL_AUTHORED',
        status: 'PUBLISHED',
        examModule: 'GENERAL_TRAINING',
      })
      .onConflictDoNothing();
  }

  // 4. Buat Bank Writing T1 & T2
  await db
    .insert(assessmentSets)
    .values({
      id: randomUUID(),
      assessmentType: 'QUESTION_BANK',
      bankCode: 'SIM-BANK-W-T1',
      bankKind: 'WRITING_GT_T1_FORMAL',
      title: 'Sim Writing Task 1',
      skillCategory: 'WRITING',
      timeLimitSeconds: 0,
      questionsJson: [
        {
          question_id: 'Q-SIM-W-T1-01',
          question_type: 'WRITING_TASK',
          skill: 'WRITING',
          task_kind: 'TASK1',
          prompt: 'Write a formal letter to your landlord.',
          min_words: 150,
          points: 1,
        },
      ],
      questionCount: 1,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
      examModule: 'GENERAL_TRAINING',
    })
    .onConflictDoNothing();

  await db
    .insert(assessmentSets)
    .values({
      id: randomUUID(),
      assessmentType: 'QUESTION_BANK',
      bankCode: 'SIM-BANK-W-T2',
      bankKind: 'WRITING_GT_T2',
      title: 'Sim Writing Task 2',
      skillCategory: 'WRITING',
      timeLimitSeconds: 0,
      questionsJson: [
        {
          question_id: 'Q-SIM-W-T2-01',
          question_type: 'WRITING_TASK',
          skill: 'WRITING',
          task_kind: 'TASK2',
          prompt: 'Some people think technology is beneficial. Discuss both views.',
          min_words: 250,
          points: 1,
        },
      ],
      questionCount: 1,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
      examModule: 'GENERAL_TRAINING',
    })
    .onConflictDoNothing();

  // 5. Buat Bank Speaking P1, P2, P3
  const spkP1Qs = [];
  for (let i = 1; i <= 4; i++) {
    spkP1Qs.push({
      question_id: `Q-SIM-SPK1-${i}`,
      question_type: 'SPEAKING_TASK',
      skill: 'SPEAKING',
      part: 1,
      prompt: `Speaking Part 1 Question ${i}`,
      points: 1,
    });
  }
  await db
    .insert(assessmentSets)
    .values({
      id: randomUUID(),
      assessmentType: 'QUESTION_BANK',
      bankCode: 'SIM-BANK-SPK-P1',
      bankKind: 'SPEAKING_P1',
      title: 'Sim Speaking Part 1',
      skillCategory: 'SPEAKING',
      timeLimitSeconds: 0,
      questionsJson: spkP1Qs,
      questionCount: 4,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
      examModule: 'GENERAL_TRAINING',
    })
    .onConflictDoNothing();

  await db
    .insert(assessmentSets)
    .values({
      id: randomUUID(),
      assessmentType: 'QUESTION_BANK',
      bankCode: 'SIM-BANK-SPK-P2',
      bankKind: 'SPEAKING_P2',
      title: 'Sim Speaking Part 2',
      skillCategory: 'SPEAKING',
      timeLimitSeconds: 0,
      questionsJson: [
        {
          question_id: 'Q-SIM-SPK2-01',
          question_type: 'SPEAKING_TASK',
          skill: 'SPEAKING',
          part: 2,
          prompt: 'Describe a memorable journey you took.',
          points: 1,
        },
      ],
      questionCount: 1,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
      examModule: 'GENERAL_TRAINING',
    })
    .onConflictDoNothing();

  const spkP3Qs = [];
  for (let i = 1; i <= 4; i++) {
    spkP3Qs.push({
      question_id: `Q-SIM-SPK3-${i}`,
      question_type: 'SPEAKING_TASK',
      skill: 'SPEAKING',
      part: 3,
      prompt: `Speaking Part 3 Question ${i}`,
      points: 1,
    });
  }
  await db
    .insert(assessmentSets)
    .values({
      id: randomUUID(),
      assessmentType: 'QUESTION_BANK',
      bankCode: 'SIM-BANK-SPK-P3',
      bankKind: 'SPEAKING_P3',
      title: 'Sim Speaking Part 3',
      skillCategory: 'SPEAKING',
      timeLimitSeconds: 0,
      questionsJson: spkP3Qs,
      questionCount: 4,
      origin: 'ORIGINAL_AUTHORED',
      status: 'PUBLISHED',
      examModule: 'GENERAL_TRAINING',
    })
    .onConflictDoNothing();
}
