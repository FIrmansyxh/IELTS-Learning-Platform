'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api/auth';
import type { User } from '@/lib/api/types';

export const ME_KEY = ['me'] as const;

/** Sesi saat ini. 401 berarti belum masuk (ditangani AuthGate). */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: ({ signal }) => authApi.me(signal),
    staleTime: 60_000,
  });
}

export function useSetMe() {
  const qc = useQueryClient();
  return (user: User) => qc.setQueryData(ME_KEY, user);
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Bersihkan seluruh cache agar data pengguna tidak bocor ke sesi berikutnya.
      qc.clear();
    },
  });
}
