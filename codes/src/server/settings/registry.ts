/** Registri app_settings (specifications/_api-contract.md bagian 8). Kunci di luar tabel ini TIDAK ada. */
export type SettingDef =
  | { key: string; type: 'int'; min: number; max: number; default: number; description: string }
  | { key: string; type: 'enum'; options: readonly string[]; default: string; description: string }
  | { key: string; type: 'bool'; default: boolean; description: string };

const int = (key: string, min: number, max: number, def: number, description: string): SettingDef => ({
  key,
  type: 'int',
  min,
  max,
  default: def,
  description,
});

export const SETTING_DEFS: readonly SettingDef[] = [
  int('learn.min_active_seconds', 10, 3600, 60, 'Waktu belajar aktif minimal sebelum tombol Selesai Belajar (detik).'),
  int('drill.question_count', 1, 50, 10, 'Jumlah soal Active Drill.'),
  int('speed.default_target_ms', 1000, 600000, 20000, 'Target waktu per soal bila soal tidak punya target (milidetik).'),
  int('attempt.cooldown_minutes', 0, 1440, 60, 'Jeda minimal antar percobaan Skip Test/Boss pada set yang sama (menit).'),
  int('attempt.max_per_set_per_day', 1, 20, 3, 'Maksimal percobaan baru per set dalam 24 jam.'),
  int('placement.question_count', 10, 50, 25, 'Jumlah soal Placement Test.'),
  int('ai.daily_limit_per_user', 1, 100, 10, 'Kuota submission AI per pengguna per 24 jam.'),
  int('ai.queue_max', 1, 100, 20, 'Maksimal job AI yang menunggu.'),
  int('retention.audio_days', 1, 365, 90, 'Retensi rekaman Speaking setelah dinilai (hari).'),
  int('retention.ai_raw_output_days', 1, 365, 180, 'Retensi keluaran mentah penilaian AI (hari).'),
  int('crown.silver_min', 1, 100, 75, 'Ambang persen mahkota Silver.'),
  int('crown.gold_min', 1, 100, 90, 'Ambang persen mahkota Gold (harus lebih besar dari Silver).'),
  int('points.correct_answer', 0, 1000, 10, 'Poin per jawaban benar pada Drill.'),
  int('points.speed_streak_min', 2, 20, 3, 'Panjang streak minimal untuk bonus kecepatan.'),
  int('points.speed_streak_bonus', 0, 1000, 5, 'Bonus poin per jawaban ber-streak.'),
  int('points.crown_silver', 0, 10000, 50, 'Poin mahkota Silver.'),
  int('points.crown_gold', 0, 10000, 100, 'Poin mahkota Gold (total).'),
  int('points.mini_task', 0, 10000, 20, 'Poin Mini-Task.'),
  int('points.boss_pass', 0, 10000, 200, 'Poin lulus Boss.'),
  int('points.daily_activity', 0, 1000, 5, 'Poin aktivitas harian pertama.'),
];

export const SYSTEM_HEARTBEAT_KEY = 'system.worker_heartbeat_at';

export function findSetting(key: string): SettingDef | undefined {
  return SETTING_DEFS.find((d) => d.key === key);
}

export type SettingCheck = { ok: true; value: unknown } | { ok: false; code: 'invalid_type' | 'out_of_range' | 'invalid_enum' };

export function checkSettingValue(def: SettingDef, value: unknown): SettingCheck {
  if (def.type === 'int') {
    if (typeof value !== 'number' || !Number.isInteger(value)) return { ok: false, code: 'invalid_type' };
    if (value < def.min || value > def.max) return { ok: false, code: 'out_of_range' };
    return { ok: true, value };
  }
  if (def.type === 'enum') {
    if (typeof value !== 'string') return { ok: false, code: 'invalid_type' };
    if (!def.options.includes(value)) return { ok: false, code: 'invalid_enum' };
    return { ok: true, value };
  }
  if (typeof value !== 'boolean') return { ok: false, code: 'invalid_type' };
  return { ok: true, value };
}
