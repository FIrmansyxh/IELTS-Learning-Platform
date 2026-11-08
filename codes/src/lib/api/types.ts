import type { z } from 'zod';
import type { PageMetaSchema, UserDTO } from '@/contracts/common';

/** Tipe klien diturunkan dari skema bersama (`z.infer`), bukan dari nama ekspor tipe backend. */
export type User = z.infer<typeof UserDTO>;
export type PageMeta = z.infer<typeof PageMetaSchema>;
