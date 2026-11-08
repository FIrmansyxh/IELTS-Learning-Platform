/**
 * Baca/ubah pengaturan aplikasi (app_settings) dengan validasi registri. Dipakai CLI `settings:*` (SPEC-025 D7).
 * Pengganti panel admin: tanpa pengguna aktor, perubahan dicatat di audit_log dengan actor null.
 */
import { eq } from 'drizzle-orm';
import { appSettings } from '@/db/schema';
import { writeAudit } from '../audit';
import { getDb } from '../db';
import { ApiError } from '../http/errors';
import { checkSettingValue, findSetting, SETTING_DEFS, type SettingDef } from './registry';

type Row = typeof appSettings.$inferSelect;

export interface SettingView {
  key: string;
  value: number | string | boolean;
  default: number | string | boolean;
  type: SettingDef['type'];
  min: number | null;
  max: number | null;
  options: string[] | null;
  description: string;
  updated_at: string | null;
}

function toView(def: SettingDef, row: Row | undefined): SettingView {
  const stored = row?.value;
  const valid = row !== undefined && checkSettingValue(def, stored).ok;
  return {
    key: def.key,
    value: (valid ? stored : def.default) as number | string | boolean,
    default: def.default,
    type: def.type,
    min: def.type === 'int' ? def.min : null,
    max: def.type === 'int' ? def.max : null,
    options: def.type === 'enum' ? [...def.options] : null,
    description: def.description,
    updated_at: row ? row.updatedAt.toISOString() : null,
  };
}

export async function listSettings(): Promise<SettingView[]> {
  const rows = await getDb().select().from(appSettings);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return SETTING_DEFS.map((d) => toView(d, byKey.get(d.key)));
}

export async function getSettingView(key: string): Promise<SettingView> {
  const def = findSetting(key);
  if (!def) throw new ApiError('NOT_FOUND');
  const [row] = await getDb().select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return toView(def, row);
}

const bad = (code: string, message: string) => new ApiError('VALIDATION_ERROR', { details: [{ path: 'value', code, message }] });

export async function setSetting(key: string, value: unknown): Promise<SettingView> {
  const def = findSetting(key);
  if (!def) throw new ApiError('NOT_FOUND');
  const check = checkSettingValue(def, value);
  if (!check.ok) {
    const msg =
      check.code === 'out_of_range'
        ? 'Nilai di luar rentang yang diizinkan.'
        : check.code === 'invalid_enum'
          ? 'Nilai tidak termasuk pilihan yang valid.'
          : 'Tipe data tidak sesuai.';
    throw bad(check.code, msg);
  }
  return getDb().transaction(async (tx) => {
    const [old] = await tx.select().from(appSettings).where(eq(appSettings.key, key)).for('update');
    const oldValue = old && checkSettingValue(def, old.value).ok ? old.value : def.default;

    if ((key === 'crown.gold_min' || key === 'crown.silver_min') && def.type === 'int') {
      const otherKey = key === 'crown.gold_min' ? 'crown.silver_min' : 'crown.gold_min';
      const otherDef = findSetting(otherKey) as Extract<SettingDef, { type: 'int' }>;
      const [other] = await tx.select().from(appSettings).where(eq(appSettings.key, otherKey));
      const otherValue = Number(other && checkSettingValue(otherDef, other.value).ok ? other.value : otherDef.default);
      const gold = key === 'crown.gold_min' ? (value as number) : otherValue;
      const silver = key === 'crown.silver_min' ? (value as number) : otherValue;
      if (gold <= silver) throw bad('gold_not_greater_than_silver', 'Ambang Gold harus lebih besar dari Silver.');
    }

    const [row] = await tx
      .insert(appSettings)
      .values({ key, value: check.value, description: def.description, updatedBy: null })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: check.value, updatedBy: null, updatedAt: new Date() } })
      .returning();
    await writeAudit(tx, {
      actorUserId: null,
      action: 'SETTINGS_CHANGED',
      entityType: 'app_setting',
      entityId: key,
      metadata: { key, old: oldValue, new: check.value },
    });
    return toView(def, row);
  });
}
