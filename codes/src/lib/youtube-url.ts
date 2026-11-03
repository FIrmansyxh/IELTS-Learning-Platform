import { YOUTUBE_HOSTS } from '@/contracts/assets';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type ParsedYoutube = { hostAllowed: boolean; videoId: string | null };

/** Parse URL YouTube untuk prefill/validasi UX (server tetap memvalidasi host dan ID). */
export function parseYoutubeUrl(raw: string): ParsedYoutube {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { hostAllowed: false, videoId: null };
  }
  if (url.protocol !== 'https:') return { hostAllowed: false, videoId: null };
  const hostAllowed = (YOUTUBE_HOSTS as readonly string[]).includes(url.hostname);
  if (!hostAllowed) return { hostAllowed, videoId: null };
  let candidate: string | null = null;
  if (url.hostname === 'youtu.be') candidate = url.pathname.slice(1).split('/')[0] ?? null;
  else if (url.pathname === '/watch') candidate = url.searchParams.get('v');
  else {
    const m = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname);
    candidate = m?.[1] ?? null;
  }
  return { hostAllowed, videoId: candidate && VIDEO_ID.test(candidate) ? candidate : null };
}
