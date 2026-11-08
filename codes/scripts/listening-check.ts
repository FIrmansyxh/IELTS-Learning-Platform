/**
 * CLI validasi skrip Listening (SPEC-024):
 *   npm run listening:check -- --script <path>
 * Exit code: 0 sukses, 1 validasi gagal.
 */
import './_env';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatScriptIssue, parseListeningScript } from '../src/server/listening/script-parser';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const scriptArg = arg('script');
  if (!scriptArg) {
    console.error('Pemakaian: npm run listening:check -- --script <path>');
    return 1;
  }

  const scriptPath = path.resolve(scriptArg);
  let content: string;
  try {
    content = await readFile(scriptPath, 'utf8');
  } catch {
    console.error(`galat_baca: Berkas ${scriptPath} tidak dapat dibaca.`);
    return 1;
  }

  const { script, issues } = parseListeningScript(content);

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(formatScriptIssue(issue));
    }
    return 1;
  }

  console.log(`OK: valid | ${script!.meta.part_code} | pembicara: ${script!.usedSpeakers.join(', ')} | ujaran: ${script!.utterances.length} | jeda: ${script!.pauses.length}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('Galat tak terduga:', e instanceof Error ? e.message : 'tidak diketahui');
    process.exit(1);
  });
