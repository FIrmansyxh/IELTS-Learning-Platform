import type { BandSkillName } from '@/contracts/band';

/**
 * Tabel band Reading yang dipakai untuk penilaian. Target platform adalah IELTS General Training
 * (ADR-004), jadi Reading memakai `READING_GENERAL`. `READING_ACADEMIC` tetap dapat dikelola admin
 * tetapi tidak dipakai untuk menghitung band pengguna.
 */
export const READING_BAND_SKILL = 'READING_GENERAL' as const satisfies BandSkillName;

/** Skill band untuk skill soal Listening/Reading. */
export const bandSkillFor = (skill: string): 'LISTENING' | typeof READING_BAND_SKILL =>
  skill === 'LISTENING' ? 'LISTENING' : READING_BAND_SKILL;
