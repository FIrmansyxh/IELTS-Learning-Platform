import { z } from 'zod';
import { Uuid } from '@/contracts/common';
import { DeleteProfileRequestSchema } from '@/contracts/profiles';
import { deleteProfile } from '@/server/auth/profiles';
import { readSession } from '@/server/auth/session';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

/** Hapus profil + seluruh progresnya. Wajib `confirm_name` sama dengan nama profil. */
export const DELETE = withApi(
  { auth: 'public', params: z.object({ profile_id: Uuid }), body: DeleteProfileRequestSchema },
  async ({ req, params, body, ipHash, clearCookie }) => {
    await deleteProfile(params.profile_id, body.confirm_name, ipHash);
    // Bila profil yang dihapus sedang aktif, batalkan sesinya.
    const { claims } = await readSession(req.headers.get('cookie'));
    if (claims?.uid === params.profile_id) clearCookie();
    return { status: 204 };
  },
);
