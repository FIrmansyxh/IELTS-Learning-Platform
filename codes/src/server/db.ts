/**
 * Akses database lokal (SPEC-025 Fase 3): SQLite lewat `node:sqlite` + Drizzle `sqlite-proxy`.
 *
 * - Satu koneksi sinkron per proses. Transaksi diserialkan oleh mutex (BEGIN IMMEDIATE) supaya
 *   pernyataan dari permintaan lain tidak masuk ke tengah transaksi. Kode di dalam transaksi
 *   yang memanggil `getDb()` (bukan `tx`) ikut transaksi itu (AsyncLocalStorage).
 * - WAL + busy_timeout: CLI dan server boleh membuka file yang sama bersamaan.
 * - Baris `db.all`/`db.get` mentah dikembalikan sebagai objek bila SQL diawali penanda `OBJ`
 *   (lihat `rawAll`/`rawGet`); query builder Drizzle memakai baris array.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sql, type SQL } from 'drizzle-orm';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from '@/db/schema';

export type Db = SqliteRemoteDatabase<typeof schema>;
/** Parameter callback `db.transaction(async (tx) => ...)`. Service menerima Tx agar bisa dipakai dalam transaksi pemanggil. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Db atau Tx: query builder yang sama. */
export type DbOrTx = Db | Tx;

const OBJ = '/*OBJ*/ ';
/** Transaksi yang sedang berjalan pada konteks async ini (untuk transaksi bersarang = savepoint). */
const inTx = new AsyncLocalStorage<{ tx?: Tx }>();

let raw: DatabaseSync | undefined;
let instance: Db | undefined;
let held = false;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  while (held) await new Promise<void>((resolve) => waiters.push(resolve));
  held = true;
}
function release(): void {
  held = false;
  waiters.shift()?.();
}
async function waitIdle(): Promise<void> {
  while (held) await new Promise<void>((resolve) => waiters.push(resolve));
}

/** Normalkan parameter untuk node:sqlite (Date -> epoch ms, boolean -> 0/1, undefined -> null). */
function bindable(v: unknown): string | number | null | bigint | Uint8Array {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object' && !(v instanceof Uint8Array)) return JSON.stringify(v);
  return v as string | number | bigint | Uint8Array;
}

/** Lokasi berkas DB. `:memory:` hanya untuk pengujian cepat. */
export function databasePath(): string {
  return process.env.DATABASE_PATH ?? path.resolve('data', 'ielts.db');
}

export function openRaw(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  return db;
}

export function getRaw(): DatabaseSync {
  raw ??= openRaw(databasePath());
  return raw;
}

export function getDb(): Db {
  if (instance) return instance;
  const conn = getRaw();
  const db = drizzle<typeof schema>(
    async (query, params, method) => {
      if (!inTx.getStore()) await waitIdle();
      const objects = query.startsWith(OBJ);
      const stmt = conn.prepare(objects ? query.slice(OBJ.length) : query === 'begin' ? 'begin immediate' : query);
      stmt.setReturnArrays(!objects);
      const args = (params as unknown[]).map(bindable);
      if (method === 'run') {
        stmt.run(...args);
        return { rows: [] };
      }
      if (method === 'get') return { rows: (stmt.get(...args) ?? undefined) as never };
      return { rows: stmt.all(...args) as never };
    },
    { schema },
  );
  const original = db.transaction.bind(db) as (fn: (tx: Tx) => Promise<unknown>, cfg?: unknown) => Promise<unknown>;
  (db as { transaction: unknown }).transaction = async (fn: (tx: Tx) => Promise<unknown>, cfg?: unknown) => {
    const current = inTx.getStore();
    if (current?.tx) return current.tx.transaction(fn, cfg as never); // bersarang: savepoint
    await acquire();
    try {
      // Seluruh transaksi (termasuk BEGIN/COMMIT) berjalan di dalam konteks ini agar tidak menunggu kunci miliknya sendiri.
      const holder: { tx?: Tx } = {};
      return await inTx.run(holder, () =>
        original((tx) => {
          holder.tx = tx;
          return fn(tx);
        }, cfg),
      );
    } finally {
      release();
    }
  };
  instance = db;
  return db;
}

/** Baris objek bernama untuk SQL mentah (`SELECT ... AS nama`). */
export async function rawAll<T = Record<string, unknown>>(db: DbOrTx, query: SQL): Promise<T[]> {
  return (await db.all(sql`/*OBJ*/ ${query}`)) as T[];
}
export async function rawGet<T = Record<string, unknown>>(db: DbOrTx, query: SQL): Promise<T | undefined> {
  return (await rawAll<T>(db, query))[0];
}

/** Pengganti `db.execute(sql...)` Postgres: kembalikan `{ rows }` berisi objek bernama. */
export async function execute<T = Record<string, unknown>>(db: DbOrTx, query: SQL): Promise<{ rows: T[] }> {
  return { rows: await rawAll<T>(db, query) };
}

/** Pengganti `now()`: epoch milidetik (kolom timestamp disimpan sebagai INTEGER ms). */
export const NOW = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

function messageOf(err: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = err, i = 0; e && i < 4; i++) {
    if (e instanceof Error) parts.push(e.message);
    e = (e as { cause?: unknown }).cause;
  }
  return parts.join(' | ');
}
/** Pelanggaran UNIQUE/PRIMARY KEY (mengganti kode 23505 Postgres). */
export function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE constraint failed|PRIMARY KEY/i.test(messageOf(err));
}
export function isForeignKeyViolation(err: unknown): boolean {
  return /FOREIGN KEY constraint failed/i.test(messageOf(err));
}

/** Hanya untuk pengujian/skrip: tutup koneksi dan reset singleton. */
export async function closeDb(): Promise<void> {
  await waitIdle();
  const r = raw;
  raw = undefined;
  instance = undefined;
  r?.close();
}
