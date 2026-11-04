'use client';

import * as React from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** true bila pengguna meminta gerak berkurang. Lingkungan tanpa matchMedia (SSR/jsdom) dianggap TIDAK mengurangi. */
export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false),
    () => false,
  );
}
