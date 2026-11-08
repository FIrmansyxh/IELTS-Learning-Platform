import { z } from 'zod';
import { UserDTO } from './common';

/**
 * Kontrak SPEC-001. Aturan yang butuh daftar password umum (password_too_common) dan
 * pembanding email dijalankan server (src/server/auth/schemas.ts); klien cukup memakai aturan panjang ini.
 */
export const DISPLAY_NAME_RE = /^[^\p{Cc}]+$/u;
// Pengulangan terbatas (4x4), tanpa kuantifier bersarang tak terbatas: tidak rentan ReDoS.
// eslint-disable-next-line security/detect-unsafe-regex
export const INVITE_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}(-?[0-9A-HJKMNP-TV-Z]{4}){4}$/i;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const TARGET_BANDS = [5.0, 5.5, 6.0, 6.5, 7.0] as const;

/** Panjang password dalam code point setelah NFKC. */
export function passwordLength(p: string): number {
  return [...p.normalize('NFKC')].length;
}

const displayName = z
  .string()
  .trim()
  .min(2, { message: 'display_name_invalid' })
  .max(80, { message: 'display_name_invalid' })
  .regex(DISPLAY_NAME_RE, { message: 'display_name_invalid' });

export const newPasswordField = z.string().superRefine((v, ctx) => {
  const n = passwordLength(v);
  if (n < PASSWORD_MIN) ctx.addIssue({ code: 'custom', message: 'password_too_short' });
  else if (n > PASSWORD_MAX) ctx.addIssue({ code: 'custom', message: 'password_too_long' });
});

/** Amplop respons yang membawa profil aktif. */
export const UserResponseSchema = z.strictObject({ data: z.strictObject({ user: UserDTO }) });
export const MeResponseSchema = UserResponseSchema;

export const UpdateProfileRequestSchema = z
  .strictObject({
    display_name: displayName.optional(),
    target_band: z
      .union([z.null(), ...TARGET_BANDS.map((b) => z.literal(b))])
      .optional(),
  })
  .refine((v) => v.display_name !== undefined || v.target_band !== undefined, { message: 'empty_update' });
export const UpdateProfileResponseSchema = UserResponseSchema;
