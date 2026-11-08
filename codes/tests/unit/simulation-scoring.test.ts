import { describe, expect, it } from 'vitest';
import {
  roundBand,
  computeWritingBand,
  computeSpeakingBand,
  computeOverall,
} from '@/server/simulation/scoring';

describe('Simulation Scoring & Band Calculations (AC-4, AC-20, D4)', () => {
  it('AC-4: band Writing = roundBand((T1 + 2*T2)/3) ke 0.5 terdekat', () => {
    expect(computeWritingBand(6.0, 6.5)).toBe(6.5);
    expect(computeWritingBand(6.5, 6.0)).toBe(6.0);
    expect(computeWritingBand(6.5, 7.0)).toBe(7.0);
    expect(computeWritingBand(0, 6.0)).toBe(4.0);
    expect(computeWritingBand(5.5, 5.5)).toBe(5.5);
    // Task kosong = 0
    expect(computeWritingBand(null, 6.0)).toBe(4.0);
    expect(computeWritingBand(6.0, null)).toBe(2.0);
    expect(computeWritingBand(null, null)).toBe(0);
  });

  it('AC-20 & D4: Overall 4 section dengan pembulatan setengah-band', () => {
    // (6.0, 6.0, 6.0, 7.0) -> W = 50 -> 6.5
    const r1 = computeOverall(
      ['LISTENING', 'READING', 'WRITING', 'SPEAKING'],
      [
        { section: 'LISTENING', status: 'GRADED', band: 6.0 },
        { section: 'READING', status: 'GRADED', band: 6.0 },
        { section: 'WRITING', status: 'GRADED', band: 6.0 },
        { section: 'SPEAKING', status: 'GRADED', band: 7.0 },
      ],
    );
    expect(r1.status).toBe('COMPLETE');
    expect(r1.band).toBe(6.5);
    expect(r1.label).toBe('Overall');

    // (6.0, 7.0, 7.0, 7.0) -> W = 54 -> 7.0
    const r2 = computeOverall(
      ['LISTENING', 'READING', 'WRITING', 'SPEAKING'],
      [
        { section: 'LISTENING', status: 'GRADED', band: 6.0 },
        { section: 'READING', status: 'GRADED', band: 7.0 },
        { section: 'WRITING', status: 'GRADED', band: 7.0 },
        { section: 'SPEAKING', status: 'GRADED', band: 7.0 },
      ],
    );
    expect(r2.status).toBe('COMPLETE');
    expect(r2.band).toBe(7.0);

    // (6.0, 6.0, 6.0, 6.5) -> S = 49 -> floor(51/4) = 12 -> 6.0
    const r3 = computeOverall(
      ['LISTENING', 'READING', 'WRITING', 'SPEAKING'],
      [
        { section: 'LISTENING', status: 'GRADED', band: 6.0 },
        { section: 'READING', status: 'GRADED', band: 6.0 },
        { section: 'WRITING', status: 'GRADED', band: 6.0 },
        { section: 'SPEAKING', status: 'GRADED', band: 6.5 },
      ],
    );
    expect(r3.status).toBe('COMPLETE');
    expect(r3.band).toBe(6.0);
  });

  it('AC-1: Kurang dari 4 section menghasilkan PARTIAL_SELECTION', () => {
    const r = computeOverall(
      ['READING', 'WRITING'],
      [
        { section: 'READING', status: 'GRADED', band: 7.0 },
        { section: 'WRITING', status: 'GRADED', band: 6.5 },
      ],
    );
    expect(r.status).toBe('PARTIAL_SELECTION');
    expect(r.band).toBeNull();
    // indicative_band = (7.0 + 6.5)/2 = 6.75 -> 7.0
    expect(r.indicative_band).toBe(7.0);
    expect(r.label).toBe('Overall parsial: dipilih 2 dari 4 section');
  });

  it('AC-2: 4 section dipilih tapi Speaking belum bernilai -> PENDING_SECTIONS', () => {
    const r = computeOverall(
      ['LISTENING', 'READING', 'WRITING', 'SPEAKING'],
      [
        { section: 'LISTENING', status: 'GRADED', band: 6.5 },
        { section: 'READING', status: 'GRADED', band: 7.0 },
        { section: 'WRITING', status: 'GRADED', band: 6.5 },
        { section: 'SPEAKING', status: 'NOT_STARTED', band: null },
      ],
    );
    expect(r.status).toBe('PENDING_SECTIONS');
    expect(r.band).toBeNull();
    expect(r.label).toBe('Menunggu skor Speaking');
    expect(r.indicative_band).toBe(6.5); // (6.5 + 7.0 + 6.5) / 3 = 6.666 -> floor((2*40 + 3)/6) = floor(83/6) = 13 -> 6.5
  });

  it('Speaking band: rata-rata 3 part dengan D4', () => {
    expect(computeSpeakingBand(6.0, 6.0, 7.0)).toBe(6.5); // (12+12+14=38) -> floor(79/6) = 13 -> 6.5
    expect(computeSpeakingBand(6.0, 6.0, 6.0)).toBe(6.0);
    expect(computeSpeakingBand(null, 6.0, 6.0)).toBeNull();
  });
});
