import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

/** Ganti profil: hapus cookie sesi. Selalu berhasil (idempoten). */
export const POST = withApi({ auth: 'public' }, async ({ clearCookie }) => {
  clearCookie();
  return { status: 204 };
});
