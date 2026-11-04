import type { Tx } from '../db';
import type { ScoreFlags } from './scoring';

/** Konteks hook setelah evaluasi tersimpan (AI maupun penilaian sendiri). SPEC-017 mendaftar `skillScoreEvaluationHook` di sini. */
export interface EvaluationGradedContext {
  tx: Tx;
  userId: string;
  submissionId: string;
  kind: string;
  subModuleId: string | null;
  evaluationId: string;
  method: 'AI_LOCAL' | 'SELF_ASSESSMENT';
  overallBand: number;
  flags: ScoreFlags;
}
export type EvaluationGradedHook = (ctx: EvaluationGradedContext) => Promise<void>;

/** Registri hook (_api-contract.md bagian 7). Dijalankan dalam transaksi penyimpanan; kegagalan membatalkan penyimpanan. */
export const evaluationGradedHooks: EvaluationGradedHook[] = [];

export async function runEvaluationGradedHooks(ctx: EvaluationGradedContext): Promise<void> {
  for (const hook of evaluationGradedHooks) await hook(ctx);
}
