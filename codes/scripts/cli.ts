/**
 * Pintu masuk CLI pemeliharaan lokal (SPEC-025 D7): npm run cli -- <area> <perintah> ...
 * Logika ada di src/server/cli/run.ts agar dapat diuji.
 */
import './_env';

async function main(): Promise<number> {
  const { runCli } = await import('../src/server/cli/run');
  const dbMod = await import('../src/server/db');
  try {
    return await runCli(process.argv.slice(2));
  } finally {
    await dbMod.closeDb().catch(() => undefined);
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(3);
  },
);
