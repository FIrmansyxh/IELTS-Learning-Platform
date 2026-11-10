'use client';

import * as React from 'react';

/**
 * Status buka/tutup yang diingat per perangkat (localStorage). Nilai awal selalu `initial` agar render server dan
 * klien sama (tanpa hydration mismatch); nilai tersimpan dibaca setelah mount. Semua akses penyimpanan dibungkus
 * try/catch (mode privat atau data situs diblokir tetap berfungsi tanpa ingatan).
 */
export function usePersistentToggle(key: string, initial: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = React.useState(initial);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === '1') setValue(true);
      else if (raw === '0') setValue(false);
    } catch {
      /* abaikan: tanpa penyimpanan */
    }
  }, [key]);

  const update = React.useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
      } catch {
        /* abaikan */
      }
    },
    [key],
  );

  return [value, update];
}
