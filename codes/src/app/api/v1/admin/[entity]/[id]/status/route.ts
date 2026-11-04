import { z } from 'zod';
import { ChangeStatusRequestSchema, CurationEntity } from '@/contracts/curation';
import { Uuid } from '@/contracts/common';
import { getDb } from '@/server/db';
import { changeStatus } from '@/server/curation/service';
import { ApiError } from '@/server/http/errors';
import { withApi } from '@/server/http/withApi';

export const dynamic = 'force-dynamic';

/** `entity` di luar modules | sub-modules | assessment-sets (mis. `tiers`) -> 404 NOT_FOUND, bukan 400. */
export const POST = withApi(
  { auth: 'admin', params: z.object({ entity: z.string(), id: z.string() }), body: ChangeStatusRequestSchema },
  async ({ user, ipHash, params, body }) => {
    const entity = CurationEntity.safeParse(params.entity);
    if (!entity.success) throw new ApiError('NOT_FOUND');
    const id = Uuid.safeParse(params.id);
    if (!id.success) throw new ApiError('NOT_FOUND');
    return { data: await changeStatus(getDb(), { id: user!.id, ipHash }, entity.data, id.data, body) };
  },
);
