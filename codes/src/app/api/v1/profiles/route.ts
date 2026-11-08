import { CreateProfileRequestSchema, MAX_PROFILES } from '@/contracts/profiles';
import { createProfile, listProfiles } from '@/server/auth/profiles';
import { buildSetCookie, issueSessionToken } from '@/server/auth/session';
import { toUserDTO } from '@/server/auth/guards';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

/** Daftar profil lokal (tanpa sesi: layar pemilih profil). */
export const GET = withApi({ auth: 'public' }, async () => ({
  data: { profiles: await listProfiles(), max_profiles: MAX_PROFILES },
}));

/** Buat profil baru dan langsung memilihnya (menerbitkan cookie sesi). */
export const POST = withApi({ auth: 'public', body: CreateProfileRequestSchema }, async ({ body, ipHash, setCookie }) => {
  const user = await createProfile(body.display_name, ipHash);
  const t = await issueSessionToken({ id: user.id, tokenVersion: user.tokenVersion });
  setCookie(buildSetCookie(t.value, t.maxAge));
  return { status: 201, data: { user: toUserDTO(user) } };
});
