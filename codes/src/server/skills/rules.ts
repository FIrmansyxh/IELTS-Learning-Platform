/** Aturan murni Radar & Prediksi Band (SPEC-017): tanpa DB; semua pembulatan dengan bilangan bulat. */
import { averageBand, overallBand } from '../band/convert';
import type { BandComponents, PredictionDTO, RadarSkillName } from '@/contracts/skills';

export const OBJECTIVE_SKILLS = ['LISTENING', 'READING', 'GRAMMAR', 'VOCAB'] as const;
export const AI_SKILLS = ['WRITING', 'SPEAKING'] as const;
export type ObjectiveSkill = (typeof OBJECTIVE_SKILLS)[number];
export type AiSkill = (typeof AI_SKILLS)[number];

/** Ukuran sampel objektif (R1) dan sampel minimal agar `estimated_band` dihitung. */
export const OBJECTIVE_SAMPLE = 50;
/** F-17-02: minimum sampel (soal unik) agar `estimated_band` dihitung (sebelumnya 5). */
export const MIN_SAMPLE_FOR_BAND = 10;
/** F-17-02: sampel objektif >= ini dianggap cukup (rentang +/-0,5); di bawahnya rentang diperlebar (+/-1,0) dan berlabel indikatif. */
export const ADEQUATE_SAMPLE = 30;
export const AI_SAMPLE = 3;

export const isProxy = (skill: RadarSkillName): boolean => skill === 'GRAMMAR' || skill === 'VOCAB';

/** Tabel band: LISTENING memakai tabel Listening; READING, GRAMMAR, VOCAB memakai tabel Reading Academic (proksi). */
export const bandTableFor = (skill: ObjectiveSkill): 'LISTENING' | 'READING_ACADEMIC' => (skill === 'LISTENING' ? 'LISTENING' : 'READING_ACADEMIC');

export const WRITING_KINDS = ['WRITING_TASK1', 'WRITING_TASK2', 'MINI_TASK_WRITING'] as const;
export const SPEAKING_KINDS = ['SPEAKING_PART1', 'SPEAKING_PART2', 'SPEAKING_PART3', 'MINI_TASK_SPEAKING'] as const;
export function aiSkillOfKind(kind: string): AiSkill | null {
  if ((WRITING_KINDS as readonly string[]).includes(kind)) return 'WRITING';
  if ((SPEAKING_KINDS as readonly string[]).includes(kind)) return 'SPEAKING';
  return null;
}

/** Persen dalam sentesimal, pembulatan setengah ke atas: round_half_up(100*num/den, 2) * 100. */
export const percentHundredths = (num: number, den: number): number => Math.floor((num * 10000 * 2 + den) / (2 * den));

/** R2: persen dari band (0-9): round_half_up(band/9*100, 2). Band kelipatan 0,5 -> `bandHalf` bilangan bulat 0-18. */
export function aiScorePercentHundredths(band: number): number {
  const half = Math.round(band * 2);
  return percentHundredths(half, 18);
}

export const hundredthsToNumber = (h: number): number => Number((h / 100).toFixed(2));

const NAMES: Record<keyof BandComponents, string> = { LISTENING: 'Listening', READING: 'Reading', WRITING: 'Writing', SPEAKING: 'Speaking' };
function joinId(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} dan ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, dan ${items[items.length - 1]}`;
}

/**
 * Ukuran sampel prediksi (F-17-02): sampel TERKECIL di antara komponen objektif (Listening/Reading) yang punya band;
 * Writing/Speaking dibatasi 3 submission sehingga tidak ikut menentukan. `null` bila tidak ada komponen objektif.
 */
export function predictionSampleSize(c: BandComponents, samples: Partial<Record<keyof BandComponents, number>>): number | null {
  const ns = (['LISTENING', 'READING'] as const).filter((k) => c[k] !== null).map((k) => samples[k] ?? 0);
  return ns.length ? Math.min(...ns) : null;
}

/** R4: prediksi dari empat komponen band. `sampleSize` (F-17-02) menentukan lebar rentang dan label indikatif. */
export function computePrediction(c: BandComponents, sampleSize: number | null = null): PredictionDTO {
  const order: Array<keyof BandComponents> = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];
  const present = order.filter((k) => c[k] !== null);
  const complete = present.length === 4;
  const overall = complete ? overallBand({ listening: c.LISTENING!, reading: c.READING!, writing: c.WRITING!, speaking: c.SPEAKING! }) : null;
  const indicative = averageBand(present.map((k) => c[k]!));
  const x = overall ?? indicative;
  const lowSample = x !== null && (sampleSize === null || sampleSize < ADEQUATE_SAMPLE);
  const half = lowSample ? 1.0 : 0.5;
  const basis = complete
    ? 'Berdasarkan Listening, Reading, Writing, dan Speaking.'
    : present.length === 0
      ? 'Belum cukup data. Selesaikan latihan dan ujian untuk melihat prediksi.'
      : `Indikatif: berdasarkan ${joinId(present.map((k) => NAMES[k]))}. Selesaikan Writing dan Speaking untuk prediksi lengkap.`;
  return {
    overall_band: overall,
    indicative_band: indicative,
    range_low: x === null ? null : Math.max(0, x - half),
    range_high: x === null ? null : Math.min(9, x + half),
    complete,
    components: { LISTENING: c.LISTENING, READING: c.READING, WRITING: c.WRITING, SPEAKING: c.SPEAKING },
    basis_note: lowSample ? `${basis} Sampel masih kecil${sampleSize === null ? '' : ` (${sampleSize} soal)`}, jadi rentang lebih lebar dan hasil bersifat indikatif.` : basis,
    sample_size: sampleSize,
    low_sample: lowSample,
  };
}

/** Nilai `x` untuk riwayat (R5): overall bila lengkap, selain itu indikatif. */
export const predictionValue = (p: PredictionDTO): number | null => p.overall_band ?? p.indicative_band;
