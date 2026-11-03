'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useLogout } from '@/hooks/use-auth';
import { id } from '@/i18n/id';

/** Tombol destructive "Keluar" dengan Dialog konfirmasi (SPEC-001 /profil). */
export function LogoutButton() {
  const router = useRouter();
  const logout = useLogout();
  const [open, setOpen] = React.useState(false);

  function confirm() {
    logout.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        router.replace('/masuk');
      },
      onError: () => toast.error(id.auth.logout.failed),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <LogOut aria-hidden="true" />
          {id.auth.logout.button}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{id.auth.logout.confirmTitle}</DialogTitle>
          <DialogDescription>{id.auth.logout.confirmBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{id.common.cancel}</Button>
          </DialogClose>
          <Button variant="destructive" loading={logout.isPending} onClick={confirm}>
            {id.auth.logout.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
