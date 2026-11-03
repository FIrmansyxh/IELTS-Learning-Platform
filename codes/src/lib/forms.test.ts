import { describe, expect, it } from 'vitest';
import {
  changePasswordFormSchema,
  isValidInviteCode,
  passwordLength,
  registerFormSchema,
  targetBandFromForm,
  targetBandToForm,
} from './forms';

const base = { email: 'budi@example.test', display_name: 'Budi', password: 'kopi-tubruk-2026!', invite_code: '' };

describe('passwordLength', () => {
  it('menghitung code point setelah NFKC', () => {
    expect(passwordLength('abc')).toBe(3);
    expect(passwordLength('\u{1F600}\u{1F600}')).toBe(2);
    expect(passwordLength('ＡＢＣ')).toBe(3);
  });
});

describe('registerFormSchema', () => {
  it('menerima data valid pada mode open', () => {
    expect(registerFormSchema(false).safeParse(base).success).toBe(true);
  });
  it('password tepat 10 diterima, 9 ditolak', () => {
    expect(registerFormSchema(false).safeParse({ ...base, password: '1234567890' }).success).toBe(true);
    expect(registerFormSchema(false).safeParse({ ...base, password: '123456789' }).success).toBe(false);
  });
  it('password sama dengan email ditolak', () => {
    const r = registerFormSchema(false).safeParse({
      ...base,
      email: 'budi.santoso@example.test',
      password: 'Budi.Santoso@Example.Test',
    });
    expect(r.success).toBe(false);
  });
  it('mode invite mewajibkan kode berformat benar', () => {
    const s = registerFormSchema(true);
    expect(s.safeParse(base).success).toBe(false);
    expect(s.safeParse({ ...base, invite_code: 'K7QM-4XZP-9T2V-HD8W-RJ3N' }).success).toBe(true);
    expect(s.safeParse({ ...base, invite_code: 'k7qm4xzp9t2vhd8wrj3n' }).success).toBe(true);
    expect(s.safeParse({ ...base, invite_code: 'SALAH' }).success).toBe(false);
  });
  it('nama hanya spasi ditolak', () => {
    expect(registerFormSchema(false).safeParse({ ...base, display_name: '   ' }).success).toBe(false);
  });
});

describe('isValidInviteCode', () => {
  it('menolak huruf I L O U dan pemisah salah', () => {
    expect(isValidInviteCode('IIII-4XZP-9T2V-HD8W-RJ3N')).toBe(false);
    expect(isValidInviteCode('K7QM4-XZP9-T2VH-D8WR-J3N')).toBe(false);
  });
});

describe('changePasswordFormSchema', () => {
  it('password baru harus berbeda', () => {
    const r = changePasswordFormSchema.safeParse({
      current_password: 'kopi-tubruk-2026!',
      new_password: 'kopi-tubruk-2026!',
    });
    expect(r.success).toBe(false);
  });
});

describe('target band', () => {
  it('memetakan null dan none', () => {
    expect(targetBandToForm(null)).toBe('none');
    expect(targetBandToForm(6)).toBe('6');
    expect(targetBandFromForm('none')).toBeNull();
    expect(targetBandFromForm('6.5')).toBe(6.5);
  });
});
