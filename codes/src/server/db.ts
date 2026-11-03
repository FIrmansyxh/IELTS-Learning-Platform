import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';

let pool: Pool | undefined;
let instance: NodePgDatabase<typeof schema> | undefined;

export type Db = NodePgDatabase<typeof schema>;
/** Parameter callback `db.transaction(async (tx) => ...)`. Service menerima Tx agar bisa dipakai dalam transaksi pemanggil. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Db atau Tx: query builder yang sama. */
export type DbOrTx = Db | Tx;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL tidak diset');
    pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 2000 });
  }
  return pool;
}

export function getDb(): Db {
  instance ??= drizzle(getPool(), { schema });
  return instance;
}

/** Hanya untuk pengujian: tutup pool dan reset singleton. */
export async function closeDb(): Promise<void> {
  const p = pool;
  pool = undefined;
  instance = undefined;
  await p?.end();
}
