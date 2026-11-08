import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/server/env';

const valid = {
  NODE_ENV: 'test',
  AUTH_SECRET: 'x'.repeat(32),
  AUTH_URL: 'http://localhost:3000',
  ALLOWED_HOSTS: 'localhost:3000',
  IP_HMAC_SECRET: 'y'.repeat(32),
  ASSETS_DIR: '/data/assets',
};

describe('parseEnv', () => {
  it('menerima konfigurasi valid dan mengisi default', () => {
    const r = parseEnv(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.env.STORAGE_DRIVER).toBe('fs');
      expect(r.env.AI_ENABLED).toBe(false);
      expect(r.env.AI_JOB_TIMEOUT_SEC).toBe(180);
      expect(r.env.APP_TIMEZONE).toBe('Asia/Jakarta');
    }
  });

  it('menolak AUTH_SECRET < 32 byte dan hanya melaporkan nama key', () => {
    const r = parseEnv({ ...valid, AUTH_SECRET: 'pendek' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.keys).toContain('AUTH_SECRET');
      expect(r.messages.join('\n')).not.toContain('pendek');
      expect(r.messages).toContain('Konfigurasi env tidak valid: AUTH_SECRET');
    }
  });

  it('mewajibkan S3_* lengkap bila STORAGE_DRIVER=s3', () => {
    const r = parseEnv({ ...valid, STORAGE_DRIVER: 's3', S3_BUCKET: 'b' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.messages).toContain('S3_* wajib bila STORAGE_DRIVER=s3');
  });

  it('melaporkan semua key yang hilang', () => {
    const r = parseEnv({ NODE_ENV: 'test' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.keys).toEqual(expect.arrayContaining(['AUTH_SECRET', 'AUTH_URL', 'ALLOWED_HOSTS']));
  });
});
