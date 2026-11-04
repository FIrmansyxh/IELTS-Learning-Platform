import { formatBand } from '@/components/band/band-display';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmt, id } from '@/i18n/id';
import type { SkillScore } from '@/lib/api/skills-contract';
import { orderedSkills, radarSummary } from './radar-chart';

const t = id.radar.table;
const pct = (n: number) => `${n.toFixed(2).replace('.', ',').replace(/,00$/, '')}%`;

function note(s: SkillScore): string | null {
  if (s.sample_size === 0) return t.none;
  if (s.estimated_band === null) return t.few;
  return null;
}

function sample(s: SkillScore): string {
  return fmt(s.skill === 'WRITING' || s.skill === 'SPEAKING' ? t.aiSample : t.objSample, { n: s.sample_size });
}

/** Alternatif tabel untuk radar: semua nilai tersedia tanpa membaca grafik (kartu pada mobile). */
export function RadarTable({ skills }: { skills: SkillScore[] }) {
  const rows = orderedSkills(skills);
  return (
    <div data-testid="radar-table" aria-label={radarSummary(skills)} role="group">
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{t.caption}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t.skill}</TableHead>
              <TableHead scope="col" className="text-right">
                {t.score}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t.band}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t.sample}
              </TableHead>
              <TableHead scope="col">{t.note}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.skill}>
                <TableCell className="font-medium">{id.radar.skills[s.skill]}</TableCell>
                <TableCell className="text-right tabular-nums">{s.score_percent === null ? '-' : pct(s.score_percent)}</TableCell>
                <TableCell className="text-right tabular-nums">{s.estimated_band === null ? '-' : formatBand(s.estimated_band)}</TableCell>
                <TableCell className="text-right tabular-nums">{s.sample_size}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1.5">
                    {s.is_proxy ? <Badge variant="outline">{t.proxy}</Badge> : null}
                    {note(s) ? <span className="text-muted-foreground">{note(s)}</span> : null}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-2 md:hidden" aria-label={t.caption}>
        {rows.map((s) => (
          <li key={s.skill} className="grid gap-1 rounded-lg border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{id.radar.skills[s.skill]}</span>
              <span className="font-bold tabular-nums">{s.estimated_band === null ? '-' : `${t.band} ${formatBand(s.estimated_band)}`}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-muted-foreground">
              <span>{s.score_percent === null ? t.none : `${t.score} ${pct(s.score_percent)}`}</span>
              <span>{sample(s)}</span>
            </div>
            {s.is_proxy ? <Badge variant="outline" className="w-fit">{t.proxy}</Badge> : null}
            {note(s) && s.sample_size > 0 ? <span className="text-muted-foreground">{note(s)}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
