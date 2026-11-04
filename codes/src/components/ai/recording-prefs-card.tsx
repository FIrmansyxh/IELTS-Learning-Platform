'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSetMe } from '@/hooks/use-auth';
import { fmt, id } from '@/i18n/id';
import { aiApi } from '@/lib/api/ai';
import { apiErrorMessage } from '@/lib/api/errors';
import type { User } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { useAiStatus } from './use-ai';

/** Card "Rekaman Suara" di /profil: Switch simpan rekaman, teks retensi, status persetujuan. */
export function RecordingPrefsCard({ user }: { user: User }) {
  const setMe = useSetMe();
  const status = useAiStatus();
  const save = useMutation({
    mutationFn: (keep: boolean) => aiApi.setKeepRecordings(keep),
    onSuccess: (updated) => {
      setMe(updated);
      toast.success(id.profile.recording.saved);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const days = status.data?.recording_retention_days;
  return (
    <Card data-testid="recording-prefs">
      <CardHeader>
        <CardTitle>{id.profile.recording.title}</CardTitle>
        {days ? <CardDescription>{fmt(id.profile.recording.retention, { n: days })}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <Label htmlFor="keep-recordings" className="min-h-6 text-base">
              {id.profile.recording.keepLabel}
            </Label>
            <p id="keep-recordings-help" className="text-sm text-muted-foreground">
              {id.profile.recording.keepHelp}
            </p>
          </div>
          <Switch
            id="keep-recordings"
            checked={user.keep_recordings}
            disabled={save.isPending}
            aria-describedby="keep-recordings-help"
            onCheckedChange={(v) => save.mutate(v)}
          />
        </div>
        <p className="text-sm text-muted-foreground" data-testid="consent-status">
          {user.consent_recording_at
            ? fmt(id.profile.recording.consentGiven, { date: formatDate(user.consent_recording_at) })
            : id.profile.recording.consentNone}
        </p>
      </CardContent>
    </Card>
  );
}
