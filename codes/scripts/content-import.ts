/**
 * CLI konten (SPEC-004):
 *   npm run content:validate -- --dir <path>
 *   npm run content:import   -- --dir <path> [--publish] [--dry-run] [--allow-published-overwrite]
 * Exit code: 0 sukses, 1 validasi gagal, 2 publikasi terhalang, 3 galat teknis.
 */
import './_env';
import path from 'node:path';

process.env.DATABASE_URL ??= process.env.DATABASE_MIGRATOR_URL;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<number> {
  const command = process.argv[2];
  const dirArg = arg('dir');
  if ((command !== 'validate' && command !== 'import') || !dirArg) {
    console.error('Pemakaian: content-import.ts <validate|import> --dir <path> [--publish] [--dry-run] [--allow-published-overwrite]');
    return 1;
  }
  const dir = path.resolve(dirArg);
  const svc = await import('../src/server/content/import-service');
  const dbMod = await import('../src/server/db');
  const { CONTENT_SOURCES } = await import('./seed');

  if (command === 'validate') {
    // Coba konteks DB; bila DB tidak tersedia, pakai struktur statis (validasi tetap tanpa menulis).
    let ctx;
    try {
      ctx = await svc.contextFromDb(dbMod.getDb());
    } catch {
      console.warn('PERINGATAN db_unavailable: validasi luring memakai struktur statis seed.');
      ctx = svc.staticContext(
        new Map(CONTENT_SOURCES.map((s) => [s.code, { licenseType: s.licenseType, shareAlike: s.shareAlike ?? false, mayStoreCopy: s.mayStoreCopy ?? false }])),
      );
    } finally {
      await dbMod.closeDb().catch(() => undefined);
    }
    const r = await svc.validatePackage(dir, ctx);
    for (const w of r.warnings) console.warn(svc.formatIssue(w));
    if (r.errors.length) {
      for (const e of r.errors) console.error(svc.formatIssue(e));
      return 1;
    }
    const pkg = r.pkg!;
    const drills = (pkg.sub_modules ?? []).filter((s) => s.active_drill).length;
    console.log(
      `OK: valid | modules ${pkg.modules?.length ?? 0} | sub_modules ${pkg.sub_modules?.length ?? 0} | drill ${drills} | assessment_sets ${pkg.assessment_sets?.length ?? 0} | assets ${r.manifest?.assets.length ?? 0}`,
    );
    return 0;
  }

  try {
    const out = await svc.runImport(dbMod.getDb(), { dir, publish: flag('publish'), dryRun: flag('dry-run'), actorUserId: null, allowPublishedOverwrite: flag('allow-published-overwrite') });
    for (const l of out.lines) (out.exitCode === 0 ? console.log : console.error)(l);
    return out.exitCode;
  } finally {
    await dbMod.closeDb().catch(() => undefined);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('Galat teknis:', e instanceof Error ? e.message : 'tidak diketahui');
    process.exit(3);
  });
