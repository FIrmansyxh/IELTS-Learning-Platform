import { z } from 'zod';
import { id } from '@/i18n/id';

/** Panjang dalam code point setelah NFKC (sama dengan aturan server SPEC-001). */
export function passwordLength(p: string): number {
  return [...p.normalize('NFKC')].length;
}

const email = z
  .string()
  .trim()
  .min(1, id.form.emailRequired)
  .max(254, id.form.emailInvalid)
  .pipe(z.email(id.form.emailInvalid));

const displayName = z
  .string()
  .trim()
  .min(2, id.form.nameLength)
  .max(80, id.form.nameLength)
  .regex(/^[^\p{Cc}]+$/u, id.form.nameInvalid);

const newPassword = z
  .string()
  .min(1, id.form.passwordRequired)
  .refine((p) => passwordLength(p) >= 10, id.form.passwordMin)
  .refine((p) => passwordLength(p) <= 128, id.form.passwordMax);

/** Kode undangan: 20 karakter Crockford base32, boleh dipisah `-` per 4 karakter (SPEC-001). */
export function isValidInviteCode(raw: string): boolean {
  const parts = raw.split('-');
  const grouped = parts.length === 5 && parts.every((p) => p.length === 4);
  if (parts.length !== 1 && !grouped) return false;
  return /^[0-9A-HJKMNP-TV-Z]{20}$/i.test(parts.join(''));
}

export const loginFormSchema = z.object({
  email: z.string().trim().min(1, id.form.emailRequired).max(254, id.form.emailInvalid),
  password: z.string().min(1, id.form.passwordRequired).max(128, id.form.passwordMax),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export function registerFormSchema(requireInvite: boolean) {
  return z
    .object({
      email,
      display_name: displayName,
      password: newPassword,
      invite_code: z.string().trim(),
    })
    .superRefine((v, ctx) => {
      if (v.password.normalize('NFKC').toLowerCase() === v.email.toLowerCase()) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: id.form.passwordSameAsEmail });
      }
      if (requireInvite) {
        if (v.invite_code.length === 0) {
          ctx.addIssue({ code: 'custom', path: ['invite_code'], message: id.form.inviteRequired });
        } else if (!isValidInviteCode(v.invite_code)) {
          ctx.addIssue({ code: 'custom', path: ['invite_code'], message: id.form.inviteFormat });
        }
      }
    });
}
export type RegisterFormValues = z.infer<ReturnType<typeof registerFormSchema>>;

export const changePasswordFormSchema = z
  .object({
    current_password: z.string().min(1, id.form.passwordRequired).max(128, id.form.passwordMax),
    new_password: newPassword,
  })
  .superRefine((v, ctx) => {
    if (v.current_password === v.new_password) {
      ctx.addIssue({ code: 'custom', path: ['new_password'], message: id.form.passwordUnchanged });
    }
  });
export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

export const profileFormSchema = z.object({
  display_name: displayName,
  /** "none" = null (Select Radix tidak mengizinkan nilai kosong). */
  target_band: z.enum(['none', '5', '5.5', '6', '6.5', '7']),
});
export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function targetBandToForm(v: number | null): ProfileFormValues['target_band'] {
  return v === null ? 'none' : (String(v) as ProfileFormValues['target_band']);
}
export function targetBandFromForm(v: ProfileFormValues['target_band']): 5 | 5.5 | 6 | 6.5 | 7 | null {
  return v === 'none' ? null : (Number(v) as 5 | 5.5 | 6 | 6.5 | 7);
}

export const adminCreateUserFormSchema = z.object({
  email,
  display_name: displayName,
  role: z.enum(['learner', 'admin']),
});
export type AdminCreateUserFormValues = z.infer<typeof adminCreateUserFormSchema>;

export const createInviteFormSchema = z.object({
  expires_in_days: z
    .string()
    .trim()
    .regex(/^\d+$/, id.form.intRequired)
    .refine((v) => Number(v) >= 1 && Number(v) <= 30, id.form.intRange.replace('{min}', '1').replace('{max}', '30')),
});
export type CreateInviteFormValues = z.infer<typeof createInviteFormSchema>;
