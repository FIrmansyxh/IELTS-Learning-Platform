import { describe, expect, it } from 'vitest';
import { CONTENT_SOURCES, defaultSettings, seedModules } from '../../scripts/seed';

describe('seed SPEC-000', () => {
  it('memiliki 14 sumber unik dan tidak ada sumber berhak cipta yang boleh disalin', () => {
    expect(CONTENT_SOURCES).toHaveLength(14);
    expect(new Set(CONTENT_SOURCES.map((s) => s.code)).size).toBe(14);
    for (const s of CONTENT_SOURCES) {
      if (s.licenseType === 'LINK_ONLY_COPYRIGHTED' || s.licenseType === 'EMBED_TOS') {
        expect(s.mayStoreCopy).toBe(false);
      }
    }
  });

  it('mendaftarkan modul seed berurutan (SPEC-000, 002, 004, 009)', () => {
    expect(seedModules.map((m) => m.name)).toEqual(['content_sources', 'app_settings', 'system_settings', 'curriculum-structure', 'band-tables']);
  });

  it('menyemai dua kunci dari env dan sisanya default', () => {
    const s = defaultSettings({ AI_DAILY_LIMIT_PER_USER: '7', AUDIO_RETENTION_DAYS: '30' });
    const get = (k: string) => s.find((x) => x.key === k)?.value;
    expect(s).toHaveLength(20);
    expect(get('signup.mode')).toBeUndefined();
    expect(get('ai.daily_limit_per_user')).toBe(7);
    expect(get('retention.audio_days')).toBe(30);
    expect(get('crown.gold_min')).toBe(90);
  });
});
