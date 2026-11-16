'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Teks bacaan Reading (bank soal) dirender sebagai Markdown: judul `##`/`###`, paragraf, daftar, tabel.
 * Paragraf berlabel `[A] ` ditampilkan dengan huruf tebal seperti di lembar ujian. HTML mentah tidak dirender.
 */
export function labelParagraphs(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n').replace(/^\[([A-Z])\]\s+/gm, '**$1** ');
}

const components: Components = {
  h1: ({ children }) => <h2 className="mb-2 mt-1 text-lg font-bold">{children}</h2>,
  h2: ({ children }) => <h3 className="mb-2 mt-1 text-base font-bold">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-4 text-sm font-semibold">{children}</h4>,
  h4: ({ children }) => <h5 className="mb-1 mt-3 text-sm font-semibold">{children}</h5>,
  p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1">
        {children}
      </table>
    </div>
  ),
};

export function PassageMarkdown({ markdown, className }: { markdown: string; className?: string }) {
  const source = React.useMemo(() => labelParagraphs(markdown), [markdown]);
  return (
    <div className={cn('text-sm', className)} lang="en" data-testid="passage-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {source}
      </ReactMarkdown>
    </div>
  );
}
