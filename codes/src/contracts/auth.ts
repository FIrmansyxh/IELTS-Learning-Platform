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

const emailField = z
  .string()
  .trim()
  .min(3, { message: 'invalid_email' })
  .max(254, { message: 'invalid_email' })
  .refine((v) => z.email().safeParse(v).success, { message: 'invalid_email' });

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

export const RegisterRequestSchema = z.strictObject({
  email: emailField,
  display_name: displayName,
  password: newPasswordField,
  invite_code: z
    .string()
    .trim()
    .regex(INVITE_CODE_RE, { message: 'invalid_invite_format' })
    .optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RegisterResponseSchema = z.strictObject({ data: z.strictObject({ user: UserDTO }) });

export const LoginRequestSchema = z.strictObject({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});
export const LoginResponseSchema = RegisterResponseSchema;

export const SignupConfigResponseSchema = z.strictObject({
  data: z.strictObject({ mode: z.enum(['open', 'invite', 'closed']) }),
});

export const MeResponseSchema = RegisterResponseSchema;

export const ChangePasswordRequestSchema = z.strictObject({
  current_password: z.string().min(1).max(128),
  new_password: newPasswordField,
});
export const ChangePasswordResponseSchema = RegisterResponseSchema;

export const UpdateProfileRequestSchema = z
  .strictObject({
    display_name: displayName.optional(),
    target_band: z
      .union([z.null(), ...TARGET_BANDS.map((b) => z.literal(b))])
      .optional(),
  })
  .refine((v) => v.display_name !== undefined || v.target_band !== undefined, { message: 'empty_update' });
export const UpdateProfileResponseSchema = RegisterResponseSchema;
