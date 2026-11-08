import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  writing: vi.fn(async () => {}),
  speaking: vi.fn(async () => {}),
  stt: vi.fn(async () => {}),
  purge: vi.fn(async () => {}),
}));

vi.mock('@/server/ai/pipeline', () => ({ processWritingEvaluation: m.writing }));
vi.mock('@/server/ai/speaking-pipeline', () => ({
  processSpeakingEvaluation: m.speaking,
  processSttTranscription: m.stt,
}));
vi.mock('@/server/jobs/purge', () => ({
  purgeTasks: [
    { name: 'a', run: m.purge },
    { name: 'b', run: m.purge },
  ],
}));

import { jobHandlers } from '@/server/jobs/registry';
import { QUEUE_NAMES } from '@/server/jobs/queues';

const log = { info: vi.fn() } as never;

describe('jobs/registry (dispatch antrean)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('setiap antrean terdaftar punya handler', () => {
    for (const q of QUEUE_NAMES) expect(typeof jobHandlers[q]).toBe('function');
  });

  it('ai-grade-writing meneruskan submission_id dan async_job_id, melewati job tanpa submission_id', async () => {
    await jobHandlers['ai-grade-writing'](
      [
        { id: '1', name: 'x', data: { submission_id: 's1', async_job_id: 'j1' } },
        { id: '2', name: 'x', data: {} },
      ],
      { log },
    );
    expect(m.writing).toHaveBeenCalledTimes(1);
    expect(m.writing).toHaveBeenCalledWith('s1', 'j1');
  });

  it('stt-transcribe dan ai-grade-speaking memakai pipeline masing-masing, berurutan', async () => {
    await jobHandlers['stt-transcribe']([{ id: '1', name: 'x', data: { submission_id: 'a' } }], { log });
    await jobHandlers['ai-grade-speaking'](
      [
        { id: '2', name: 'x', data: { submission_id: 'b', async_job_id: 'jb' } },
        { id: '3', name: 'x', data: { submission_id: 'c' } },
      ],
      { log },
    );
    expect(m.stt).toHaveBeenCalledWith('a', undefined);
    expect(m.speaking.mock.calls).toEqual([
      ['b', 'jb'],
      ['c', undefined],
    ]);
    expect(m.writing).not.toHaveBeenCalled();
  });

  it('galat pipeline merambat (agar antrean menandai job gagal/retry)', async () => {
    m.writing.mockRejectedValueOnce(new Error('boom'));
    await expect(
      jobHandlers['ai-grade-writing']([{ id: '1', name: 'x', data: { submission_id: 's' } }], { log }),
    ).rejects.toThrow('boom');
  });

  it('retention-purge menjalankan semua tugas purge', async () => {
    await jobHandlers['retention-purge']([], { log });
    expect(m.purge).toHaveBeenCalledTimes(2);
  });
});
