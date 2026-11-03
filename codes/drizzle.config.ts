import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // Skema pgboss dikelola pg-boss sendiri; jangan disentuh drizzle-kit.
  schemaFilter: ['public'],
  dbCredentials: { url: process.env.DATABASE_MIGRATOR_URL ?? '' },
});
