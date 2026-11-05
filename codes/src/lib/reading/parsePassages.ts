export interface Paragraph {
  index: number;
  label: string | null;
  text: string;
}

export interface Passage {
  passage_no: number;
  title: string;
  paragraphs: Paragraph[];
}

export class PassageParseError extends Error {
  constructor(message: 'too_many_passages' | 'duplicate_paragraph_label' | string) {
    super(message);
    this.name = 'PassageParseError';
  }
}

/**
 * Parses IELTS reading passages separated by exact line `===PASSAGE===`.
 * Max 3 passages.
 * First non-empty line may be `# Judul`.
 * Paragraphs separated by blank lines. Paragraphs starting with `[X] ` (A-Z) get labeled.
 */
export function parsePassages(markdown: string): Passage[] {
  if (!markdown || !markdown.trim()) {
    return [];
  }

  // Normalize line endings
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split by exact line ===PASSAGE===
  const rawPassages = normalized.split(/\n===PASSAGE===\n|^===PASSAGE===\n|\n===PASSAGE===$/);
  
  // If there are more than 3 passages, throw error
  if (rawPassages.length > 3) {
    throw new PassageParseError('too_many_passages');
  }

  const passages: Passage[] = [];

  for (let pIdx = 0; pIdx < rawPassages.length; pIdx++) {
    const raw = rawPassages[pIdx]!.trim();
    if (!raw) {
      continue;
    }

    const passageNo = pIdx + 1;
    let title = `Teks ${passageNo}`;
    
    // Split into lines first to check if first non-empty line is a header `# Title`
    const lines = raw.split('\n');
    let titleLineIndex = -1;

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l]!.trim();
      if (!line) continue;
      const headerMatch = line.match(/^#\s+(.+)$/);
      if (headerMatch) {
        title = headerMatch[1]!.trim();
        titleLineIndex = l;
      }
      break;
    }

    // Body content without title line if present
    let bodyContent: string;
    if (titleLineIndex !== -1) {
      bodyContent = lines.slice(titleLineIndex + 1).join('\n').trim();
    } else {
      bodyContent = raw;
    }

    // Split body into paragraphs by blank lines
    const rawParagraphs = bodyContent
      ? bodyContent.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      : [];

    const paragraphs: Paragraph[] = [];
    const seenLabels = new Set<string>();

    for (let i = 0; i < rawParagraphs.length; i++) {
      const pText = rawParagraphs[i]!;
      const labelMatch = pText.match(/^\[([A-Z])\]\s+/);

      let label: string | null = null;
      let text = pText;

      if (labelMatch) {
        label = labelMatch[1]!;
        if (seenLabels.has(label)) {
          throw new PassageParseError('duplicate_paragraph_label');
        }
        seenLabels.add(label);
        text = pText.slice(labelMatch[0].length).trim();
      }

      paragraphs.push({
        index: i,
        label,
        text,
      });
    }

    passages.push({
      passage_no: passageNo,
      title,
      paragraphs,
    });
  }

  return passages;
}
