import { z } from 'zod';

export const HealthResponseSchema = z.strictObject({
  data: z.strictObject({
    status: z.literal('ok'),
    time: z.string().datetime(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
