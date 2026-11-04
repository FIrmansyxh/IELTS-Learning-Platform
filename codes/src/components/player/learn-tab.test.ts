import { describe, expect, it } from 'vitest';
import { makeDetail } from './fixtures';
import { DEFAULT_MIN_ACTIVE_SECONDS, unmetRequirements } from './learn-tab';

describe('unmetRequirements (D-002: ambang waktu dari server)', () => {
  const base = () => structuredClone(makeDetail());

  it('memakai progress.min_active_seconds dari server, bukan 60 hardcode', () => {
    const d = base();
    d.progress = { ...d.progress, learn_active_seconds: 3, learn_ready: false, learn_visited_subtabs: ['ARTICLE', 'VIDEO', 'SLIDES'], min_active_seconds: 10 };
    const out = unmetRequirements(d, null);
    expect(out.find((r) => r.key === 'time')?.text).toContain('10');
    expect(out.find((r) => r.key === 'time')?.text).not.toContain('60');
  });

  it('cadangan 60 detik bila server tidak mengirim ambang', () => {
    const d = base();
    d.progress = { ...d.progress, learn_active_seconds: 3, learn_ready: false, min_active_seconds: undefined };
    expect(unmetRequirements(d, null).find((r) => r.key === 'time')?.text).toContain(String(DEFAULT_MIN_ACTIVE_SECONDS));
  });
});
