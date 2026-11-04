'use client';

import type * as React from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const COLORS = ['var(--color-crown-gold)', 'var(--color-primary)', 'var(--color-secondary)', 'var(--color-streak)'];
const PIECES = Array.from({ length: 14 }, (_, i) => ({
  left: 8 + ((i * 6.3) % 84),
  x: ((i % 5) - 2) * 14,
  r: 120 + i * 37,
  delay: (i % 4) * 40,
  color: COLORS[i % COLORS.length]!,
}));

/**
 * Confetti halus satu kali (maks. 1,2 detik), dekoratif (`aria-hidden`). Tidak dirender sama sekali saat
 * `prefers-reduced-motion` (design-system 5.18, 6). Dipakai hanya saat mahkota berubah menjadi Gold.
 */
export function ConfettiBurst() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <div aria-hidden="true" data-testid="confetti" className="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0 block h-2 w-1.5 rounded-[1px]"
          style={
            {
              left: `${p.left}%`,
              backgroundColor: p.color,
              animationDelay: `${p.delay}ms`,
              '--confetti-x': `${p.x}px`,
              '--confetti-r': `${p.r}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
