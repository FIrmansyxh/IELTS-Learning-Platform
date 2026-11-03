'use client';

import Link from 'next/link';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fmt, id } from '@/i18n/id';

/**
 * Tombol "Uji Kompetensi" pada peta (SPEC-008): membuka Dialog konfirmasi (ujian berwaktu, ambang lulus)
 * sebelum menuju layar pra-ujian `/ujian/mulai/{set}`.
 */
export function SkipTestButton({
  assessmentSetId,
  thresholdPercent,
  size = 'default',
  className,
}: {
  assessmentSetId: string;
  thresholdPercent: number;
  size?: 'default' | 'sm';
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        {id.tree.skipTest}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{id.exam.skipDialog.title}</DialogTitle>
            <DialogDescription>{fmt(id.exam.skipDialog.body, { n: thresholdPercent })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {id.common.cancel}
            </Button>
            <Button asChild>
              <Link href={`/ujian/mulai/${assessmentSetId}`}>{id.exam.skipDialog.confirm}</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
