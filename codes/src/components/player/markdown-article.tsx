'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import { id } from '@/i18n/id';
import { cn } from '@/lib/utils';
import { Callout, type CalloutVariant } from './callout';

/* ---------- plugin directive (tanpa dependensi tambahan) ---------- */

type MdNode = {
  type: string;
  name?: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
};

const CALLOUTS: readonly string[] = ['tips-examiner', 'kesalahan-umum'];

function plainText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(plainText).join('');
}

function visitDirectives(node: MdNode, seen: Map<string, number>): void {
  const kids = node.children;
  if (!kids) return;
  for (let i = 0; i < kids.length; i += 1) {
    const child = kids[i]!;
    if (child.type === 'textDirective' || child.type === 'leafDirective') {
      // ":" pada teks biasa (mis. "rasio 3:ab") bukan directive; kembalikan sebagai teks.
      const label = plainText(child);
      kids[i] = {
        type: 'text',
        value: `${child.type === 'textDirective' ? ':' : '::'}${child.name ?? ''}${label ? `[${label}]` : ''}`,
      };
      continue;
    }
    if (child.type === 'containerDirective') {
      const name = child.name ?? '';
      if (CALLOUTS.includes(name)) {
        // Buang label directive ("[judul]"); label ditampilkan komponen.
        child.children = (child.children ?? []).filter((c) => !(c.data && c.data.directiveLabel));
        child.data = { ...(child.data ?? {}), hName: 'div', hProperties: { 'data-callout': name } };
      } else {
        child.data = { ...(child.data ?? {}), hName: 'div' };
      }
    }
    if (child.type === 'heading' && typeof (child as { depth?: number }).depth === 'number' && (child as { depth?: number }).depth! <= 3) {
      const hid = uniqueId(slugify(stripInline(plainText(child))), seen);
      child.data = { ...(child.data ?? {}), hProperties: { id: hid } };
    }
    visitDirectives(child, seen);
  }
}

function remarkCallouts() {
  return (tree: MdNode) => visitDirectives(tree, new Map());
}

/* ---------- util ---------- */

export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return s || 'bagian';
}

export type TocItem = { id: string; text: string; level: 2 | 3 };

function stripInline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

function uniqueId(base: string, seen: Map<string, number>): string {
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

/** Heading h1-h3 di luar blok kode, dengan id unik berurutan (sama dengan id pada render). */
export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const seen = new Map<string, number>();
  let fence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    // h1 dirender sebagai h2 (halaman sudah punya satu h1).
    const level = m[1]!.length === 3 ? 3 : 2;
    const text = stripInline(m[2]!);
    items.push({ id: uniqueId(slugify(text), seen), text, level });
  }
  return items;
}

/** Hanya https:, http:, mailto:, anchor internal, dan path relatif yang lolos. Selain itu tanpa href. */
export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('#')) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const u = new URL(url);
    return ['https:', 'http:', 'mailto:'].includes(u.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

/* ---------- komponen ---------- */

function buildComponents(): Components {
  const heading = (Tag: 'h2' | 'h3' | 'h4', cls: string) =>
    function Heading({ children, id: hid }: { children?: React.ReactNode; id?: string }) {
      return (
        <Tag id={hid} className={cn('scroll-mt-24 font-heading font-bold', cls)}>
          {children}
        </Tag>
      );
    };
  return {
    h1: heading('h2', 'mt-8 mb-3 text-2xl'),
    h2: heading('h2', 'mt-8 mb-3 text-2xl'),
    h3: heading('h3', 'mt-6 mb-2 text-xl'),
    h4: heading('h4', 'mt-5 mb-2 text-lg'),
    h5: heading('h4', 'mt-4 mb-2 text-base'),
    h6: heading('h4', 'mt-4 mb-2 text-base'),
    p: ({ children }) => <p className="my-3 max-w-[110ch]">{children}</p>,
    ul: ({ children }) => <ul className="my-3 max-w-[110ch] list-disc space-y-1 pl-6">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 max-w-[110ch] list-decimal space-y-1 pl-6">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-4 border-border pl-4 text-muted-foreground">{children}</blockquote>
    ),
    hr: () => <hr className="my-6 border-border" />,
    pre: ({ children }) => (
      <pre className="my-4 overflow-x-auto rounded-md border bg-muted p-3 font-mono text-sm leading-6">{children}</pre>
    ),
    code: ({ children, className }) => (
      <code className={cn('rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]', className)}>{children}</code>
    ),
    // Tabel mengisi lebar penuh dan teks sel membungkus (tanpa geser pada layar lebar); wadah scroll tetap ada sebagai
    // cadangan untuk tabel yang sangat lebar dan dapat difokus agar bisa digulir dengan keyboard.
    table: ({ children }) => (
      <div
        role="region"
        tabIndex={0}
        aria-label={id.player.tableScroll}
        className="my-4 max-w-full overflow-x-auto rounded-md border focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full table-auto border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b bg-muted px-3 py-2 text-left align-top font-semibold [overflow-wrap:anywhere]">{children}</th>,
    td: ({ children }) => <td className="border-b px-3 py-2 align-top [overflow-wrap:anywhere]">{children}</td>,
    a: ({ href, children }) => {
      const safe = safeHref(href);
      if (!safe) return <span>{children}</span>;
      const external = !safe.startsWith('#') && !safe.startsWith('/');
      return (
        <a
          href={safe}
          className="font-medium text-primary underline underline-offset-2"
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {children}
        </a>
      );
    },
    // Gambar Markdown dibuang: visual disampaikan lewat Slide.
    img: () => null,
    div: (props) => {
      const variant = (props as { 'data-callout'?: string })['data-callout'];
      if (variant && CALLOUTS.includes(variant)) {
        return <Callout variant={variant as CalloutVariant}>{props.children}</Callout>;
      }
      return <div>{props.children}</div>;
    },
  };
}

/**
 * Artikel Markdown aman: tanpa HTML mentah (tidak ada rehype-raw), tautan disaring skema,
 * gambar dibuang, callout lewat directive blok.
 */
function MarkdownArticleBase({ markdown, className }: { markdown: string; className?: string }) {
  const components = React.useMemo(() => buildComponents(), []);
  return (
    <div className={cn('w-full max-w-none text-base leading-[1.7]', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDirective, remarkCallouts]}
        components={components}
        urlTransform={(url) => safeHref(url) ?? ''}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownArticle = React.memo(MarkdownArticleBase);
