'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api/auth';
import { profilesApi } from '@/lib/api/profiles';
import type { User } from '@/lib/api/types';

export const ME_KEY = ['me'] as const;

/** Profil aktif. 401 berarti belum ada profil terpilih (ditangani AuthGate). */
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

/** Ganti profil: hapus cookie sesi dan seluruh cache agar data profil lama tidak terbawa. */
export function useLeaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: profilesApi.leave,
    onSuccess: () => {
      qc.clear();
    },
  });
}
