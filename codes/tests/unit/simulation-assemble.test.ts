import { describe, expect, it } from 'vitest';
import { sortSimulationSections } from '@/server/simulation/assemble';

describe('Simulation Assembly (SPEC-023 D2, D3)', () => {
  it('D2: sortSimulationSections selalu mengurutkan LISTENING -> READING -> WRITING, dan SPEAKING terakhir', () => {
    expect(sortSimulationSections(['WRITING', 'READING'])).toEqual(['READING', 'WRITING']);
    expect(sortSimulationSections(['SPEAKING', 'LISTENING', 'WRITING', 'READING'])).toEqual([
      'LISTENING',
      'READING',
      'WRITING',
      'SPEAKING',
    ]);
    expect(sortSimulationSections(['SPEAKING', 'READING'])).toEqual(['READING', 'SPEAKING']);
    expect(sortSimulationSections(['WRITING'])).toEqual(['WRITING']);
    expect(sortSimulationSections(['SPEAKING'])).toEqual(['SPEAKING']);
  });
});
