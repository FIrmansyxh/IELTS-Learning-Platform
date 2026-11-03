import { createHash, randomBytes, randomInt } from 'node:crypto';

/** PRNG deterministik `mulberry32` (SPEC-006 D4): dipakai agar urutan soal dapat dipulihkan dari seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed acak 128-bit dari CSPRNG (hex 32 karakter). TIDAK diturunkan dari id publik; disimpan di `attempts.state`. */
export const newRngSeed = (): string => randomBytes(16).toString('hex');

/**
 * Generator pseudo-acak kuat (SHA-256 mode penghitung) dari seed rahasia: tidak dapat diprediksi tanpa seed,
 * dan reproduksibel dari seed yang sama. Mengembalikan float [0, 1) beresolusi 48 bit.
 */
export function seededCsprng(seedHex: string): () => number {
  let counter = 0;
  let buf = Buffer.alloc(0);
  let pos = 0;
  return () => {
    if (pos + 6 > buf.length) {
      buf = createHash('sha256').update(seedHex).update(String(counter++)).digest();
      pos = 0;
    }
    const n = buf.readUIntBE(pos, 6);
    pos += 6;
    return n / 2 ** 48;
  };
}

/** Fisher-Yates; mengembalikan salinan. */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** ID opak: prefiks + 6 karakter base36 dari CSPRNG (D5), unik terhadap `taken`. */
export function randomOpaqueId(prefix: string, taken: Set<string>): string {
  for (;;) {
    let s = prefix;
    for (let i = 0; i < 6; i++) s += B36[randomInt(36)];
    if (!taken.has(s)) {
      taken.add(s);
      return s;
    }
  }
}
