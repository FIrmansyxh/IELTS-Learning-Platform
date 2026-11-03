import { UpdateProfileRequestSchema } from '@/contracts/auth';
import { withApi } from '@/server/http/withApi';
import { updateProfile } from '@/server/auth/service';
import { toUserDTO } from '@/server/auth/guards';

export const dynamic = 'force-dynamic';

export const PATCH = withApi({ auth: 'user', body: UpdateProfileRequestSchema }, async ({ user, body }) => {
  const updated = await updateProfile(user!.id, body);
  return { data: { user: toUserDTO(updated) } };
});
