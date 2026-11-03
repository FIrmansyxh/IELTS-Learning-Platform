// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPositionBody, usePositionRecorder, type PositionInput } from './use-position-recorder';
import { useActiveLearnTimer } from './use-active-learn-timer';

type FlushMock = (...args: [string, number, boolean]) => Promise<unknown>;
const SUB = '7a1b2c3d-0213-4000-8000-000000000213';

describe('buildPositionBody (normalisasi SPEC-007)', () => {
  it('DRILL membuang subtab/video/detik; hanya DRILL menyimpan indeks soal dan attempt', () => {
    const b = buildPositionBody(SUB, {
      activeTab: 'DRILL',
      subtab: 'VIDEO',
      videoId: 'dQw4w9WgXcQ',
      videoSec: 50,
      questionIndex: 3,
      attemptId: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
    });
    expect(b).toMatchObject({
      active_tab: 'DRILL',
      active_learn_subtab: null,
      active_video_id: null,
      video_progress_sec: 0,
      last_question_index: 3,
      active_attempt_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
    });
  });
  it('LEARN+VIDEO menyimpan id video valid dan detik bulat; id tak valid dibuang', () => {
    expect(buildPositionBody(SUB, { activeTab: 'LEARN', subtab: 'VIDEO', videoId: 'dQw4w9WgXcQ', videoSec: 222.9 })).toMatchObject({
      active_learn_subtab: 'VIDEO',
      active_video_id: 'dQw4w9WgXcQ',
      video_progress_sec: 222,
      last_question_index: null,
      active_attempt_id: null,
    });
    expect(buildPositionBody(SUB, { activeTab: 'LEARN', subtab: 'VIDEO', videoId: 'x', videoSec: 5 }).active_video_id).toBeNull();
  });
});

function Recorder({ onReady }: { onReady: (r: ReturnType<typeof usePositionRecorder>) => void }) {
  const r = usePositionRecorder(SUB);
  onReady(r);
  return null;
}

describe('usePositionRecorder', () => {
  let calls: Array<{ url: string; init: RequestInit }>;
  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ data: { updated_at: '2026-11-03T10:25:41.000Z' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  });
  afterEach(() => vi.useRealTimers());

  it('perubahan tab dikirim segera; pembaruan video di-throttle 5 detik dan hanya yang terakhir terkirim', async () => {
    let rec!: ReturnType<typeof usePositionRecorder>;
    render(<Recorder onReady={(r) => (rec = r)} />);
    const learn: PositionInput = { activeTab: 'LEARN', subtab: 'VIDEO', videoId: 'dQw4w9WgXcQ' };
    act(() => rec.record({ ...learn, videoSec: 10 }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/v1/me/last-learned');
    expect(calls[0]!.init.method).toBe('PUT');

    act(() => rec.record({ ...learn, videoSec: 15 }, { throttle: true }));
    act(() => rec.record({ ...learn, videoSec: 20 }, { throttle: true }));
    expect(calls).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[1]!.init.body))).toMatchObject({ video_progress_sec: 20, active_learn_subtab: 'VIDEO' });
  });

  it('tidak pernah mengirim field di luar kontrak (tanpa skor/status)', async () => {
    let rec!: ReturnType<typeof usePositionRecorder>;
    render(<Recorder onReady={(r) => (rec = r)} />);
    act(() => rec.record({ activeTab: 'MINI_TASK' }));
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        'active_attempt_id',
        'active_learn_subtab',
        'active_tab',
        'active_video_id',
        'last_question_index',
        'sub_module_id',
        'video_progress_sec',
      ].sort(),
    );
  });

  it('saat pagehide mengirim dengan keepalive', async () => {
    let rec!: ReturnType<typeof usePositionRecorder>;
    render(<Recorder onReady={(r) => (rec = r)} />);
    act(() => rec.record({ activeTab: 'LEARN', subtab: 'ARTICLE' }));
    expect(calls).toHaveLength(1);
    act(() => rec.record({ activeTab: 'LEARN', subtab: 'SLIDES' }, { throttle: true }));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.init.keepalive).toBe(true);
  });
});

function Timer({ enabled, flush, onReady }: {
  enabled: boolean;
  flush: (s: string, n: number, k: boolean) => Promise<unknown>;
  onReady: (t: ReturnType<typeof useActiveLearnTimer>) => void;
}) {
  const t = useActiveLearnTimer({ enabled, subtab: 'ARTICLE', onFlush: flush as never });
  onReady(t);
  return null;
}

describe('useActiveLearnTimer (SPEC-005 langkah 6)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('menghitung detik saat ada interaksi dan mengirim tiap 15 detik', async () => {
    const flush = vi.fn<FlushMock>(async () => ({}));
    render(<Timer enabled flush={flush} onReady={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith('ARTICLE', 15, false);
  });

  it('tidak menambah detik saat tab tersembunyi', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const flush = vi.fn<FlushMock>(async () => ({}));
    render(<Timer enabled flush={flush} onReady={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(flush).not.toHaveBeenCalled();
  });

  it('berhenti menambah setelah 60 detik tanpa interaksi, kecuali video PLAYING', async () => {
    const flush = vi.fn<FlushMock>(async () => ({}));
    let t!: ReturnType<typeof useActiveLearnTimer>;
    render(<Timer enabled flush={flush} onReady={(x) => (t = x)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    const sent = flush.mock.calls.reduce((n, c) => n + (c[1] as number), 0);
    expect(sent).toBeLessThanOrEqual(60);
    expect(sent).toBeGreaterThanOrEqual(45);
    act(() => t.setVideoPlaying(true));
    flush.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(flush.mock.calls.reduce((n, c) => n + (c[1] as number), 0)).toBeGreaterThanOrEqual(15);
  });

  it('kegagalan kirim diam-diam: detik dikembalikan dan dicoba lagi', async () => {
    const flush = vi.fn<FlushMock>().mockRejectedValueOnce(new Error('net')).mockResolvedValue({});
    render(<Timer enabled flush={flush} onReady={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[1]![1]).toBeGreaterThan(15);
  });

  it('tidak aktif (enabled=false) tidak menghitung', async () => {
    const flush = vi.fn<FlushMock>(async () => ({}));
    render(<Timer enabled={false} flush={flush} onReady={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(flush).not.toHaveBeenCalled();
  });
});
