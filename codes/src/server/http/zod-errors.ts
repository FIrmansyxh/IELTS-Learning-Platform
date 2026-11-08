import type { z } from 'zod';
import type { ErrorDetail } from './errors';

const CUSTOM_MESSAGES: Record<string, string> = {
  invalid_email: 'Format email tidak valid.',
  profile_name_invalid: 'Nama profil harus 2-40 karakter tanpa karakter kontrol.',
  display_name_invalid: 'Nama tampilan harus 2-80 karakter tanpa karakter kontrol.',
  password_too_short: 'Password minimal 10 karakter.',
  password_too_long: 'Password maksimal 128 karakter.',
  password_too_common: 'Password terlalu umum.',
  password_same_as_email: 'Password tidak boleh sama dengan email.',
  password_unchanged: 'Password baru harus berbeda dari password saat ini.',
  invalid_invite_format: 'Format kode undangan tidak valid.',
  empty_update: 'Minimal satu field harus diisi.',
  range_invalid: 'Rentang tanggal tidak valid.',
  invalid_uuid: 'ID tidak valid.',
  unrecognized_key: 'Field tidak dikenal.',
  invalid_type: 'Tipe data tidak sesuai.',
  out_of_range: 'Nilai di luar rentang yang diizinkan.',
  invalid_enum: 'Nilai tidak termasuk pilihan yang valid.',
  // SPEC-018 / SPEC-019
  asset_code_invalid: 'asset_code harus berformat huruf kecil/angka dengan / _ - (3-80 karakter).',
  invalid_kind: 'Jenis tidak dikenal.',
  invalid_url: 'URL harus berformat https:// yang valid.',
  store_copy_not_allowed: 'Sumber tautan-saja atau embed tidak boleh disimpan salinannya.',
  source_code_invalid: 'Kode sumber harus huruf besar/angka/underscore (2-40 karakter).',
  host_not_allowed: 'Host URL tidak diizinkan.',
  ref_mismatch: 'external_ref tidak cocok dengan URL.',
  external_ref_required: 'external_ref wajib untuk VIDEO_EMBED.',
  external_ref_not_allowed: 'external_ref dilarang untuk REFERENCE_LINK.',
  csv_kind_required: 'csv_kind wajib untuk format CSV.',
  csv_kind_not_allowed: 'csv_kind dilarang untuk format JSON.',
  file_required: 'Berkas wajib diunggah.',
  multiple_files: 'Hanya satu berkas yang diizinkan.',
};

function pathToString(p: ReadonlyArray<PropertyKey>): string {
  return p.map((s) => String(s)).join('.');
}

/** Ubah ZodError menjadi details[] kontrak. Tidak pernah memuat pesan Zod mentah/nilai input. */
export function zodDetails(err: z.ZodError, basePath = ''): ErrorDetail[] {
  const out: ErrorDetail[] = [];
  const prefix = (p: string) => (basePath && p ? `${basePath}.${p}` : basePath || p);
  for (const issue of err.issues) {
    const path = pathToString(issue.path);
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        out.push({ path: prefix(path ? `${path}.${key}` : key), code: 'unrecognized_key', message: CUSTOM_MESSAGES.unrecognized_key });
      }
      continue;
    }
    let code: string;
    switch (issue.code) {
      case 'custom':
        code = issue.message in CUSTOM_MESSAGES ? issue.message : 'invalid_value';
        break;
      case 'invalid_format':
        code = issue.format === 'uuid' ? 'invalid_uuid' : issue.format === 'email' ? 'invalid_email' : 'invalid_format';
        break;
      case 'invalid_value':
        code = 'invalid_enum';
        break;
      case 'too_small':
      case 'too_big':
        code = 'out_of_range';
        break;
      case 'invalid_type':
        code = 'invalid_type';
        break;
      default:
        code = 'invalid_value';
    }
    // Pesan kustom yang berupa token kode (mis. password_too_short) dipakai sebagai kode detail.
    if (issue.code !== 'custom' && issue.message in CUSTOM_MESSAGES) code = issue.message;
    out.push({ path: prefix(path), code, message: CUSTOM_MESSAGES[code] ?? 'Nilai tidak valid.' });
  }
  return out;
}
