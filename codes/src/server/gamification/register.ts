/** Pendaftaran hook SPEC-016 (side-effect; diimpor lewat `hooks-register.ts`). */
import { activityHooks } from '../activity/hooks';
import { attemptCompletedHooks } from '../attempts/hooks';
import { userCreatedHooks } from '../auth/hooks';
import { activityHook, createStatsRow, gamificationHook } from './service';

const onUserCreated: Parameters<typeof userCreatedHooks.push>[0] = (tx, user) => createStatsRow(tx, user.id);

if (!userCreatedHooks.includes(onUserCreated)) userCreatedHooks.push(onUserCreated);
if (!activityHooks.includes(activityHook)) activityHooks.push(activityHook);
// Urutan tetap (_api-contract.md bagian 7): gamificationHook lebih dulu dari skillScoreHook (SPEC-017).
if (!attemptCompletedHooks.includes(gamificationHook)) attemptCompletedHooks.push(gamificationHook);
