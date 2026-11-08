export const ACCENTS = ['UK', 'US', 'AU'] as const;
export type Accent = (typeof ACCENTS)[number];

export const PART_CODE_RE = /^GT-L-S([1-4])-(\d{3})$/;
// eslint-disable-next-line security/detect-unsafe-regex
export const BANK_CODE_RE = /^GT-[A-Z0-9]+(-[A-Z0-9]+)*$/;
// eslint-disable-next-line security/detect-unsafe-regex
export const PAUSE_RE = /^\[pause\s+([0-9]+(?:\.[0-9]+)?)s\]$/;
export const UTTERANCE_RE = /^\[([A-F])\]\s+(.+)$/;

export interface ListeningScriptFrontMatter {
  part_code: string;
  part_no: number;
  title: string;
  accent: Accent;
  bank_code: string;
  voices: Record<string, string>;
  speed: Record<string, number>;
  target_duration_sec?: number;
}

export interface UtteranceItem {
  kind: 'UTTERANCE';
  lineNo: number;
  speaker: string;
  text: string;
}

export interface PauseItem {
  kind: 'PAUSE';
  lineNo: number;
  durationSec: number;
}

export type ScriptItem = UtteranceItem | PauseItem;

export interface ParsedListeningScript {
  meta: ListeningScriptFrontMatter;
  items: ScriptItem[];
  utterances: UtteranceItem[];
  pauses: PauseItem[];
  usedSpeakers: string[];
}

export interface ScriptIssue {
  code:
    | 'duplicate_voice'
    | 'speed_out_of_range'
    | 'speaker_without_voice'
    | 'voice_without_speaker'
    | 'pause_invalid'
    | 'line_unparseable'
    | 'speaker_count_invalid'
    | 'part_no_mismatch'
    | 'unknown_front_matter_key'
    | 'script_too_long'
    | 'invalid_yaml'
    | 'missing_front_matter';
  message: string;
  lineNo?: number;
}

const ALLOWED_FM_KEYS = new Set([
  'part_code',
  'part_no',
  'title',
  'accent',
  'bank_code',
  'voices',
  'speed',
  'target_duration_sec',
]);

/**
 * Mem-parse front-matter YAML sederhana tanpa dependensi eksternal besar.
 */
function parseSimpleYaml(yamlStr: string): { data: Record<string, unknown>; error?: string } {
  const lines = yamlStr.split(/\r?\n/);
  const res: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let subObj: Record<string, unknown> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check indentation for map items
    if (rawLine.startsWith('  ') && currentKey && subObj) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) return { data: {}, error: `Format YAML tidak valid pada baris ${i + 1}` };
      const subKey = trimmed.slice(0, colonIdx).trim();
      let subVal: unknown = trimmed.slice(colonIdx + 1).trim();
      if (subVal !== '' && !Number.isNaN(Number(subVal))) {
        subVal = Number(subVal);
      }
      subObj[subKey] = subVal;
      continue;
    }

    if (currentKey && subObj) {
      res[currentKey] = subObj;
      currentKey = null;
      subObj = null;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) return { data: {}, error: `Format YAML tidak valid pada baris ${i + 1}` };
    const k = trimmed.slice(0, colonIdx).trim();
    const vStr = trimmed.slice(colonIdx + 1).trim();

    if (vStr === '') {
      currentKey = k;
      subObj = {};
      res[k] = subObj;
    } else {
      let v: unknown = vStr;
      if (!Number.isNaN(Number(vStr)) && vStr !== '') {
        v = Number(vStr);
      }
      res[k] = v;
    }
  }

  return { data: res };
}

/**
 * Parser dan validator skrip Listening (SPEC-024 D2).
 */
export function parseListeningScript(content: string): { script?: ParsedListeningScript; issues: ScriptIssue[] } {
  const issues: ScriptIssue[] = [];

  // 1. Ekstrak front-matter
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    issues.push({ code: 'missing_front_matter', message: 'Skrip wajib memuat front-matter di antara tanda ---.' });
    return { issues };
  }

  const rawYaml = match[1];
  const bodyText = match[2];
  const fmLineCount = rawYaml.split(/\r?\n/).length + 2; // +2 for opening & closing ---

  const { data: rawFm, error: yamlErr } = parseSimpleYaml(rawYaml);
  if (yamlErr) {
    issues.push({ code: 'invalid_yaml', message: yamlErr });
    return { issues };
  }

  // Cek unknown_front_matter_key
  for (const k of Object.keys(rawFm)) {
    if (!ALLOWED_FM_KEYS.has(k)) {
      issues.push({ code: 'unknown_front_matter_key', message: `Kunci front-matter '${k}' tidak dikenal.` });
    }
  }

  const partCode = String(rawFm.part_code ?? '');
  const partNo = Number(rawFm.part_no ?? 0);
  const title = String(rawFm.title ?? '');
  const accent = String(rawFm.accent ?? '') as Accent;
  const bankCode = String(rawFm.bank_code ?? '');
  const targetDurationSec = rawFm.target_duration_sec !== undefined ? Number(rawFm.target_duration_sec) : undefined;

  const voicesRaw = (rawFm.voices as Record<string, unknown>) ?? {};
  const speedRaw = (rawFm.speed as Record<string, unknown>) ?? {};

  const voices: Record<string, string> = {};
  for (const [k, v] of Object.entries(voicesRaw)) {
    voices[k] = String(v ?? '');
  }

  const speed: Record<string, number> = {};
  for (const [k, v] of Object.entries(speedRaw)) {
    speed[k] = Number(v);
  }

  // Cek part_no_mismatch
  const pMatch = partCode.match(PART_CODE_RE);
  if (pMatch) {
    const digitInCode = Number(pMatch[1]);
    if (digitInCode !== partNo) {
      issues.push({
        code: 'part_no_mismatch',
        message: `part_no (${partNo}) harus sama dengan angka section pada part_code '${partCode}' (S${digitInCode}).`,
      });
    }
  } else {
    issues.push({
      code: 'line_unparseable',
      message: `part_code '${partCode}' tidak valid (format: GT-L-S[1-4]-NNN).`,
      lineNo: 1,
    });
  }

  // Cek duplicate_voice
  const voiceToSpeaker = new Map<string, string>();
  for (const [spk, vId] of Object.entries(voices)) {
    if (voiceToSpeaker.has(vId)) {
      issues.push({
        code: 'duplicate_voice',
        message: `Dua pembicara '${voiceToSpeaker.get(vId)}' dan '${spk}' memiliki id suara sama '${vId}'.`,
      });
    } else {
      voiceToSpeaker.set(vId, spk);
    }
  }

  // Cek speed_out_of_range (0.95 - 1.15)
  for (const [spk, spd] of Object.entries(speed)) {
    if (spd < 0.95 || spd > 1.15 || Number.isNaN(spd)) {
      issues.push({
        code: 'speed_out_of_range',
        message: `Kecepatan untuk pembicara '${spk}' bernilai ${spd} (di luar rentang 0.95 - 1.15).`,
      });
    }
  }

  // 2. Parse baris naskah
  const bodyLines = bodyText.split(/\r?\n/);
  const items: ScriptItem[] = [];
  const utterances: UtteranceItem[] = [];
  const pauses: PauseItem[] = [];
  const usedSpeakersSet = new Set<string>();

  for (let idx = 0; idx < bodyLines.length; idx++) {
    const line = bodyLines[idx];
    const trimmed = line.trim();
    const actualLineNo = fmLineCount + idx + 1;

    if (!trimmed) continue;

    // Check pause
    const pauseMatch = trimmed.match(PAUSE_RE);
    if (pauseMatch) {
      const dur = Number(pauseMatch[1]);
      // N kelipatan 0.5 dan rentang 0.5 - 10
      const isMultipleOfHalf = Math.round(dur * 10) % 5 === 0;
      if (dur < 0.5 || dur > 10 || !isMultipleOfHalf) {
        issues.push({
          code: 'pause_invalid',
          message: `Jeda '${trimmed}' tidak valid (wajib kelipatan 0.5s antara 0.5s dan 10s).`,
          lineNo: actualLineNo,
        });
      } else {
        const item: PauseItem = { kind: 'PAUSE', lineNo: actualLineNo, durationSec: dur };
        items.push(item);
        pauses.push(item);
      }
      continue;
    }

    // Check utterance
    const uttMatch = trimmed.match(UTTERANCE_RE);
    if (uttMatch) {
      const speaker = uttMatch[1];
      const text = uttMatch[2];

      if (text.length > 600) {
        issues.push({
          code: 'line_unparseable',
          message: `Ujaran pembicara [${speaker}] melebihi 600 karakter (${text.length} karakter).`,
          lineNo: actualLineNo,
        });
      }

      usedSpeakersSet.add(speaker);

      // Cek speaker_without_voice
      if (!voices[speaker] || speed[speaker] === undefined) {
        issues.push({
          code: 'speaker_without_voice',
          message: `Pembicara [${speaker}] tidak memiliki konfigurasi voice atau speed di front-matter.`,
          lineNo: actualLineNo,
        });
      }

      const item: UtteranceItem = { kind: 'UTTERANCE', lineNo: actualLineNo, speaker, text };
      items.push(item);
      utterances.push(item);
      continue;
    }

    // Baris tidak dapat diparsing
    issues.push({
      code: 'line_unparseable',
      message: `Baris tidak dapat diparsing: "${trimmed}"`,
      lineNo: actualLineNo,
    });
  }

  // Cek voice_without_speaker
  for (const spk of Object.keys(voices)) {
    if (!usedSpeakersSet.has(spk)) {
      issues.push({
        code: 'voice_without_speaker',
        message: `Pembicara '${spk}' didefinisikan pada voices tetapi tidak pernah berbicara di naskah.`,
      });
    }
  }

  // Cek speaker_count_invalid
  // S1 tepat 2, S2 tepat 1, S3 2-4, S4 tepat 1
  const speakerCount = usedSpeakersSet.size;
  if (pMatch) {
    const secNo = Number(pMatch[1]);
    if (secNo === 1 && speakerCount !== 2) {
      issues.push({
        code: 'speaker_count_invalid',
        message: `Section 1 harus memiliki tepat 2 pembicara (ditemukan ${speakerCount}).`,
      });
    } else if (secNo === 2 && speakerCount !== 1) {
      issues.push({
        code: 'speaker_count_invalid',
        message: `Section 2 harus berupa monolog (tepat 1 pembicara, ditemukan ${speakerCount}).`,
      });
    } else if (secNo === 3 && (speakerCount < 2 || speakerCount > 4)) {
      issues.push({
        code: 'speaker_count_invalid',
        message: `Section 3 harus memiliki 2 hingga 4 pembicara (ditemukan ${speakerCount}).`,
      });
    } else if (secNo === 4 && speakerCount !== 1) {
      issues.push({
        code: 'speaker_count_invalid',
        message: `Section 4 harus berupa monolog (tepat 1 pembicara, ditemukan ${speakerCount}).`,
      });
    }
  }

  // Cek script_too_long (> 300 ujaran)
  if (utterances.length > 300) {
    issues.push({
      code: 'script_too_long',
      message: `Naskah memuat ${utterances.length} ujaran (maksimal 300 ujaran).`,
    });
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    script: {
      meta: {
        part_code: partCode,
        part_no: partNo,
        title,
        accent,
        bank_code: bankCode,
        voices,
        speed,
        target_duration_sec: targetDurationSec,
      },
      items,
      utterances,
      pauses,
      usedSpeakers: Array.from(usedSpeakersSet).sort(),
    },
    issues: [],
  };
}

export function formatScriptIssue(issue: ScriptIssue): string {
  const lineSuffix = issue.lineNo ? ` (baris ${issue.lineNo})` : '';
  return `${issue.code}: ${issue.message}${lineSuffix}`;
}
