/** Pendaftaran hook SPEC-017 (side-effect; diimpor lewat `hooks-register.ts`). */
import { evaluationGradedHooks } from '../ai/hooks';
import { attemptCompletedHooks } from '../attempts/hooks';
import { skillScoreEvaluationHook, skillScoreHook } from './service';

// Urutan tetap (_api-contract.md bagian 7): skillScoreHook SESUDAH gamificationHook (SPEC-016).
if (!attemptCompletedHooks.includes(skillScoreHook)) attemptCompletedHooks.push(skillScoreHook);
if (!evaluationGradedHooks.includes(skillScoreEvaluationHook)) evaluationGradedHooks.push(skillScoreEvaluationHook);
