import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { subModules } from '@/db/schema';
import { getDb } from '@/server/db';
import { withApi } from '@/server/http/withApi';
import { SubModuleCodeParamSchema } from '@/server/player/schemas';
import { assertSubModuleAccessible } from '@/server/gatekeeping/service';
import { setSubModuleStyle } from '@/server/tracks/service';
import { notFound } from '@/server/http/errors';

export const dynamic = 'force-dynamic';

const SetStyleBodySchema = z.strictObject({
  style: z.enum(['LEARN_FIRST', 'PRACTICE_FIRST', 'CASE_BASED']).nullable(),
});

/** PUT /api/v1/sub-modules/{code}/style (SPEC-021): override gaya belajar per sub-modul. */
export const PUT = withApi(
  {
    auth: 'user',
    params: SubModuleCodeParamSchema,
    body: SetStyleBodySchema,
  },
  async ({ user, params, body }) => {
    const db = getDb();
    const [sub] = await db
      .select({ id: subModules.id })
      .from(subModules)
      .where(eq(subModules.subModuleCode, params.sub_module))
      .limit(1);

    if (!sub) throw notFound();

    // Pastikan konten tidak terkunci (SPEC-005 / SPEC-021)
    await assertSubModuleAccessible(db, user!.id, sub.id);

    await setSubModuleStyle(user!.id, sub.id, body.style, db);
    return { status: 204 };
  },
);
