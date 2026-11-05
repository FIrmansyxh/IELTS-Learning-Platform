'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { id } from '@/i18n';

export interface RecordingConsentDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onConsentSuccess: () => void;
  retentionDays?: number;
}

export function RecordingConsentDialog({
  open,
  onOpenChange,
  onConsentSuccess,
  retentionDays = 90,
}: RecordingConsentDialogProps) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consentBody = id.speaking.consent.body.replace(
    '{days}',
    retentionDays.toString()
  );

  async function handleAgree() {
    if (!agreed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/me/recording-consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(
          body.error?.message ?? 'Gagal menyimpan persetujuan rekaman.'
        );
      }

      onConsentSuccess();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat menyimpan persetujuan.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{id.speaking.consent.title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-2 leading-relaxed">
            {consentBody}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-start space-x-2">
            <Checkbox
              id="consent-checkbox"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
            />
            <label
              htmlFor="consent-checkbox"
              className="text-xs font-medium leading-normal cursor-pointer select-none text-foreground"
            >
              {id.speaking.consent.checkbox}
            </label>
          </div>

          <div className="text-xs">
            <Link
              href="/profil"
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              {id.speaking.consent.settingsLink} →
            </Link>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-end gap-2">
          <Button
            type="button"
            disabled={!agreed || loading}
            onClick={handleAgree}
          >
            {loading ? 'Menyimpan...' : id.speaking.consent.agreeBtn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
