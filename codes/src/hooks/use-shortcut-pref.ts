'use client';

import * as React from 'react';

const KEY = 'drill.shortcuts';
const EVENT = 'drill-shortcuts-change';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Preferensi pintasan keyboard latihan (default aktif). Hanya kenyamanan per peramban, bukan data akun. */
export function useShortcutPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = React.useState(true);
  React.useEffect(() => {
    setOn(read());
    const sync = () => setOn(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const set = React.useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(KEY, next ? 'on' : 'off');
    } catch {
      /* penyimpanan diblokir: pilihan berlaku untuk sesi ini saja */
    }
    setOn(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [on, set];
}
