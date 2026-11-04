/**
 * Titik pendaftaran hook lintas spec. Diimpor (side-effect) oleh service yang memicu hook.
 * Spec lain (016, 013) menambahkan pendaftarannya di sini.
 */
import { initializeProgress } from './gatekeeping/service';
import { userCreatedHooks } from './auth/hooks';
import './ai/register';
import './gamification/register';
import './skills/register';

if (!userCreatedHooks.includes(onUserCreated)) userCreatedHooks.push(onUserCreated);

async function onUserCreated(tx: Parameters<typeof initializeProgress>[0], user: { id: string }) {
  await initializeProgress(tx, user.id);
}
