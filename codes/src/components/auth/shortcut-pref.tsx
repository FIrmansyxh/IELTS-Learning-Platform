'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useShortcutPref } from '@/hooks/use-shortcut-pref';
import { id } from '@/i18n/id';

/** Pengaturan pintasan keyboard latihan (design-system 7: pintasan dapat dimatikan). */
export function ShortcutPref() {
  const [on, setOn] = useShortcutPref();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor="pref-shortcuts" className="text-base font-semibold">
          {id.quiz.shortcutsPref}
        </Label>
        <p id="pref-shortcuts-help" className="text-sm text-muted-foreground">
          {id.quiz.shortcutsPrefHelp}
        </p>
      </div>
      <Switch id="pref-shortcuts" checked={on} onCheckedChange={setOn} aria-describedby="pref-shortcuts-help" />
    </div>
  );
}
