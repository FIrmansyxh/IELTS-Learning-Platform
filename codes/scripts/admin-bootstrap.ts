/** npm run admin:bootstrap (SPEC-001). Password tidak pernah dicetak. */
import './_env';

process.env.DATABASE_URL ??= process.env.DATABASE_MIGRATOR_URL;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Konfigurasi env tidak valid: DATABASE_URL');
    process.exit(1);
  }
  const { bootstrapAdmin } = await import('../src/server/auth/bootstrap');
  const { closeDb } = await import('../src/server/db');
  try {
    const r = await bootstrapAdmin({ ADMIN_EMAIL: process.env.ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD });
    console.log(r.created ? 'Admin dibuat. Wajib mengganti password pada login pertama.' : 'Admin sudah ada, tidak ada perubahan.');
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error && /^ADMIN_/.test(err.message) ? err.message : 'Bootstrap admin gagal.');
  process.exit(1);
});
