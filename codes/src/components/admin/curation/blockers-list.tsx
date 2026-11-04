import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { id } from '@/i18n/id';
import type { Blocker } from '@/lib/api/curation-contract';

const t = id.curation.blockers;

export function blockerTitle(code: string): string {
  return t.codes[code] ?? code;
}

const ASSET_CODES = new Set(['ASSET_UNVERIFIED', 'SOURCE_MISSING']);

/**
 * Tautan penghalang. `entity_type` dari server adalah PEMILIK penghalang (MODULE, SUB_MODULE, ASSESSMENT_SET), bukan aset.
 * Penghalang aset ditaut ke halaman Aset (detail aset bila server mengirim `asset_id` terstruktur, selain itu daftar belum diverifikasi);
 * lainnya ke sub-modul di kurikulum atau halaman set.
 */
export function blockerHref(b: Pick<Blocker, 'code' | 'entity_type' | 'entity_id'> & { detail?: string; asset_id?: string | null }): { href: string; label: string } | null {
  if (ASSET_CODES.has(b.code)) {
    return b.asset_id
      ? { href: `/admin/konten/aset?buka=${encodeURIComponent(b.asset_id)}`, label: t.assetLink }
      : { href: '/admin/konten/aset?belum=1', label: t.assetsUnverifiedLink };
  }
  const type = b.entity_type.toUpperCase();
  if (type === 'ASSESSMENT_SET') return { href: `/admin/konten/soal/${encodeURIComponent(b.entity_id)}`, label: id.curation.curriculum.openSet };
  if (type === 'SUB_MODULE') return { href: `/admin/konten/kurikulum?sub_modul=${encodeURIComponent(b.entity_id)}`, label: t.curriculumLink };
  if (type === 'MODULE') return { href: '/admin/konten/kurikulum', label: t.curriculumLink };
  return null;
}

/** Daftar penghalang publikasi (SPEC-004/018) dengan tautan ke aset atau kurikulum. */
export function BlockersList({ blockers }: { blockers: Blocker[] }) {
  if (blockers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.none}</p>;
  }
  return (
    <ul className="grid gap-2" aria-label={t.title}>
      {blockers.map((b, i) => {
        const link = blockerHref(b);
        return (
          <li key={`${b.code}-${b.entity_id}-${i}`} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">{blockerTitle(b.code)}</p>
                <p className="break-words text-muted-foreground">{b.detail}</p>
              </div>
            </div>
            {link ? (
              <Link href={link.href} className="min-h-8 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {link.label}
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
