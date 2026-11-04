import { type Passage, parsePassages, PassageParseError } from '@/lib/reading/parsePassages';

/** Menguraikan `passage_markdown` attempt; gagal/kosong menghasilkan `passages = null` + kode galat untuk tombol "Laporkan". */
export function parseAttemptPassages(markdown: string | null): { passages: Passage[] | null; error: string | null } {
  if (markdown === null) return { passages: null, error: null };
  try {
    const passages = parsePassages(markdown);
    if (passages.every((p) => p.paragraphs.length === 0)) return { passages: null, error: 'passage_empty' };
    return { passages, error: null };
  } catch (e) {
    return { passages: null, error: e instanceof PassageParseError ? e.code : 'passage_parse_failed' };
  }
}
