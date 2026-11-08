import { ApiError } from '../http/errors';
import { logger } from '../logger';
import type { AttemptRow, SetRow } from '../attempts/dto';
import type { MockQuestionState, MockTestState, SimulationSection } from '@/contracts/simulation';
import type { Question } from '@/contracts/content';

export function isMockTestAttempt(a: Pick<AttemptRow, 'assessmentType'>): boolean {
  return a.assessmentType === 'MOCK_TEST';
}

export function mockStateOf(a: AttemptRow): MockTestState {
  const s = a.state as unknown as MockTestState | null;
  if (!s || s.schema !== 'mock.v1' || !Array.isArray(s.sections)) {
    logger.error({ attemptId: a.id }, 'mock_state_invalid');
    throw new ApiError('INTERNAL_ERROR');
  }
  return s;
}

export function mockQuestions(state: MockTestState): Map<string, Question> {
  const map = new Map<string, Question>();
  for (const sec of state.sections) {
    for (const q of sec.questions) {
      map.set(q.question_id, q.question as unknown as Question);
    }
  }
  return map;
}

export function mockQuestionEntries(
  state: MockTestState,
): Map<string, MockQuestionState & { section: SimulationSection }> {
  const map = new Map<string, MockQuestionState & { section: SimulationSection }>();
  for (const sec of state.sections) {
    for (const q of sec.questions) {
      map.set(q.question_id, { ...q, section: sec.section });
    }
  }
  return map;
}

export function mockSectionOfQuestion(
  state: MockTestState,
  questionId: string,
): SimulationSection | null {
  for (const sec of state.sections) {
    if (sec.questions.some((q) => q.question_id === questionId)) {
      return sec.section;
    }
  }
  return null;
}

export function virtualSetForMock(a: AttemptRow): SetRow {
  const state = mockStateOf(a);
  const allQuestions = state.sections.flatMap((s) => s.questions.map((q) => q.question));
  return {
    id: a.id,
    assessmentType: a.assessmentType,
    title: 'Simulasi tes',
    subModuleId: null,
    moduleId: null,
    tierId: null,
    parentSetId: null,
    skillCategory: null,
    timeLimitSeconds: 0,
    readingPassageMarkdown: null,
    listeningAssetId: null,
    questionsJson: allQuestions,
    questionCount: allQuestions.length,
    passPercent: null,
    origin: 'ORIGINAL_AUTHORED',
    sourceId: null,
    attributionText: null,
    status: 'PUBLISHED',
    reviewedBy: null,
    reviewedAt: null,
    version: 0,
    contentHash: null,
    bankCode: null,
    bankKind: null,
    examModule: 'GENERAL_TRAINING',
    tags: [],
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
