import { eq } from 'drizzle-orm';
import { appSettings } from '@/db/schema';
import type { DbOrTx } from '../db';
import { findSetting, type SettingDef } from './registry';

/** Baca satu pengaturan; bila baris DB hilang atau tidak valid, kembalikan default registri. */
export async function getSetting<T extends number | string | boolean>(db: DbOrTx, key: string): Promise<T> {
  const def = findSetting(key);
  if (!def) throw new Error(`Kunci pengaturan tidak dikenal: ${key}`);
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  const v = row?.value;
  if (v === undefined || v === null || !matchesType(def, v)) return def.default as T;
  return v as T;
}

function matchesType(def: SettingDef, v: unknown): boolean {
  if (def.type === 'int') return typeof v === 'number' && Number.isInteger(v);
  if (def.type === 'enum') return typeof v === 'string' && def.options.includes(v);
  return typeof v === 'boolean';
}
