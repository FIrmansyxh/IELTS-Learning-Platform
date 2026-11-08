import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import {
  aiEvaluations,
  attemptAnswers,
  attempts,
  attemptSections,
  submissions,
} from '@/db/schema';
import type { Db, DbOrTx, Tx } from '../db';
import { ApiError, notFound } from '../http/errors';
import { logger } from '../logger';
import {
  assembleSimulation,
  checkSimulationOptions,
  sortSimulationSections,
} from './assemble';
import {
  computeOverall,
  computeSpeakingBand,
  computeWritingBand,
} from './scoring';
import { mockStateOf, virtualSetForMock } from './state';
import type {
  CreateSimulationResponse,
  SimulationOptionsResponse,
  SimulationPart,
  SimulationSection,
  SimulationSectionDetailResponse,
  SimulationSectionResult,
  SimulationSectionState,
  SimulationStateResponse,
  SubmitSectionResponse,
  SimulationResultResponse,
} from '@/contracts/simulation';
import type { Question } from '@/contracts/content';
import { toPublicQuestion } from '../attempts/engine';
import { getActiveTable } from '../band/service';
import { convertRawToBand, scaleToForty } from '../band/convert';
import { attemptCompletedHooks } from '../attempts/hooks';
import type { AssessmentTypeHandler } from '../attempts/handlers';
import { assessmentTypeHandlers } from '../attempts/handlers';
import { evaluationGradedHooks, type EvaluationGradedContext } from '../ai/hooks';

export const mockTestHandler: AssessmentTypeHandler = {
  async start() {
    throw new ApiError('ASSESSMENT_TYPE_NOT_ENABLED');
  },
  async onFinish() {
    return { progress: null };
  },
};

assessmentTypeHandlers.MOCK_TEST = mockTestHandler;

export class SimulationService {
  async getOptions(db: DbOrTx, userId: string): Promise<SimulationOptionsResponse['data']> {
    return checkSimulationOptions(db, userId);
  }

  async createSimulation(
    db: Db,
    userId: string,
    sections: SimulationSection[],
  ): Promise<CreateSimulationResponse['data']> {
    return db.transaction(async (tx) => {
      // 1. Cek apakah ada attempt MOCK_TEST yang sedang IN_PROGRESS
      const [existing] = await tx
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

      if (existing) {
        throw new ApiError('SIMULATION_IN_PROGRESS', {
          details: [
            {
              path: 'attempt_id',
              code: 'existing_attempt',
              message: existing.id,
            },
          ],
        });
      }

      // 2. Rakit soal (D3)
      const { state } = await assembleSimulation(tx, userId, sections);
      const ordered = sortSimulationSections(sections);

      // 3. Insert baris attempt MOCK_TEST
      const [attempt] = await tx
        .insert(attempts)
        .values({
          userId,
          assessmentType: 'MOCK_TEST',
          assessmentSetId: null,
          assessmentVersion: 0,
          mode: 'EXAM',
          status: 'IN_PROGRESS',
          pointsAwarded: 0,
          state,
        })
        .returning();

      if (!attempt) throw new ApiError('INTERNAL_ERROR');

      // 4. Insert baris attempt_sections
      const createdSections: CreateSimulationResponse['data']['sections'] = [];
      for (let i = 0; i < ordered.length; i++) {
        const secName = ordered[i]!;
        const secState = state.sections.find((s) => s.section === secName)!;
        await tx.insert(attemptSections).values({
          attemptId: attempt.id,
          assessmentSetId: null,
          skill: secName,
          status: 'IN_PROGRESS',
          timeLimitSeconds: secState.time_limit_seconds,
          startedAt: null,
          deadlineAt: null,
          submittedAt: null,
        });

        createdSections.push({
          section: secName,
          order: i + 1,
          status: 'NOT_STARTED',
          time_limit_seconds: secState.time_limit_seconds,
          question_count: secState.questions.length,
        });
      }

      return {
        attempt_id: attempt.id,
        status: 'IN_PROGRESS',
        mode: 'EXAM',
        sections: createdSections,
      };
    });
  }

  async getSimulation(db: Db, userId: string, attemptId: string): Promise<SimulationStateResponse['data']> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const attempt = await this.loadMockAttempt(tx, userId, attemptId);
      const state = mockStateOf(attempt);

      // Evaluasi batas waktu malas (lazy expiration)
      await this.processLazyExpirations(tx, attempt, now);

      const secRows = await tx
        .select()
        .from(attemptSections)
        .where(eq(attemptSections.attemptId, attempt.id));

      const secMap = new Map(secRows.map((r) => [r.skill as SimulationSection, r]));

      const sectionsDTO: SimulationSectionState[] = [];
      let activeSection: SimulationSection | null = null;

      for (const s of state.sections) {
        const row = secMap.get(s.section);
        const started = row?.startedAt ?? null;
        const deadline = row?.deadlineAt ?? null;
        const submitted = row?.submittedAt ?? null;

        let status: SimulationSectionState['status'] = 'NOT_STARTED';
        let remainingSeconds: number | null = null;
        const autoSubmitted = Boolean(row?.status === 'EXPIRED' || (submitted && deadline && submitted >= deadline));

        if (row) {
          if (row.status === 'GRADED') status = 'GRADED';
          else if (row.status === 'AWAITING_GRADING') status = 'AWAITING_GRADING';
          else if (submitted) status = 'AWAITING_GRADING';
          else if (started) {
            status = 'IN_PROGRESS';
            if (!activeSection) activeSection = s.section;
            if (deadline) {
              const diffSec = Math.max(0, Math.floor((new Date(deadline).getTime() - now.getTime()) / 1000));
              remainingSeconds = diffSec;
            }
          }
        }

        const qIds = s.questions.map((q) => q.question_id);
        const [ansCount] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(attemptAnswers)
          .where(
            and(
              eq(attemptAnswers.attemptId, attempt.id),
              inArray(attemptAnswers.questionId, qIds.length > 0 ? qIds : ['__none__']),
            ),
          );

        sectionsDTO.push({
          section: s.section,
          order: s.order,
          status,
          time_limit_seconds: s.time_limit_seconds,
          started_at: started ? new Date(started).toISOString() : null,
          deadline_at: deadline ? new Date(deadline).toISOString() : null,
          submitted_at: submitted ? new Date(submitted).toISOString() : null,
          remaining_seconds: remainingSeconds,
          auto_submitted: autoSubmitted,
          answered_count: ansCount?.count ?? 0,
          question_count: s.questions.length,
        });
      }

      return {
        attempt_id: attempt.id,
        status: attempt.status as SimulationStateResponse['data']['status'],
        server_now: now.toISOString(),
        sections: sectionsDTO,
        active_section: activeSection,
      };
    });
  }

  async getSectionDetail(
    db: Db,
    userId: string,
    attemptId: string,
    section: SimulationSection,
  ): Promise<SimulationSectionDetailResponse['data']> {
    return db.transaction(async (tx) => {
      return this.getSectionDetailInternal(tx, userId, attemptId, section);
    });
  }

  private async getSectionDetailInternal(
    tx: Tx,
    userId: string,
    attemptId: string,
    section: SimulationSection,
  ): Promise<SimulationSectionDetailResponse['data']> {
    const now = new Date();
    const attempt = await this.loadMockAttempt(tx, userId, attemptId);
    const state = mockStateOf(attempt);

    const secConfig = state.sections.find((s) => s.section === section);
    if (!secConfig) throw notFound();

    await this.processLazyExpirations(tx, attempt, now);

    const [secRow] = await tx
      .select()
      .from(attemptSections)
      .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.skill, section)))
      .limit(1);

    if (!secRow || !secRow.startedAt) {
      throw new ApiError('SECTION_NOT_ACTIVE');
    }

    let remainingSeconds: number | null = null;
    let status: SimulationSectionDetailResponse['data']['status'] = 'IN_PROGRESS';
    if (secRow.status === 'GRADED') status = 'GRADED';
    else if (secRow.status === 'AWAITING_GRADING' || secRow.submittedAt) status = 'AWAITING_GRADING';
    else {
      status = 'IN_PROGRESS';
      if (secRow.deadlineAt) {
        remainingSeconds = Math.max(0, Math.floor((new Date(secRow.deadlineAt).getTime() - now.getTime()) / 1000));
      }
    }

    // Ambil parts
    const parts: SimulationPart[] = secConfig.parts.map((p) => {
      const partQIds = secConfig.questions
        .filter((q) => q.part_no === p.part_no)
        .map((q) => q.question_id);

      let listening: SimulationPart['listening'] = null;
      if (p.listening_asset_id) {
        listening = {
          audio_url: `/api/v1/assets/${p.listening_asset_id}/file`,
          mime_type: 'audio/mpeg',
          duration_sec: p.audio_duration_sec ?? 0,
          note: p.attribution_text ?? null,
        };
      }

      return {
        part_no: p.part_no,
        passage_markdown: p.passage_markdown ?? null,
        listening,
        question_ids: partQIds,
      };
    });

    // Ambil questions tanpa kunci/penjelasan
    const publicQuestions = secConfig.questions.map((q) => {
      const rawQ = q.question as unknown as Question;
      let served: Record<string, unknown> = {};
      if (rawQ.question_type === 'MCQ_SINGLE' || rawQ.question_type === 'MCQ_MULTI') {
        const rawOpts = 'options' in rawQ ? (rawQ as { options?: string[] }).options : undefined;
        if (Array.isArray(rawOpts)) {
          const ordered = q.option_order && q.option_order.length === rawOpts.length
            ? q.option_order
            : rawOpts;
          const origIdx = ordered.map((o) => rawOpts.indexOf(o));
          const optIds = ordered.map((_, i) => `o${i}`);
          served = {
            option_orig_index: origIdx,
            option_ids: optIds,
          };
        }
      }
      const pub = toPublicQuestion(rawQ, served);
      return pub;
    });

    // Ambil jawaban objektif tersimpan
    const allQIds = secConfig.questions.map((q) => q.question_id);
    const answersRows = allQIds.length
      ? await tx
          .select({ questionId: attemptAnswers.questionId, response: attemptAnswers.response })
          .from(attemptAnswers)
          .where(
            and(
              eq(attemptAnswers.attemptId, attempt.id),
              inArray(attemptAnswers.questionId, allQIds),
            ),
          )
      : [];

    const answers = answersRows.map((a) => ({
      question_id: a.questionId,
      response: (a.response as Record<string, unknown>) ?? {},
    }));

    // Ambil submissions untuk writing/speaking
    const subsRows = allQIds.length
      ? await tx
          .select({
            questionId: submissions.questionId,
            kind: submissions.kind,
            submissionId: submissions.id,
            status: submissions.status,
          })
          .from(submissions)
          .where(
            and(
              eq(submissions.attemptId, attempt.id),
              inArray(submissions.questionId, allQIds),
              ne(submissions.status, 'FAILED'),
            ),
          )
      : [];

    const subList = subsRows.map((s) => ({
      question_id: s.questionId!,
      kind: s.kind,
      submission_id: s.submissionId,
      status: s.status,
    }));

    return {
      section,
      status,
      remaining_seconds: remainingSeconds,
      server_now: now.toISOString(),
      parts,
      questions: publicQuestions,
      answers,
      submissions: subList,
    };
  }

  async startSection(
    db: Db,
    userId: string,
    attemptId: string,
    section: SimulationSection,
  ): Promise<SimulationSectionDetailResponse['data']> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const attempt = await this.loadMockAttempt(tx, userId, attemptId);
      const state = mockStateOf(attempt);

      if (attempt.status === 'ABANDONED') {
        throw new ApiError('ATTEMPT_NOT_ACTIVE');
      }

      const secConfig = state.sections.find((s) => s.section === section);
      if (!secConfig) throw notFound();

      const secRows = await tx
        .select()
        .from(attemptSections)
        .where(eq(attemptSections.attemptId, attempt.id));

      const secMap = new Map(secRows.map((r) => [r.skill as SimulationSection, r]));
      const currentSec = secMap.get(section);
      if (!currentSec) throw notFound();

      // Cek apakah section sudah selesai
      if (currentSec.submittedAt || currentSec.status === 'GRADED' || currentSec.status === 'AWAITING_GRADING') {
        throw new ApiError('SECTION_ALREADY_DONE');
      }

      // Idempoten jika sudah start
      if (currentSec.startedAt) {
        if (currentSec.deadlineAt && now.getTime() > new Date(currentSec.deadlineAt).getTime()) {
          throw new ApiError('SECTION_EXPIRED');
        }
        return this.getSectionDetailInternal(tx, userId, attemptId, section);
      }

      // Validasi urutan D2: LISTENING -> READING -> WRITING
      if (section !== 'SPEAKING') {
        const orderIndex = state.sections.findIndex((s) => s.section === section);
        for (let i = 0; i < orderIndex; i++) {
          const prevSec = state.sections[i]!;
          if (prevSec.section === 'SPEAKING') continue;
          const prevRow = secMap.get(prevSec.section);
          if (!prevRow || !prevRow.submittedAt) {
            throw new ApiError('SECTION_ORDER_VIOLATION');
          }
        }
      }

      // Set started_at & deadline_at
      const startedAt = now;
      let deadlineAt: Date | null = null;
      if (secConfig.time_limit_seconds) {
        deadlineAt = new Date(startedAt.getTime() + secConfig.time_limit_seconds * 1000);
      }

      await tx
        .update(attemptSections)
        .set({
          startedAt,
          deadlineAt,
        })
        .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.skill, section)));

      return this.getSectionDetailInternal(tx, userId, attemptId, section);
    });
  }

  async submitSection(
    db: Db,
    userId: string,
    attemptId: string,
    section: SimulationSection,
  ): Promise<SubmitSectionResponse['data']> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const attempt = await this.loadMockAttempt(tx, userId, attemptId);
      const state = mockStateOf(attempt);

      if (section === 'SPEAKING') {
        throw new ApiError('SECTION_NOT_SUBMITTABLE');
      }

      if (attempt.status !== 'IN_PROGRESS') {
        throw new ApiError('ATTEMPT_NOT_ACTIVE');
      }

      const [secRow] = await tx
        .select()
        .from(attemptSections)
        .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.skill, section)))
        .limit(1);

      if (!secRow || !secRow.startedAt) {
        throw new ApiError('SECTION_NOT_ACTIVE');
      }

      // Idempoten jika sudah dikirim
      if (secRow.submittedAt) {
        return {
          section,
          status: (secRow.status === 'GRADED' ? 'GRADED' : 'AWAITING_GRADING') as 'AWAITING_GRADING' | 'GRADED',
          band: secRow.bandScore ? Number(secRow.bandScore) : null,
          raw_score: secRow.rawScore ? Number(secRow.rawScore) : null,
          max_score: secRow.maxScore ? Number(secRow.maxScore) : null,
          attempt_status: attempt.status,
        };
      }

      const secConfig = state.sections.find((s) => s.section === section)!;

      if (section === 'LISTENING' || section === 'READING') {
        // Penilaian otomatis
        const allQIds = secConfig.questions.map((q) => q.question_id);
        const answers = await tx
          .select()
          .from(attemptAnswers)
          .where(
            and(
              eq(attemptAnswers.attemptId, attempt.id),
              inArray(attemptAnswers.questionId, allQIds),
            ),
          );

        const answerMap = new Map(answers.map((a) => [a.questionId, a]));
        let raw = 0;
        const max = 40;

        for (const q of secConfig.questions) {
          const a = answerMap.get(q.question_id);
          if (a && a.isCorrect) {
            raw += Number(a.score ?? 1);
          }
        }

        const raw40 = max > 0 ? scaleToForty(raw, max) : 0;
        const skillCategory = section === 'READING' ? 'READING_GENERAL' : 'LISTENING';
        const table = await getActiveTable(tx, skillCategory);
        const band = convertRawToBand(table.rows, raw40);

        await tx
          .update(attemptSections)
          .set({
            status: 'GRADED',
            rawScore: String(raw),
            maxScore: String(max),
            bandScore: String(band),
            submittedAt: now,
          })
          .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.skill, section)));

        // Cek status attempt
        const updatedAttemptStatus = await this.checkAndUpdateAttemptStatus(tx, attempt.id, userId);

        return {
          section,
          status: 'GRADED',
          band,
          raw_score: raw,
          max_score: max,
          attempt_status: updatedAttemptStatus,
        };
      } else if (section === 'WRITING') {
        // Section Writing
        const t1Q = secConfig.questions.find((q) => q.part_no === 1);
        const t2Q = secConfig.questions.find((q) => q.part_no === 2);

        const subs = await tx
          .select({
            id: submissions.id,
            questionId: submissions.questionId,
            status: submissions.status,
          })
          .from(submissions)
          .where(
            and(
              eq(submissions.attemptId, attempt.id),
              inArray(submissions.questionId, [t1Q?.question_id ?? '', t2Q?.question_id ?? '']),
              ne(submissions.status, 'FAILED'),
            ),
          );

        const t1Sub = subs.find((s) => s.questionId === t1Q?.question_id);
        const t2Sub = subs.find((s) => s.questionId === t2Q?.question_id);

        const t1Empty = !t1Sub;
        const t2Empty = !t2Sub;

        // D8: Jika kedua task kosong -> Writing band 0 langsung GRADED tanpa panggilan LLM
        if (t1Empty && t2Empty) {
          await tx
            .update(attemptSections)
            .set({
              status: 'GRADED',
              bandScore: '0',
              submittedAt: now,
            })
            .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.skill, 'WRITING')));

          const updatedAttemptStatus = await this.checkAndUpdateAttemptStatus(tx, attempt.id, userId);

          return {
            section: 'WRITING',
            status: 'GRADED',
            band: 0,
            raw_score: null,
            max_score: null,
            attempt_status: updatedAttemptStatus,
          };
        }

        // Jika salah satu atau keduanya ada submission
        await tx
          .update(attemptSections)
          .set({
            status: 'AWAITING_GRADING',
            submittedAt: now,
          })
          .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.skill, 'WRITING')));

        // Periksa apakah evaluasi sudah selesai untuk task yang ada
        await this.checkWritingCompletion(tx, attempt.id);

        const [reloadedSec] = await tx
          .select()
          .from(attemptSections)
          .where(and(eq(attemptSections.attemptId, attempt.id), eq(attemptSections.skill, 'WRITING')))
          .limit(1);

        const isGraded = reloadedSec?.status === 'GRADED';
        const updatedAttemptStatus = await this.checkAndUpdateAttemptStatus(tx, attempt.id, userId);

        return {
          section: 'WRITING',
          status: isGraded ? 'GRADED' : 'AWAITING_GRADING',
          band: reloadedSec?.bandScore ? Number(reloadedSec.bandScore) : null,
          raw_score: null,
          max_score: null,
          attempt_status: updatedAttemptStatus,
        };
      }

      throw new ApiError('INTERNAL_ERROR');
    });
  }

  async abandonSimulation(db: Db, userId: string, attemptId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const attempt = await this.loadMockAttempt(tx, userId, attemptId);
      if (attempt.status === 'GRADED' || attempt.status === 'ABANDONED') {
        throw new ApiError('ATTEMPT_NOT_ACTIVE');
      }

      await tx
        .update(attempts)
        .set({
          status: 'ABANDONED',
          updatedAt: new Date(),
        })
        .where(eq(attempts.id, attempt.id));
    });
  }

  async getResult(db: Db, userId: string, attemptId: string): Promise<SimulationResultResponse['data']> {
    return db.transaction(async (tx) => {
      const attempt = await this.loadMockAttempt(tx, userId, attemptId);
      const state = mockStateOf(attempt);

      const secRows = await tx
        .select()
        .from(attemptSections)
        .where(eq(attemptSections.attemptId, attempt.id));

      const secMap = new Map(secRows.map((r) => [r.skill as SimulationSection, r]));
      const selectedSections = state.sections.map((s) => s.section);

      const sectionResults: SimulationSectionResult[] = [];

      for (const s of state.sections) {
        const row = secMap.get(s.section);
        const status = (row?.status ?? 'NOT_STARTED') as SimulationSectionResult['status'];
        const band = row?.bandScore ? Number(row?.bandScore) : null;
        const rawScore = row?.rawScore ? Number(row?.rawScore) : null;
        const maxScore = row?.maxScore ? Number(row?.maxScore) : null;

        let verified: boolean | null = null;
        let detail: SimulationSectionResult['detail'] = null;

        if (s.section === 'WRITING') {
          const t1Q = s.questions.find((q) => q.part_no === 1);
          const t2Q = s.questions.find((q) => q.part_no === 2);

          const subs = await tx
            .select({
              questionId: submissions.questionId,
              status: submissions.status,
              id: submissions.id,
            })
            .from(submissions)
            .where(
              and(
                eq(submissions.attemptId, attempt.id),
                inArray(submissions.questionId, [t1Q?.question_id ?? '', t2Q?.question_id ?? '']),
              ),
            );

          const t1Sub = subs.find((sub) => sub.questionId === t1Q?.question_id);
          const t2Sub = subs.find((sub) => sub.questionId === t2Q?.question_id);

          let t1Band = t1Sub ? 0 : 0;
          let t2Band = t2Sub ? 0 : 0;
          let hasSelfAssessed = false;

          if (t1Sub) {
            const [eval1] = await tx
              .select({ overallBand: aiEvaluations.overallBand, method: aiEvaluations.method })
              .from(aiEvaluations)
              .where(eq(aiEvaluations.submissionId, t1Sub.id))
              .orderBy(desc(aiEvaluations.runNumber))
              .limit(1);
            if (eval1) {
              t1Band = Number(eval1.overallBand);
              if (eval1.method === 'SELF_ASSESSMENT') hasSelfAssessed = true;
            }
          }

          if (t2Sub) {
            const [eval2] = await tx
              .select({ overallBand: aiEvaluations.overallBand, method: aiEvaluations.method })
              .from(aiEvaluations)
              .where(eq(aiEvaluations.submissionId, t2Sub.id))
              .orderBy(desc(aiEvaluations.runNumber))
              .limit(1);
            if (eval2) {
              t2Band = Number(eval2.overallBand);
              if (eval2.method === 'SELF_ASSESSMENT') hasSelfAssessed = true;
            }
          }

          detail = {
            task1_band: t1Band,
            task2_band: t2Band,
          };

          verified = status === 'GRADED' ? !hasSelfAssessed : null;
        } else if (s.section === 'SPEAKING') {
          const p1Q = s.questions.filter((q) => q.part_no === 1).map((q) => q.question_id);
          const p2Q = s.questions.filter((q) => q.part_no === 2).map((q) => q.question_id);
          const p3Q = s.questions.filter((q) => q.part_no === 3).map((q) => q.question_id);

          const subs = await tx
            .select({
              questionId: submissions.questionId,
              id: submissions.id,
            })
            .from(submissions)
            .where(
              and(
                eq(submissions.attemptId, attempt.id),
                inArray(submissions.questionId, [...p1Q, ...p2Q, ...p3Q]),
              ),
            );

          let p1Band: number | null = null;
          let p2Band: number | null = null;
          let p3Band: number | null = null;

          const p1Sub = subs.find((sub) => p1Q.includes(sub.questionId!));
          if (p1Sub) {
            const [ev] = await tx
              .select({ overallBand: aiEvaluations.overallBand })
              .from(aiEvaluations)
              .where(eq(aiEvaluations.submissionId, p1Sub.id))
              .limit(1);
            if (ev) p1Band = Number(ev.overallBand);
          }

          const p2Sub = subs.find((sub) => p2Q.includes(sub.questionId!));
          if (p2Sub) {
            const [ev] = await tx
              .select({ overallBand: aiEvaluations.overallBand })
              .from(aiEvaluations)
              .where(eq(aiEvaluations.submissionId, p2Sub.id))
              .limit(1);
            if (ev) p2Band = Number(ev.overallBand);
          }

          const p3Sub = subs.find((sub) => p3Q.includes(sub.questionId!));
          if (p3Sub) {
            const [ev] = await tx
              .select({ overallBand: aiEvaluations.overallBand })
              .from(aiEvaluations)
              .where(eq(aiEvaluations.submissionId, p3Sub.id))
              .limit(1);
            if (ev) p3Band = Number(ev.overallBand);
          }

          detail = {
            part1_band: p1Band,
            part2_band: p2Band,
            part3_band: p3Band,
          };
        }

        sectionResults.push({
          section: s.section,
          status,
          band,
          raw_score: rawScore,
          max_score: maxScore,
          verified,
          detail,
        });
      }

      const overall = computeOverall(selectedSections, sectionResults);

      return {
        attempt_id: attempt.id,
        status: attempt.status as SimulationResultResponse['data']['status'],
        selected_sections: selectedSections,
        sections: sectionResults,
        overall,
        disclaimer: 'Perkiraan latihan, bukan skor resmi IELTS.',
      };
    });
  }

  /**
   * Hook evaluasi AI untuk simulasi.
   */
  async onEvaluationGraded(
    tx: Tx,
    userId: string,
    attemptId: string,
    _submissionId: string,
  ): Promise<void> {
    const [attempt] = await tx
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
      .limit(1);

    if (!attempt || attempt.assessmentType !== 'MOCK_TEST') return;

    await this.checkWritingCompletion(tx, attempt.id);
    await this.checkSpeakingCompletion(tx, attempt.id);
    await this.checkAndUpdateAttemptStatus(tx, attempt.id, userId);
  }

  private async checkWritingCompletion(tx: Tx, attemptId: string): Promise<void> {
    const [wSec] = await tx
      .select()
      .from(attemptSections)
      .where(and(eq(attemptSections.attemptId, attemptId), eq(attemptSections.skill, 'WRITING')))
      .limit(1);

    if (!wSec || wSec.status === 'GRADED') return;

    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
    if (!attempt) return;
    const state = mockStateOf(attempt);
    const secConfig = state.sections.find((s) => s.section === 'WRITING');
    if (!secConfig) return;

    const t1Q = secConfig.questions.find((q) => q.part_no === 1);
    const t2Q = secConfig.questions.find((q) => q.part_no === 2);

    const subs = await tx
      .select({
        questionId: submissions.questionId,
        id: submissions.id,
        status: submissions.status,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.attemptId, attemptId),
          inArray(submissions.questionId, [t1Q?.question_id ?? '', t2Q?.question_id ?? '']),
        ),
      );

    const t1Sub = subs.find((s) => s.questionId === t1Q?.question_id);
    const t2Sub = subs.find((s) => s.questionId === t2Q?.question_id);

    let t1Band: number | null = t1Sub ? null : 0;
    let t2Band: number | null = t2Sub ? null : 0;

    if (t1Sub && t1Sub.status === 'GRADED') {
      const [ev] = await tx
        .select({ overallBand: aiEvaluations.overallBand })
        .from(aiEvaluations)
        .where(eq(aiEvaluations.submissionId, t1Sub.id))
        .orderBy(desc(aiEvaluations.runNumber))
        .limit(1);
      if (ev) t1Band = Number(ev.overallBand);
    }

    if (t2Sub && t2Sub.status === 'GRADED') {
      const [ev] = await tx
        .select({ overallBand: aiEvaluations.overallBand })
        .from(aiEvaluations)
        .where(eq(aiEvaluations.submissionId, t2Sub.id))
        .orderBy(desc(aiEvaluations.runNumber))
        .limit(1);
      if (ev) t2Band = Number(ev.overallBand);
    }

    if (t1Band !== null && t2Band !== null && wSec.submittedAt) {
      const writingBand = computeWritingBand(t1Band, t2Band);
      await tx
        .update(attemptSections)
        .set({
          status: 'GRADED',
          bandScore: String(writingBand),
        })
        .where(and(eq(attemptSections.attemptId, attemptId), eq(attemptSections.skill, 'WRITING')));
    }
  }

  private async checkSpeakingCompletion(tx: Tx, attemptId: string): Promise<void> {
    const [spkSec] = await tx
      .select()
      .from(attemptSections)
      .where(and(eq(attemptSections.attemptId, attemptId), eq(attemptSections.skill, 'SPEAKING')))
      .limit(1);

    if (!spkSec || spkSec.status === 'GRADED') return;

    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
    if (!attempt) return;
    const state = mockStateOf(attempt);
    const secConfig = state.sections.find((s) => s.section === 'SPEAKING');
    if (!secConfig) return;

    const p1Q = secConfig.questions.filter((q) => q.part_no === 1).map((q) => q.question_id);
    const p2Q = secConfig.questions.filter((q) => q.part_no === 2).map((q) => q.question_id);
    const p3Q = secConfig.questions.filter((q) => q.part_no === 3).map((q) => q.question_id);

    const subs = await tx
      .select({
        questionId: submissions.questionId,
        id: submissions.id,
        status: submissions.status,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.attemptId, attemptId),
          inArray(submissions.questionId, [...p1Q, ...p2Q, ...p3Q]),
          eq(submissions.status, 'GRADED'),
        ),
      );

    let p1Band: number | null = null;
    let p2Band: number | null = null;
    let p3Band: number | null = null;

    const p1Sub = subs.find((s) => p1Q.includes(s.questionId!));
    if (p1Sub) {
      const [ev] = await tx
        .select({ overallBand: aiEvaluations.overallBand })
        .from(aiEvaluations)
        .where(eq(aiEvaluations.submissionId, p1Sub.id))
        .limit(1);
      if (ev) p1Band = Number(ev.overallBand);
    }

    const p2Sub = subs.find((s) => p2Q.includes(s.questionId!));
    if (p2Sub) {
      const [ev] = await tx
        .select({ overallBand: aiEvaluations.overallBand })
        .from(aiEvaluations)
        .where(eq(aiEvaluations.submissionId, p2Sub.id))
        .limit(1);
      if (ev) p2Band = Number(ev.overallBand);
    }

    const p3Sub = subs.find((s) => p3Q.includes(s.questionId!));
    if (p3Sub) {
      const [ev] = await tx
        .select({ overallBand: aiEvaluations.overallBand })
        .from(aiEvaluations)
        .where(eq(aiEvaluations.submissionId, p3Sub.id))
        .limit(1);
      if (ev) p3Band = Number(ev.overallBand);
    }

    if (p1Band !== null && p2Band !== null && p3Band !== null) {
      const spkBand = computeSpeakingBand(p1Band, p2Band, p3Band);
      if (spkBand !== null) {
        await tx
          .update(attemptSections)
          .set({
            status: 'GRADED',
            bandScore: String(spkBand),
            submittedAt: spkSec.submittedAt ?? new Date(),
          })
          .where(and(eq(attemptSections.attemptId, attemptId), eq(attemptSections.skill, 'SPEAKING')));
      }
    }
  }

  private async checkAndUpdateAttemptStatus(
    tx: Tx,
    attemptId: string,
    userId: string,
  ): Promise<string> {
    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
    if (!attempt || attempt.status === 'ABANDONED') return attempt?.status ?? 'ABANDONED';

    const secRows = await tx.select().from(attemptSections).where(eq(attemptSections.attemptId, attemptId));
    const nonSpeaking = secRows.filter((s) => s.skill !== 'SPEAKING');
    const hasOnlySpeaking = nonSpeaking.length === 0;

    let targetStatus: string = attempt.status;

    if (hasOnlySpeaking) {
      const spkSec = secRows.find((s) => s.skill === 'SPEAKING');
      if (spkSec?.status === 'GRADED') targetStatus = 'GRADED';
      else targetStatus = 'IN_PROGRESS';
    } else {
      const allNonSpeakingSubmitted = nonSpeaking.every((s) => Boolean(s.submittedAt));
      const allNonSpeakingGraded = nonSpeaking.every((s) => s.status === 'GRADED');
      const anyAwaitingGrading = nonSpeaking.some((s) => s.status === 'AWAITING_GRADING');

      if (allNonSpeakingGraded) {
        targetStatus = 'GRADED';
      } else if (allNonSpeakingSubmitted && anyAwaitingGrading) {
        targetStatus = 'AWAITING_GRADING';
      } else {
        targetStatus = 'IN_PROGRESS';
      }
    }

    // Jika ke-4 section terpilih dan semuanya GRADED, hitung overall band
    let overallBandScore: string | null = attempt.bandScore ? String(attempt.bandScore) : null;
    if (secRows.length === 4 && secRows.every((s) => s.status === 'GRADED' && s.bandScore !== null)) {
      const overall = computeOverall(
        ['LISTENING', 'READING', 'WRITING', 'SPEAKING'],
        secRows.map((s) => ({ section: s.skill as SimulationSection, status: 'GRADED', band: Number(s.bandScore) })),
      );
      if (overall.status === 'COMPLETE' && overall.band !== null) {
        overallBandScore = String(overall.band);
      }
    }

    const wasNotGraded = attempt.status !== 'GRADED';
    if (targetStatus !== attempt.status || overallBandScore !== attempt.bandScore) {
      await tx
        .update(attempts)
        .set({
          status: targetStatus as 'IN_PROGRESS' | 'AWAITING_GRADING' | 'GRADED' | 'ABANDONED',
          bandScore: overallBandScore,
          submittedAt: targetStatus === 'GRADED' && !attempt.submittedAt ? new Date() : attempt.submittedAt,
          updatedAt: new Date(),
        })
        .where(eq(attempts.id, attemptId));
    }

    // Panggil attemptCompletedHooks jika pertama kali menjadi GRADED (D5)
    if (wasNotGraded && targetStatus === 'GRADED') {
      const [reloadedAttempt] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
      if (reloadedAttempt) {
        for (const hook of attemptCompletedHooks) {
          await hook({
            tx,
            userId,
            attempt: reloadedAttempt,
            set: virtualSetForMock(reloadedAttempt),
            result: {
              rawH: 0,
              maxH: 0,
              percentH: 0,
              percentDisplayH: 0,
              passPercent: null,
              passed: null,
              perSkill: [],
            },
          });
        }
      }
    }

    return targetStatus;
  }

  private async processLazyExpirations(tx: Tx, attempt: { id: string; userId: string }, now: Date): Promise<void> {
    const secRows = await tx
      .select()
      .from(attemptSections)
      .where(
        and(
          eq(attemptSections.attemptId, attempt.id),
          eq(attemptSections.status, 'IN_PROGRESS'),
          isNotNull(attemptSections.startedAt),
          isNotNull(attemptSections.deadlineAt),
        ),
      );

    for (const sec of secRows) {
      if (sec.deadlineAt && now.getTime() > new Date(sec.deadlineAt).getTime()) {
        // Auto-submit section yang kedaluwarsa
        logger.info({ attemptId: attempt.id, skill: sec.skill }, 'simulation_section_auto_submitted_due_to_expiry');
        await this.autoSubmitExpiredSection(tx, attempt.id, attempt.userId, sec.skill as SimulationSection, sec.deadlineAt);
      }
    }
  }

  private async autoSubmitExpiredSection(
    tx: Tx,
    attemptId: string,
    userId: string,
    section: SimulationSection,
    deadlineAt: Date,
  ): Promise<void> {
    const [attempt] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
    if (!attempt) return;
    const state = mockStateOf(attempt);
    const secConfig = state.sections.find((s) => s.section === section);
    if (!secConfig) return;

    if (section === 'LISTENING' || section === 'READING') {
      const allQIds = secConfig.questions.map((q) => q.question_id);
      const answers = allQIds.length
        ? await tx
            .select()
            .from(attemptAnswers)
            .where(
              and(
                eq(attemptAnswers.attemptId, attemptId),
                inArray(attemptAnswers.questionId, allQIds),
              ),
            )
        : [];

      const answerMap = new Map(answers.map((a) => [a.questionId, a]));
      let raw = 0;
      const max = 40;

      for (const q of secConfig.questions) {
        const a = answerMap.get(q.question_id);
        if (a && a.isCorrect) raw += Number(a.score ?? 1);
      }

      const raw40 = max > 0 ? scaleToForty(raw, max) : 0;
      const skillCategory = section === 'READING' ? 'READING_GENERAL' : 'LISTENING';
      const table = await getActiveTable(tx, skillCategory);
      const band = convertRawToBand(table.rows, raw40);

      await tx
        .update(attemptSections)
        .set({
          status: 'GRADED',
          rawScore: String(raw),
          maxScore: String(max),
          bandScore: String(band),
          submittedAt: deadlineAt,
        })
        .where(and(eq(attemptSections.attemptId, attemptId), eq(attemptSections.skill, section)));
    } else if (section === 'WRITING') {
      const t1Q = secConfig.questions.find((q) => q.part_no === 1);
      const t2Q = secConfig.questions.find((q) => q.part_no === 2);

      const subs = await tx
        .select({
          id: submissions.id,
          questionId: submissions.questionId,
          status: submissions.status,
        })
        .from(submissions)
        .where(
          and(
            eq(submissions.attemptId, attemptId),
            inArray(submissions.questionId, [t1Q?.question_id ?? '', t2Q?.question_id ?? '']),
          ),
        );

      const t1Sub = subs.find((s) => s.questionId === t1Q?.question_id);
      const t2Sub = subs.find((s) => s.questionId === t2Q?.question_id);

      if (!t1Sub && !t2Sub) {
        await tx
          .update(attemptSections)
          .set({
            status: 'GRADED',
            bandScore: '0',
            submittedAt: deadlineAt,
          })
          .where(and(eq(attemptSections.attemptId, attemptId), eq(attemptSections.skill, 'WRITING')));
      } else {
        await tx
          .update(attemptSections)
          .set({
            status: 'AWAITING_GRADING',
            submittedAt: deadlineAt,
          })
          .where(and(eq(attemptSections.attemptId, attemptId), eq(attemptSections.skill, 'WRITING')));
        await this.checkWritingCompletion(tx, attemptId);
      }
    }

    await this.checkAndUpdateAttemptStatus(tx, attemptId, userId);
  }

  private async loadMockAttempt(tx: Tx, userId: string, attemptId: string) {
    const [attempt] = await tx
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
      .limit(1);

    if (!attempt || attempt.assessmentType !== 'MOCK_TEST') throw notFound();
    return attempt;
  }
}

export const simulationService = new SimulationService();

// Daftarkan ke evaluationGradedHooks
evaluationGradedHooks.push(async (ctx: EvaluationGradedContext) => {
  const [sub] = await ctx.tx
    .select({ attemptId: submissions.attemptId })
    .from(submissions)
    .where(eq(submissions.id, ctx.submissionId))
    .limit(1);

  if (sub?.attemptId) {
    await simulationService.onEvaluationGraded(ctx.tx, ctx.userId, sub.attemptId, ctx.submissionId);
  }
});
