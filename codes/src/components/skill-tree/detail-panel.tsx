import Link from 'next/link';
import { CrownBadge } from '@/components/gamification/crown-badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { id } from '@/i18n/id';
import { StatusBadge } from './status';
import type { Selection } from './sub-module-node';

/** Panel detail sub-modul (desktop >= lg, sticky). Memperbarui diri saat node difokuskan/di-hover. */
export function DetailPanel({ selection }: { selection: Selection | null }) {
  return (
    <aside
      aria-label={id.tree.detailTitle}
      aria-live="polite"
      className="sticky top-6 hidden rounded-lg border bg-card p-4 shadow-sm lg:block"
    >
      <h2 className="mb-3 text-base font-semibold">{id.tree.detailTitle}</h2>
      {!selection ? (
        <p className="text-sm text-muted-foreground">{id.tree.detailEmpty}</p>
      ) : (
        <div className="grid gap-3">
          <div>
            <p className="text-xs text-muted-foreground tabular-nums">{selection.node.sub_module_code}</p>
            <p className="font-medium" lang="en">
              {selection.node.title}
            </p>
          </div>
          {selection.node.content_state === 'COMING_SOON' ? (
            <p className="text-sm text-muted-foreground">{id.tree.comingSoon}</p>
          ) : (
            <>
              <StatusBadge status={selection.node.status} />
              <div className="flex items-center gap-3">
                <Progress
                  value={selection.node.progress_percent}
                  aria-label={id.tree.progressLabel.replace('{name}', selection.node.title)}
                  className="bg-border"
                />
                <span className="text-sm tabular-nums">{selection.node.progress_percent}%</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {id.tree.bestScore}:{' '}
                <span className="font-medium text-foreground tabular-nums">{selection.node.best_score_percent}%</span>
              </p>
              <CrownBadge crown={selection.node.mastery_crown} scorePercent={selection.node.best_score_percent} />
              {selection.node.has_mini_task ? (
                <p className="text-sm text-muted-foreground">{id.tree.miniTask}</p>
              ) : null}
              {selection.node.lock_reason ? (
                <p className="text-sm">{selection.node.lock_reason.message}</p>
              ) : (
                <Button asChild size="sm">
                  <Link href={`/belajar/${selection.node.sub_module_code}`}>{id.tree.open}</Link>
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
