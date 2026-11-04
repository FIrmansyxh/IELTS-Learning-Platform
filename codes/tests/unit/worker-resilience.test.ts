import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPurgeTasks } from '@/worker/registry';
import { AI_RECOVERY_INTERVAL_MS, startAiRecoveryLoop } from '@/worker/recovery';

const log = () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() });

describe('runPurgeTasks (F-12-03: isolasi galat per tugas retensi)', () => {
  it('tugas awal gagal -> tugas berikutnya tetap berjalan, lalu galat gabungan dilempar', async () => {
    const order: string[] = [];
    const tasks = [
      { name: 'a', run: async () => void order.push('a') },
      {
        name: 'b',
        run: async () => {
          order.push('b');
          throw new Error('boom');
        },
      },
      { name: 'purgeRecordings', run: async () => void order.push('purgeRecordings') },
      { name: 'purgeAiRawOutput', run: async () => void order.push('purgeAiRawOutput') },
    ];
    const l = log();
    await expect(runPurgeTasks(tasks, l)).rejects.toMatchObject({ name: 'AggregateError', message: expect.stringContaining('b') });
    expect(order).toEqual(['a', 'b', 'purgeRecordings', 'purgeAiRawOutput']);
    expect(l.error).toHaveBeenCalledTimes(1);
  });

  it('semua sukses -> tidak melempar', async () => {
    await expect(runPurgeTasks([{ name: 'x', run: async () => undefined }], log())).resolves.toBeUndefined();
  });
});

describe('startAiRecoveryLoop (F-12-02: pemulihan berkala, bukan harian)', () => {
  afterEach(() => vi.useRealTimers());

  it('interval pemulihan 1-5 menit', () => {
    expect(AI_RECOVERY_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
    expect(AI_RECOVERY_INTERVAL_MS).toBeLessThanOrEqual(5 * 60_000);
  });

  it('dipanggil tiap interval, tidak tumpang tindih, galat dicatat, dapat dihentikan', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const run = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(undefined);
    const l = log();
    const stop = startAiRecoveryLoop(run, l, String);
    await vi.advanceTimersByTimeAsync(AI_RECOVERY_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(AI_RECOVERY_INTERVAL_MS); // putaran 1 belum selesai -> dilewati
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(AI_RECOVERY_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(AI_RECOVERY_INTERVAL_MS);
    expect(l.warn).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(AI_RECOVERY_INTERVAL_MS * 3);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
