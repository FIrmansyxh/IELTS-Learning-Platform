'use client';

import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLeaveProfile } from '@/hooks/use-auth';
import { id } from '@/i18n/id';

/** Tombol "Ganti profil" (SPEC-025): menghapus sesi dan kembali ke pemilih profil. */
export function SwitchProfileButton() {
  const router = useRouter();
  const leave = useLeaveProfile();

  function go() {
    leave.mutate(undefined, {
      onSuccess: () => router.replace('/pilih-profil?pilih=1'),
      onError: () => toast.error(id.profiles.switchFailed),
    });
  }

  return (
    <Button variant="outline" loading={leave.isPending} onClick={go}>
      <Users aria-hidden="true" />
      {id.profiles.switchButton}
    </Button>
  );
}
