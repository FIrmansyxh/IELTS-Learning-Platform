import { RADAR_ORDER, type RadarSkillName, type SkillScore } from '@/lib/api/skills-contract';

/** Geometri radar 6 sumbu (skala band 0-9). Murni dan deterministik agar mudah diuji. */
export const RADAR = { width: 340, height: 296, cx: 170, cy: 148, radius: 92, max: 9, labelGap: 14 } as const;

/** Sudut sumbu ke-i (radian), sumbu pertama di atas, searah jarum jam. */
export function axisAngle(i: number, count = RADAR_ORDER.length): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / count;
}

export function pointAt(i: number, band: number, scale = 1): { x: number; y: number } {
  const a = axisAngle(i);
  const r = (Math.max(0, Math.min(RADAR.max, band)) / RADAR.max) * RADAR.radius * scale;
  return { x: RADAR.cx + r * Math.cos(a), y: RADAR.cy + r * Math.sin(a) };
}

export function polygonPoints(values: number[]): string {
  return values
    .map((v, i) => {
      const p = pointAt(i, v);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
}

/** Posisi dan jangkar teks label sumbu di luar cincin terluar. */
export function labelAt(i: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const a = axisAngle(i);
  const r = RADAR.radius + RADAR.labelGap;
  const x = RADAR.cx + r * Math.cos(a);
  const y = RADAR.cy + r * Math.sin(a);
  const cos = Math.cos(a);
  const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
  // Label atas naik sedikit, label bawah turun sedikit agar tidak menempel pada cincin.
  const dy = Math.sin(a) < -0.9 ? -2 : Math.sin(a) > 0.9 ? 10 : 4;
  return { x, y: y + dy, anchor };
}

export const bandOrNull = (s: SkillScore): number | null => s.estimated_band;

/** Skor terendah dan tertinggi untuk `aria-label` ringkasan. Keterampilan tanpa band dihitung sebagai terendah. */
export function summarizeSkills(skills: SkillScore[]): { low: SkillScore | null; high: SkillScore | null } {
  const withBand = skills.filter((s) => s.estimated_band !== null);
  const without = skills.filter((s) => s.estimated_band === null);
  const high = withBand.length ? withBand.reduce((a, b) => (b.estimated_band! > a.estimated_band! ? b : a)) : null;
  const low = without.length
    ? without[0]!
    : withBand.length
      ? withBand.reduce((a, b) => (b.estimated_band! < a.estimated_band! ? b : a))
      : null;
  return { low, high };
}

export function skillIndex(skill: RadarSkillName): number {
  return RADAR_ORDER.indexOf(skill);
}

/** Radar kosong = tak satu pun keterampilan punya sampel. */
export function isRadarEmpty(skills: SkillScore[]): boolean {
  return skills.every((s) => s.sample_size === 0 && s.score_percent === null);
}
