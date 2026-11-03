import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoItem } from '@/contracts/player';
import { VideoCard } from './video-card';
import { effectiveEnd, effectiveStart, youtubeWatchUrl } from './youtube';

type Opts = {
  host: string;
  videoId: string;
  playerVars: Record<string, number | string>;
  events: { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void };
};
const created: Opts[] = [];
let currentTime = 0;

vi.mock('./youtube', async (orig) => {
  const real = await orig<typeof import('./youtube')>();
  return {
    ...real,
    loadYouTubeApi: vi.fn(async () => ({
      Player: class {
        constructor(el: HTMLElement, opts: Opts) {
          created.push(opts);
          const iframe = document.createElement('iframe');
          iframe.src = `https://www.youtube-nocookie.com/embed/${opts.videoId}`;
          el.replaceWith(iframe);
          queueMicrotask(() => opts.events.onReady?.());
        }
        destroy() {}
        getCurrentTime() {
          return currentTime;
        }
        getIframe() {
          return document.querySelector('iframe')!;
        }
      },
    })),
  };
});

const video = (over: Partial<VideoItem> = {}): VideoItem => ({
  asset_id: 'c1d2e3f4-0001-4000-8000-0000000000a1',
  video_id: 'dQw4w9WgXcQ',
  title: 'Cara Cepat',
  instructor_channel: 'Kampung Inggris LC',
  language: 'ID',
  start_sec: 95,
  end_sec: 420,
  ...over,
});

beforeEach(() => {
  created.length = 0;
  currentTime = 0;
});

describe('VideoCard', () => {
  it('membangun player dari video_id valid dengan host nocookie, start/end, rel=0, playsinline, origin', async () => {
    render(<VideoCard video={video()} resumeAt={null} onPlayingChange={vi.fn()} onPosition={vi.fn()} />);
    await waitFor(() => expect(created).toHaveLength(1));
    const o = created[0]!;
    expect(o.host).toBe('https://www.youtube-nocookie.com');
    expect(o.videoId).toBe('dQw4w9WgXcQ');
    expect(o.playerVars).toMatchObject({ start: 95, end: 420, rel: 0, playsinline: 1, origin: window.location.origin });
    await waitFor(() => expect(document.querySelector('iframe')).toHaveAttribute('title', 'Video: Cara Cepat'));
    expect(screen.getByText(/Bagian 01:35–07:00/)).toBeInTheDocument();
    for (const f of document.querySelectorAll('iframe')) {
      expect(new URL(f.getAttribute('src')!).host).toBe('www.youtube-nocookie.com');
    }
  });

  it('video_id korup: player tidak dibuat, pesan "Video tidak dapat dimuat", tanpa iframe', async () => {
    render(<VideoCard video={video({ video_id: 'bad id<script>' })} resumeAt={null} onPlayingChange={vi.fn()} onPosition={vi.fn()} />);
    expect(screen.getByText('Video tidak dapat dimuat')).toBeInTheDocument();
    await Promise.resolve();
    expect(created).toHaveLength(0);
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('link', { name: /Buka di YouTube/ })).toBeNull();
  });

  it('melaporkan posisi saat dijeda dan menandai PLAYING untuk penghitung waktu aktif', async () => {
    const onPlaying = vi.fn();
    const onPos = vi.fn();
    render(<VideoCard video={video()} resumeAt={222} onPlayingChange={onPlaying} onPosition={onPos} />);
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]!.playerVars.start).toBe(222);
    act(() => created[0]!.events.onStateChange?.({ data: 1 }));
    expect(onPlaying).toHaveBeenCalledWith('dQw4w9WgXcQ', true);
    currentTime = 230.7;
    act(() => created[0]!.events.onStateChange?.({ data: 2 }));
    expect(onPlaying).toHaveBeenLastCalledWith('dQw4w9WgXcQ', false);
    expect(onPos).toHaveBeenCalledWith('dQw4w9WgXcQ', 230);
  });

  it('galat player memunculkan tautan "Buka di YouTube" dengan waktu mulai dan tombol coba lagi', async () => {
    render(<VideoCard video={video()} resumeAt={null} onPlayingChange={vi.fn()} onPosition={vi.fn()} />);
    await waitFor(() => expect(created).toHaveLength(1));
    act(() => created[0]!.events.onError?.({ data: 150 }));
    const link = await screen.findByRole('link', { name: /Buka di YouTube/ });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=95s');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});

describe('aturan waktu video', () => {
  it('t di luar rentang kembali ke start_sec; end <= start diabaikan', () => {
    expect(effectiveStart(95, 420, 222)).toBe(222);
    expect(effectiveStart(95, 420, 500)).toBe(95);
    expect(effectiveStart(95, 420, null)).toBe(95);
    expect(effectiveStart(95, 420, 10)).toBe(95);
    expect(effectiveEnd(95, 50)).toBeNull();
    expect(effectiveEnd(95, 420)).toBe(420);
    expect(youtubeWatchUrl('dQw4w9WgXcQ', 12.9)).toContain('&t=12s');
  });
});
