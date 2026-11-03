/**
 * Fungsi murni konversi band (SPEC-009). Tanpa akses DB. Semua pembulatan memakai bilangan bulat per-1/1000
 * agar bebas galat float.
 */
export interface BandRowLike {
  raw_min: number;
  raw_max: number;
  band: number;
}

/** Pembulatan resmi ke setengah band: f<0.25 turun, 0.25<=f<0.75 ke .5, f>=0.75 naik. */
export function roundToHalfBand(x: number): number {
  if (!Number.isFinite(x)) throw new Error('roundToHalfBand: nilai tidak valid');
  const milli = Math.round(x * 1000);
  const whole = Math.floor(milli / 1000);
  const frac = milli - whole * 1000;
  if (frac < 250) return whole;
  if (frac < 750) return whole + 0.5;
  return whole + 1;
}

export function overallBand(c: { listening: number; reading: number; writing: number; speaking: number }): number {
  const parts = [c.listening, c.reading, c.writing, c.speaking];
  if (parts.some((v) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('overallBand: keempat band wajib ada');
  return roundToHalfBand((c.listening + c.reading + c.writing + c.speaking) / 4);
}

/** Band Boss (ADR-003 #1): rata-rata Listening dan Reading. */
export function bossBand(listening: number, reading: number): number {
  return roundToHalfBand((listening + reading) / 2);
}

export function averageBand(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundToHalfBand(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Skala skor mentah ke 0-40 (pembulatan setengah ke atas, juga saat `max=40`: skor parsial 29.5 -> 30, 28.4 -> 28).
 * Selalu mengembalikan bilangan bulat sehingga `convertRawToBand` tidak pernah jatuh di celah antar baris.
 * `max<=0`, `raw<0`, atau `raw>max` -> error.
 */
export function scaleToForty(raw: number, max: number): number {
  if (!Number.isFinite(raw) || !Number.isFinite(max) || max <= 0 || raw < 0 || raw > max) {
    throw new Error('scaleToForty: skor mentah atau maksimum tidak valid');
  }
  if (max === 40) return Math.floor(Math.round(raw * 100) / 100 + 0.5);
  if (Number.isInteger(raw) && Number.isInteger(max)) return Math.floor((raw * 80 + max) / (2 * max));
  return Math.floor((raw * 40) / max + 0.5);
}

export function convertRawToBand(rows: readonly BandRowLike[], raw40: number): number {
  const row = rows.find((r) => r.raw_min <= raw40 && raw40 <= r.raw_max);
  if (!row) throw new Error('band_row_missing');
  return row.band;
}
