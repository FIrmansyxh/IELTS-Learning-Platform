/**
 * CLI pembuatan audio Listening (SPEC-024):
 *   npm run listening:build -- --script <path> [--dry-run] [--keep-temp] [--output-dir <path>]
 * Exit code:
 *   0 sukses
 *   1 galat validasi skrip
 *   2 galat lingkungan (TTS/ffmpeg/ffprobe tidak ada)
 *   3 galat kualitas (segment_suspect atau durasi di luar toleransi 5%)
 */
import './_env';
import path from 'node:path';
import { buildListening } from '../src/server/listening/builder';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<number> {
  const scriptArg = arg('script');
  if (!scriptArg) {
    console.error('Pemakaian: npm run listening:build -- --script <path> [--dry-run] [--keep-temp] [--output-dir <path>]');
    return 1;
  }

  const dryRun = flag('dry-run');
  const keepTemp = flag('keep-temp');
  const outDir = arg('output-dir');

  const res = await buildListening({
    scriptPath: path.resolve(scriptArg),
    dryRun,
    keepTemp,
    outputDir: outDir ? path.resolve(outDir) : undefined,
  });

  for (const line of res.lines) {
    if (res.exitCode === 0) {
      console.log(line);
    } else {
      console.error(line);
    }
  }

  return res.exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('Galat teknis:', e instanceof Error ? e.message : 'tidak diketahui');
    process.exit(2);
  });
