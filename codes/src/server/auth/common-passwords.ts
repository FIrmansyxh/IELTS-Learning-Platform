import { readFileSync } from 'node:fs';
import path from 'node:path';

let set: Set<string> | undefined;

/** Daftar password umum (huruf kecil, NFKC) dari berkas bundel `common-passwords.txt`. */
export function loadCommonPasswords(): Set<string> {
  if (!set) {
    const file = path.join(process.cwd(), 'src', 'server', 'auth', 'common-passwords.txt');
    set = new Set(
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim().normalize('NFKC').toLowerCase())
        .filter(Boolean),
    );
  }
  return set;
}

export function isCommonPassword(normalizedLowerCase: string): boolean {
  return loadCommonPasswords().has(normalizedLowerCase);
}
