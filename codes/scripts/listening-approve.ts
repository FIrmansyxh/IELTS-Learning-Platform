/**
 * Catat hasil uji dengar Listening oleh manusia (SPEC-024 D6, C-30):
 *   npm run listening:approve -- GT-L-S2-001 --reviewer "Nama" --clarity 5 --speed 4 --naturalness 4 [--leak] [--reject] [--notes "..."]
 * Menulis content/gt-listening/reviews/<part_code>.review.json dengan hash naskah dan audio saat ini.
 * Disetujui hanya bila tidak --reject; gerbang impor tetap menuntut clarity >= 4, speed >= 3, tanpa kebocoran jawaban.
 * Exit code: 0 tersimpan, 1 argumen/berkas salah.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ListeningReviewSchema } from '../src/server/listening/review-gate';
import { PART_CODE_RE } from '../src/server/listening/script-parser';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const score = (name: string) => Number(arg(name));

async function main(): Promise<number> {
  const partCode = process.argv[2];
  if (!partCode || !PART_CODE_RE.test(partCode)) {
    console.error('Pemakaian: npm run listening:approve -- GT-L-S2-001 --reviewer "Nama" --clarity 1-5 --speed 1-5 --naturalness 1-5 [--leak] [--reject] [--notes "..."]');
    return 1;
  }
  const base = path.resolve('content/gt-listening');
  let script: Buffer;
  let audio: Buffer;
  try {
    script = await readFile(path.join(base, 'scripts', `${partCode}.md`));
    audio = await readFile(path.join(base, 'assets', 'audio', `${partCode.toLowerCase()}.mp3`));
  } catch {
    console.error(`berkas_tidak_ada: naskah atau audio ${partCode} belum ada (jalankan listening:build dulu).`);
    return 1;
  }

  const parsed = ListeningReviewSchema.safeParse({
    part_code: partCode,
    reviewer: arg('reviewer'),
    reviewed_at: new Date().toISOString().slice(0, 10),
    clarity: score('clarity'),
    speed: score('speed'),
    naturalness: score('naturalness'),
    answer_leak: flag('leak'),
    approved: !flag('reject'),
    script_sha256: sha(script),
    audio_sha256: sha(audio),
    ...(arg('notes') ? { notes: arg('notes') } : {}),
  });
  if (!parsed.success) {
    for (const i of parsed.error.issues) console.error(`argumen_salah: ${i.path.join('.')}: ${i.message}`);
    return 1;
  }
  const r = parsed.data;
  await writeFile(path.join(base, 'reviews', `${partCode}.review.json`), JSON.stringify(r, null, 2) + '\n', 'utf8');
  const lolos = r.approved && r.clarity >= 4 && r.speed >= 3 && !r.answer_leak;
  console.log(`OK: review ${partCode} tersimpan | ${lolos ? 'lolos gerbang, siap diimpor' : 'TIDAK lolos gerbang (bank tetap draf)'}`);
  console.log('Lanjutkan: npm run content:import:all');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('Galat teknis:', e instanceof Error ? e.message : 'tidak diketahui');
    process.exit(1);
  });
