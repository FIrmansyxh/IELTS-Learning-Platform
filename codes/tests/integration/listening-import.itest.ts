/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { execute, getDb } from '@/server/db';
import { assessmentSets, attempts, contentAssets, contentSources } from '@/db/schema';
import { validateBankPackage } from '@/server/content/bank-validate';
import { validateListeningReview } from '@/server/listening/review-gate';
import { GET as banksRoute } from '@/app/api/v1/banks/route';
import { GET as attemptGetRoute } from '@/app/api/v1/attempts/[attempt_id]/route';
import { call, learnerSession } from './helpers';
import { sha256Hex } from '@/server/content/validate';

describe('Listening Content & Review Gate Integration (AC-A5, AC-A6, AC-A7, AC-A8, AC-A9, AC-A10)', () => {
  const dummyAudio = Buffer.from('RIFF....WAVEfmt ....data....DUMMY_MP3_CONTENT');
  const dummyScript = Buffer.from('---\npart_code: GT-L-S1-001\n---\n[A] Hello\n[B] Hi\n');
  const dummyScriptHash = sha256Hex(dummyScript);

  beforeEach(async () => {
    const db = getDb();
    await execute(db, sql`DELETE FROM attempt_answers`);
    await execute(db, sql`DELETE FROM attempts`);
    await execute(db, sql`DELETE FROM assessment_sets WHERE bank_code LIKE 'GT-LIS-%' OR bank_code LIKE 'TEST-LIS-%'`);
  });

  it('AC-A5: validator bank Listening menegakkan listening_asset_code / pending_audio', () => {
    const baseBank = {
      bank_code: 'GT-LIS-S1-TEST',
      bank_kind: 'LISTENING_GT_S1' as const,
      title: 'Test Listening Bank',
      skill: 'LISTENING' as const,
      exam_module: 'GENERAL_TRAINING' as const,
      origin: 'ORIGINAL_AUTHORED' as const,
      questions: [
        {
          question_id: 'Q-TEST-001',
          question_type: 'SHORT_ANSWER',
          skill: 'LISTENING',
          prompt: 'Listen and answer',
          correct_answers: ['answer'],
          max_words: 3,
          explanation_id: 'Exp',
        },
      ],
    };

    // 1. Tanpa listening_asset_code dan tanpa pending_audio -> listening_asset_required
    const r1 = validateBankPackage({
      bank_contract_version: '1.0',
      banks: [baseBank as any],
    });
    expect(!r1.ok && r1.errors.some((e) => e.code === 'listening_asset_required')).toBe(true);

    // 2. Kode aset tidak terdaftar -> listening_asset_unregistered
    const r2 = validateBankPackage(
      {
        bank_contract_version: '1.0',
        banks: [{ ...baseBank, listening_asset_code: 'gt-listening/unknown-asset' } as any],
      },
      {
        manifestAssets: new Map(),
        dbAssets: new Map(),
      },
    );
    expect(!r2.ok && r2.errors.some((e) => e.code === 'listening_asset_unregistered')).toBe(true);

    // 3. Kode aset terdaftar sebagai AUDIO_LISTENING OWN_ORIGINAL -> lolos
    const r3 = validateBankPackage(
      {
        bank_contract_version: '1.0',
        banks: [{ ...baseBank, listening_asset_code: 'gt-listening/valid-asset' } as any],
      },
      {
        manifestAssets: new Map([
          ['gt-listening/valid-asset', { kind: 'AUDIO_LISTENING' }],
        ]),
      },
    );
    expect(r3.ok).toBe(true);
  });

  it('AC-A6 & AC-A7: review-gate memvalidasi berkas review secara ketat', async () => {
    // 1. Berkas tidak ada -> listening_review_missing
    const r1 = await validateListeningReview({
      reviewFilePath: 'non/existent/path.review.json',
      expectedPartCode: 'GT-L-S1-001',
    });
    expect(r1.valid).toBe(false);
    expect(r1.code).toBe('listening_review_missing');

    // 2. Hash audio tidak cocok -> listening_review_stale
    const invalidReviewJson = JSON.stringify({
      part_code: 'GT-L-S1-001',
      reviewer: 'Test Reviewer',
      reviewed_at: '2026-11-08',
      clarity: 5,
      speed: 4,
      naturalness: 4,
      answer_leak: false,
      approved: true,
      script_sha256: dummyScriptHash,
      audio_sha256: 'different_audio_sha256_which_does_not_match_actual_buffer_hash_123',
    });

    const fs = await import('node:fs/promises');
    const tmpReview = path.resolve('temp-test.review.json');
    await fs.writeFile(tmpReview, invalidReviewJson, 'utf8');

    try {
      const r2 = await validateListeningReview({
        reviewFilePath: tmpReview,
        expectedPartCode: 'GT-L-S1-001',
        currentAudioBuffer: dummyAudio,
        currentScriptBuffer: dummyScript,
      });
      expect(r2.valid).toBe(false);
      expect(r2.code).toBe('listening_review_stale');
    } finally {
      await fs.unlink(tmpReview).catch(() => undefined);
    }
  });

  it('AC-A8: bank Listening DRAFT tidak tampil di GET /api/v1/banks', async () => {
    const db = getDb();
    const { cookie } = await learnerSession();

    // Buat bank DRAFT sementara
    await db.insert(assessmentSets).values({
      assessmentType: 'QUESTION_BANK',
      bankCode: 'GT-LIS-S1-DRAFT',
      bankKind: 'LISTENING_GT_S1',
      title: 'Draft Listening Set',
      skillCategory: 'LISTENING',
      timeLimitSeconds: 600,
      origin: 'ORIGINAL_AUTHORED',
      status: 'DRAFT',
      examModule: 'GENERAL_TRAINING',
      version: 1,
      questionsJson: [
        {
          question_id: 'Q-DRAFT-01',
          question_type: 'SHORT_ANSWER',
          skill: 'LISTENING',
          prompt: 'Test prompt',
          correct_answers: ['ans'],
          max_words: 3,
          explanation_id: 'exp',
        },
      ],
      questionCount: 1,
    });

    const res = await call(banksRoute, 'GET', '/api/v1/banks', { cookie });

    expect(res.status).toBe(200);
    const data = res.json.data;
    // Bank DRAFT tidak boleh muncul
    expect(data.some((b: any) => b.bank_code === 'GT-LIS-S1-DRAFT')).toBe(false);
  });

  it('AC-A9: DTO attempt memuat listening.note bila ada aset beraudio', async () => {
    const db = getDb();
    const { user, cookie } = await learnerSession();

    // Pastikan ada source
    let source = (await db.select().from(contentSources).limit(1))[0];
    if (!source) {
      const [newSource] = await db
        .insert(contentSources)
        .values({
          code: 'OWN_TEST',
          name: 'Own Test Source',
          licenseType: 'OWN',
          mayStoreCopy: true,
        })
        .returning();
      source = newSource!;
    }

    // Pastikan ada aset listening dengan attribution_text
    const [asset] = await db
      .insert(contentAssets)
      .values({
        assetCode: 'gt-listening/test-note-asset',
        kind: 'AUDIO_LISTENING',
        title: 'Test Audio with Note',
        sourceId: source.id,
        rightsStatus: 'OWN_ORIGINAL',
        storageBackend: 'FILESYSTEM',
        storageKey: 'audio/test.mp3',
        mimeType: 'audio/mpeg',
        durationSec: 180,
        sizeBytes: 1024,
        sha256: 'sha256_dummy_note_test',
        attributionText: 'Audio dibuat dengan suara sintetis.',
      })
      .returning();

    // Buat set ujian listening
    const [set] = await db
      .insert(assessmentSets)
      .values({
        assessmentType: 'QUESTION_BANK',
        bankCode: 'GT-LIS-S1-NOTE',
        bankKind: 'LISTENING_GT_S1',
        title: 'Listening With Note',
        skillCategory: 'LISTENING',
        timeLimitSeconds: 600,
        origin: 'ORIGINAL_AUTHORED',
        status: 'PUBLISHED',
        examModule: 'GENERAL_TRAINING',
        listeningAssetId: asset.id,
        version: 1,
        questionsJson: [
          {
            question_id: 'Q-NOTE-01',
            question_type: 'SHORT_ANSWER',
            skill: 'LISTENING',
            prompt: 'Test prompt',
            correct_answers: ['colour', 'color'],
            max_words: 3,
            explanation_id: 'exp',
          },
        ],
        questionCount: 1,
      })
      .returning();

    // Buat attempt langsung di database
    const [attempt] = await db
      .insert(attempts)
      .values({
        userId: user.id,
        assessmentSetId: set.id,
        assessmentType: 'QUESTION_BANK',
        assessmentVersion: 1,
        mode: 'PRACTICE',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        state: {
          v: 1,
          order: ['Q-NOTE-01'],
          last_resume_at: new Date().toISOString(),
          pass_percent: null,
          served: {
            'Q-NOTE-01': {
              question_id: 'Q-NOTE-01',
              question_type: 'SHORT_ANSWER',
            },
          },
        },
      })
      .returning();

    const res = await call(attemptGetRoute, 'GET', `/api/v1/attempts/${attempt.id}`, {
      params: { attempt_id: attempt.id },
      cookie,
    });

    expect(res.status).toBe(200);
    expect(res.json.data.listening).toBeDefined();
    expect(res.json.data.listening.note).toBe('Audio dibuat dengan suara sintetis.');
  });
});
