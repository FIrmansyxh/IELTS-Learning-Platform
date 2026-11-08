import { z } from 'zod';
import { Uuid } from '@/contracts/common';
import { selectProfile } from '@/server/auth/profiles';
import { buildSetCookie, issueSessionToken } from '@/server/auth/session';
import { toUserDTO } from '@/server/auth/guards';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

/** Pilih profil: menerbitkan cookie sesi tanpa kredensial (SPEC-025 D2). */
export const POST = withApi(
  { auth: 'public', params: z.object({ profile_id: Uuid }) },
  async ({ params, ipHash, setCookie }) => {
    const user = await selectProfile(params.profile_id, ipHash);
    const t = await issueSessionToken({ id: user.id, role: user.role, tokenVersion: user.tokenVersion });
    setCookie(buildSetCookie(t.value, t.maxAge));
    return { status: 200, data: { user: toUserDTO(user) } };
  },
);
