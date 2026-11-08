import { z } from 'zod';
import { Uuid } from './common';

/** Kontrak profil lokal (SPEC-025): pengganti login/daftar. Tanpa email dan password. */
export const MAX_PROFILES = 10;
export const PROFILE_NAME_MIN = 2;
export const PROFILE_NAME_MAX = 40;

export const ProfileNameSchema = z
  .string()
  .trim()
  .min(PROFILE_NAME_MIN, { message: 'profile_name_invalid' })
  .max(PROFILE_NAME_MAX, { message: 'profile_name_invalid' })
  .regex(/^[^\p{Cc}]+$/u, { message: 'profile_name_invalid' });

export const ProfileSummarySchema = z.object({
  id: Uuid,
  display_name: z.string(),
  target_band: z.number().nullable(),
  created_at: z.string(),
  /** Banyak sub-modul yang sudah selesai; ringkasan untuk kartu profil. */
  completed_sub_modules: z.number().int(),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

export const ProfileListResponseSchema = z.object({
  data: z.object({ profiles: z.array(ProfileSummarySchema), max_profiles: z.number().int() }),
});

export const CreateProfileRequestSchema = z.strictObject({ display_name: ProfileNameSchema });
export type CreateProfileRequest = z.infer<typeof CreateProfileRequestSchema>;

export const DeleteProfileRequestSchema = z.strictObject({ confirm_name: z.string().min(1).max(80) });
export type DeleteProfileRequest = z.infer<typeof DeleteProfileRequestSchema>;
