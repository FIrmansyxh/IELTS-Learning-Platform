import type { Tx } from '../db';

export interface EvaluationGradedContext {
  tx: Tx;
  userId: string;
  submissionId: string;
  evaluationId: string;
  kind: 'WRITING' | 'SPEAKING';
}

export type EvaluationGradedHook = (ctx: EvaluationGradedContext) => Promise<void>;

export const evaluationGradedHooks: EvaluationGradedHook[] = [];

