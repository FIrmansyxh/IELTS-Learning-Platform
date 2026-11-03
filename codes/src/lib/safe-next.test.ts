import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('menerima path internal', () => {
    expect(safeNext('/profil')).toBe('/profil');
    expect(safeNext('/belajar/1.1.1?tab=drill')).toBe('/belajar/1.1.1?tab=drill');
  });
  it.each(['//evil.test', 'https://evil.test', '/\\evil', '', 'profil', '/a\tb', null, undefined])(
    'menolak %j dan memakai fallback',
    (v) => {
      expect(safeNext(v as string | null | undefined)).toBe('/');
    },
  );
  it('menolak panjang > 200', () => {
    expect(safeNext(`/${'a'.repeat(200)}`)).toBe('/');
    expect(safeNext(`/${'a'.repeat(199)}`)).toBe(`/${'a'.repeat(199)}`);
  });
});
