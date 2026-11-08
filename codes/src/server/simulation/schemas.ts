import { z } from 'zod';
import { SIMULATION_SECTIONS } from '@/contracts/simulation';

export const SimulationAttemptParamsSchema = z.strictObject({
  attempt_id: z.string().uuid(),
});

export const SimulationSectionParamsSchema = z.strictObject({
  attempt_id: z.string().uuid(),
  section: z.enum(SIMULATION_SECTIONS),
});
