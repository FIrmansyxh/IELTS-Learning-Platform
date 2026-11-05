'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useMe, useSetMe } from '@/hooks/use-auth';

export function RecordingPreferencesCard() {
  const me = useMe();
  const setMe = useSetMe();
  const [loading, setLoading] = useState(false);

  if (!me.data) return null;

  const keepRecordings = me.data.keep_recordings ?? true;
  const consentGiven = Boolean(me.data.consent_recording_at);

  const handleToggle = async (checked: boolean) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/me/recording-preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keep_recordings: checked }),
      });

      if (!res.ok) {
        throw new Error('Gagal memperbarui preferensi rekaman.');
      }

      const body = (await res.json()) as {
        data: { user: typeof me.data };
      };
      setMe(body.data.user);
      toast.success('Pengaturan rekaman berhasil disimpan.');
    } catch {
      toast.error('Gagal memperbarui preferensi rekaman.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rekaman Suara</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5 max-w-sm">
            <Label htmlFor="keep-recordings-switch" className="text-sm font-medium">
              Simpan rekaman saya
            </Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Bila dimatikan, berkas rekaman suara Anda akan segera dihapus setelah transkrip dibuat. Transkrip dan skor tetap tersimpan.
            </p>
          </div>
          <Switch
            id="keep-recordings-switch"
            checked={keepRecordings}
            disabled={loading}
            onCheckedChange={handleToggle}
          />
        </div>

        <div className="pt-2 border-t border-border/60 flex flex-col gap-1 text-muted-foreground">
          <p>
            Status persetujuan:{' '}
            <span className="font-semibold text-foreground">
              {consentGiven ? 'Telah Disetujui' : 'Belum Disetujui'}
            </span>
          </p>
          <p>
            Masa simpan berkas rekaman adalah 90 hari sebelum dihapus otomatis secara permanen.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
