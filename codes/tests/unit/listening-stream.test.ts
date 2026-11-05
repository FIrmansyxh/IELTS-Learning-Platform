import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parseByteRange } from '@/lib/audio/range';
import { GET } from '@/app/api/v1/attempts/[attempt_id]/audio/route';
import { logger } from '@/server/logger';
import { assessmentSets, attempts, contentAssets } from '@/db/schema';

// Mock dependencies
vi.mock('@/server/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/server/storage', () => ({
  getStorage: vi.fn(),
}));

vi.mock('@/server/auth/guards', () => ({
  requireUser: vi.fn().mockResolvedValue({
    user: { id: '11111111-1111-4111-8111-111111111111', role: 'learner' },
    refreshedCookie: null,
  }),
}));

import { getDb } from '@/server/db';
import { getStorage } from '@/server/storage';

describe('parseByteRange (RFC 9110 & SPEC-011)', () => {
  const total = 4812344;

  it('mengembalikan full bila tanpa header Range atau bukan prefiks bytes=', () => {
    expect(parseByteRange(null, total)).toEqual({ type: 'full' });
    expect(parseByteRange(undefined, total)).toEqual({ type: 'full' });
    expect(parseByteRange('', total)).toEqual({ type: 'full' });
    expect(parseByteRange('characters=0-10', total)).toEqual({ type: 'full' });
  });

  it('mengembalikan full bila multi-rentang (mengandung koma, diabaikan sesuai SPEC-011)', () => {
    expect(parseByteRange('bytes=0-10,20-30', total)).toEqual({ type: 'full' });
  });

  it('mengurai rentang baku start-end: bytes=0-1023', () => {
    expect(parseByteRange('bytes=0-1023', total)).toEqual({
      type: 'partial',
      start: 0,
      end: 1023,
    });
  });

  it('mengurai rentang terbuka start-: bytes=1000-', () => {
    expect(parseByteRange('bytes=1000-', total)).toEqual({
      type: 'partial',
      start: 1000,
      end: 4812343,
    });
  });

  it('mengurai sufiks bytes=-500 (500 byte terakhir)', () => {
    expect(parseByteRange('bytes=-500', total)).toEqual({
      type: 'partial',
      start: 4812344 - 500,
      end: 4812343,
    });
  });

  it('memotong end bila melewati totalSize', () => {
    expect(parseByteRange('bytes=0-9999999', total)).toEqual({
      type: 'partial',
      start: 0,
      end: 4812343,
    });
  });

  it('mengembalikan invalid bila start >= totalSize: bytes=9999999-', () => {
    expect(parseByteRange('bytes=9999999-', total)).toEqual({ type: 'invalid' });
  });

  it('mengembalikan invalid bila format tidak valid atau end < start', () => {
    expect(parseByteRange('bytes=500-200', total)).toEqual({ type: 'invalid' });
    expect(parseByteRange('bytes=-0', total)).toEqual({ type: 'invalid' });
    expect(parseByteRange('bytes=abc-def', total)).toEqual({ type: 'invalid' });
  });
});

describe('GET /api/v1/attempts/[attempt_id]/audio handler', () => {
  const attemptId = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
  const userId = '11111111-1111-4111-8111-111111111111';
  const setId = '22222222-2222-4222-8222-222222222222';
  const assetId = '33333333-3333-4333-8333-333333333333';

  type MockDb = { select: ReturnType<typeof vi.fn> };
  type MockStorage = {
    stat: ReturnType<typeof vi.fn>;
    readStream: ReturnType<typeof vi.fn>;
  };

  let mockDb: MockDb;
  let mockStorage: MockStorage;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorage = {
      stat: vi.fn().mockResolvedValue({ size: 4812344 }),
      readStream: vi.fn().mockResolvedValue(new ReadableStream()),
    };
    vi.mocked(getStorage).mockReturnValue(mockStorage as unknown as ReturnType<typeof getStorage>);

    mockDb = {
      select: vi.fn(),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getDb>);
  });

  function setupDbMocks(opts: {
    attempt?: unknown;
    set?: unknown;
    asset?: unknown;
    childSet?: unknown;
  }) {
    mockDb.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: unknown) => ({
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockImplementation(() => {
            if (table === attempts) return Promise.resolve(opts.attempt ? [opts.attempt] : []);
            if (table === assessmentSets) {
              if (opts.childSet) return Promise.resolve([opts.childSet]);
              return Promise.resolve(opts.set ? [opts.set] : []);
            }
            if (table === contentAssets) return Promise.resolve(opts.asset ? [opts.asset] : []);
            return Promise.resolve([]);
          }),
        })),
      })),
    }));
  }

  const createReq = (range?: string, query = '') =>
    new Request(`http://localhost:3000/api/v1/attempts/${attemptId}/audio${query}`, {
      headers: range ? { range } : {},
    });

  it('404 NOT_FOUND bila attempt tidak ada atau bukan milik user', async () => {
    setupDbMocks({ attempt: null });
    const res = await GET(createReq(), { params: Promise.resolve({ attempt_id: attemptId }) });
    expect(res.status).toBe(404);
  });

  it('409 ATTEMPT_NOT_ACTIVE bila attempt bukan IN_PROGRESS (mis. GRADED)', async () => {
    setupDbMocks({
      attempt: { id: attemptId, userId, assessmentSetId: setId, status: 'GRADED' },
    });
    const res = await GET(createReq(), { params: Promise.resolve({ attempt_id: attemptId }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('ATTEMPT_NOT_ACTIVE');
  });

  it('404 NOT_FOUND bila set tidak memiliki listening_asset_id', async () => {
    setupDbMocks({
      attempt: { id: attemptId, userId, assessmentSetId: setId, status: 'IN_PROGRESS' },
      set: { id: setId, assessmentType: 'SKIP_MODULE_TEST', listeningAssetId: null },
    });
    const res = await GET(createReq(), { params: Promise.resolve({ attempt_id: attemptId }) });
    expect(res.status).toBe(404);
  });

  it('404 NOT_FOUND bila berkas fisik hilang di storage dan mencatat log asset_file_missing tanpa path', async () => {
    setupDbMocks({
      attempt: { id: attemptId, userId, assessmentSetId: setId, status: 'IN_PROGRESS' },
      set: { id: setId, assessmentType: 'SKIP_MODULE_TEST', listeningAssetId: assetId },
      asset: { id: assetId, kind: 'AUDIO_LISTENING', storageKey: '01/audio.mp3', mimeType: 'audio/mpeg' },
    });
    mockStorage.stat.mockResolvedValue(null);
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const res = await GET(createReq(), { params: Promise.resolve({ attempt_id: attemptId }) });
    expect(res.status).toBe(404);
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'asset_file_missing', asset_id: assetId }),
    );
  });

  it('416 RANGE_NOT_SATISFIABLE bila start >= totalSize dengan Content-Range */total', async () => {
    setupDbMocks({
      attempt: { id: attemptId, userId, assessmentSetId: setId, status: 'IN_PROGRESS' },
      set: { id: setId, assessmentType: 'SKIP_MODULE_TEST', listeningAssetId: assetId },
      asset: { id: assetId, kind: 'AUDIO_LISTENING', storageKey: '01/audio.mp3', mimeType: 'audio/mpeg' },
    });

    const res = await GET(createReq('bytes=9999999-'), { params: Promise.resolve({ attempt_id: attemptId }) });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */4812344');
    const body = await res.json();
    expect(body.error.code).toBe('RANGE_NOT_SATISFIABLE');
  });

  it('200 OK tanpa Range header: seluruh berkas, Content-Length, dan header wajib', async () => {
    setupDbMocks({
      attempt: { id: attemptId, userId, assessmentSetId: setId, status: 'IN_PROGRESS' },
      set: { id: setId, assessmentType: 'SKIP_MODULE_TEST', listeningAssetId: assetId },
      asset: { id: assetId, kind: 'AUDIO_LISTENING', storageKey: '01/audio.mp3', mimeType: 'audio/mpeg' },
    });

    const res = await GET(createReq(), { params: Promise.resolve({ attempt_id: attemptId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('content-length')).toBe('4812344');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(res.headers.get('content-range')).toBeNull();
  });

  it('206 Partial Content dengan Range: bytes=0-1023: Content-Range dan Content-Length 1024', async () => {
    setupDbMocks({
      attempt: { id: attemptId, userId, assessmentSetId: setId, status: 'IN_PROGRESS' },
      set: { id: setId, assessmentType: 'SKIP_MODULE_TEST', listeningAssetId: assetId },
      asset: { id: assetId, kind: 'AUDIO_LISTENING', storageKey: '01/audio.mp3', mimeType: 'audio/mpeg' },
    });

    const res = await GET(createReq('bytes=0-1023'), { params: Promise.resolve({ attempt_id: attemptId }) });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('content-length')).toBe('1024');
    expect(res.headers.get('content-range')).toBe('bytes 0-1023/4812344');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });
});
