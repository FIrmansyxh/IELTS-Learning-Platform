/** Pendaftaran hook SPEC-013 (side-effect): anonimisasi akun menghapus semua berkas rekaman pengguna. */
import { userAnonymizedHooks } from '../auth/hooks';
import { deleteUserRecordings } from './recordings';

if (!userAnonymizedHooks.includes(deleteRecordingsOnAnonymize)) userAnonymizedHooks.push(deleteRecordingsOnAnonymize);

async function deleteRecordingsOnAnonymize(tx: Parameters<typeof deleteUserRecordings>[0], userId: string) {
  await deleteUserRecordings(tx, userId);
}
