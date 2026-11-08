# API CONTRACT FINAL: ielts-learning-platform

**Owner Agent:** Analyst
**Date:** 2026-11-03
**Status:** `FINAL` (Human Approval didelegasikan kepada Orchestrator, ADR-003; ditinjau ulang human setelah Fase 3)
**Versi kontrak:** `v1` (prefiks path `/api/v1`), kontrak konten JSON `1.1`

> Dokumen ini adalah seam Backend dan Frontend: konvensi bersama, registri kode error, bucket rate limit, DTO bersama (Zod), indeks seluruh endpoint, rute UI, registri hook, registri `app_settings`, dan rekap delta skema. Kontrak rinci tiap endpoint (field, tipe, constraint, contoh nilai nyata, kondisi error) bersifat NORMATIF dan berada di bagian "API Contract" setiap spec `NNN_spec_*.md`. Jika dokumen ini dan sebuah spec berbeda, spec fitur yang berlaku dan dokumen ini wajib diperbaiki lewat `agent/workflows/_shared/change-management.md` (notify Backend + Frontend).

---

## 0. Perubahan SPEC-025 (2026-11-08): profil lokal menggantikan login

Endpoint `auth/login`, `auth/register`, `auth/logout`, `auth/change-password`, `auth/signup-config`, seluruh `admin/invites*`, `admin/users` (POST), `admin/users/{id}/reset-password`, dan kode error `INVALID_CREDENTIALS`, `SIGNUP_CLOSED`, `INVITE_INVALID`, `CURRENT_PASSWORD_INCORRECT`, `PASSWORD_CHANGE_REQUIRED`, `INVITE_NOT_ACTIVE` sudah DIHAPUS. Bucket rate-limit `login_ip`, `login_email`, `register_ip`, `account_action` tidak lagi dipakai. Guard `must_change_password` dicabut.

Endpoint baru (semua `public`; satu-satunya yang tanpa sesi selain `GET /api/health`):
| Metode dan path | Fungsi | Hasil |
|---|---|---|
| `GET /api/v1/profiles` | daftar profil + `completed_sub_modules`, `max_profiles` (10) | 200 |
| `POST /api/v1/profiles` `{ display_name }` (2-40 karakter) | buat profil dan langsung dipilih (cookie sesi) | 201; `409 PROFILE_NAME_TAKEN`, `409 PROFILE_LIMIT_REACHED` |
| `POST /api/v1/profiles/{id}/select` | pilih profil (cookie sesi) | 200; 404 |
| `POST /api/v1/profiles/leave` | ganti profil (hapus cookie) | 204 |
| `DELETE /api/v1/profiles/{id}` `{ confirm_name }` | hapus profil + seluruh progres | 204; `400 CONFIRM_NAME_MISMATCH`, 404 |

Kode error baru: `PROFILE_NAME_TAKEN` (409), `PROFILE_LIMIT_REACHED` (409), `CONFIRM_NAME_MISMATCH` (400), `HOST_NOT_ALLOWED` (403: header `Host` bukan localhost/127.0.0.1/[::1]). Cookie sesi kini `SameSite=Strict`. `PATCH /api/v1/me/profile` dengan nama kembar mengembalikan `409 PROFILE_NAME_TAKEN`. Bagian tabel di bawah yang masih menyebut endpoint lama dipertahankan sebagai riwayat.

---

## 1. Konvensi Bersama

| Topik | Aturan |
|---|---|
| Base path | `/api/v1` untuk semua endpoint aplikasi; satu-satunya pengecualian `GET /api/health` |
| Format | JSON UTF-8 (`Content-Type: application/json`); unggahan `multipart/form-data` hanya pada endpoint yang tertulis |
| Casing | SELURUH field JSON, query, dan path param berbentuk `snake_case` (identik dengan kolom DB dan kontrak impor). Kode TypeScript boleh `camelCase` di dalam, tetapi batas HTTP dipetakan 1:1 |
| Nilai enum | `UPPER_SNAKE` sesuai enum DB (`COMPLETED`), kecuali yang ditulis lain di spec (`learner`, `admin`, `open`, `invite`, `closed`) |
| ID | UUID v4 string huruf kecil. Pengecualian: `audit_log.id` dan `point_ledger.id` berupa bilangan bulat |
| Waktu | ISO-8601 UTC dengan milidetik dan `Z` (`2026-11-03T10:15:30.000Z`); tanggal lokal murni `YYYY-MM-DD` hanya bila tertulis |
| Band | number 0-9 kelipatan 0.5 (JSON `6.0`, `6.5`) |
| Persen | number 0-100 maksimal 2 desimal |
| Envelope sukses | `{ "data": <objek atau array> }`; daftar berpaginasi: `{ "data": [...], "meta": { "page": int, "page_size": int, "total": int } }`; `204` tanpa body |
| Paginasi | query `page` (>= 1, default 1) dan `page_size` (1-100 kecuali tertulis lain, default 20) |
| Envelope error | `{ "error": { "code": string, "message": string, "request_id": uuid, "details"?: [{ "path": string, "code": string, "message": string }] } }`; `message` berbahasa Indonesia, generik (tanpa stack trace/SQL/path internal) |
| Validasi | Semua input diverifikasi server dengan Zod `z.strictObject` (field tak dikenal ditolak `unrecognized_key`); klien tidak pernah mengirim `role`, `status`, `user_id`, `is_correct`, `score`, `passed`, `band`, `points`, `unlock_*`, `crown` |
| Auth | Cookie sesi Auth.js (JWT, `httpOnly`, `SameSite=Lax`, `Secure` di HTTPS). Level: `public` (tanpa sesi), `user` (sesi valid, akun `ACTIVE`; peran `learner` maupun `admin`), `admin` (sesi valid dan `role='admin'`). Admin juga belajar sebagai pengguna biasa |
| Guard | Setiap Route Handler dibungkus `withApi({ auth })`; `requireUser()`/`requireAdmin()` di dalam handler; jika `must_change_password=true` semua endpoint selain `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password` menolak `403 PASSWORD_CHANGE_REQUIRED` |
| CSRF | Mutasi (`POST`, `PUT`, `PATCH`, `DELETE`) wajib `Origin` (atau `Sec-Fetch-Site: same-origin`) sama dengan host aplikasi, selain itu `403 CSRF_ORIGIN_MISMATCH`. Tidak ada mutasi lewat `GET` |
| Content-Type | Endpoint ber-body JSON menolak selain `application/json` dengan `415 UNSUPPORTED_MEDIA_TYPE`; body JSON maksimum 1 MB (`413 PAYLOAD_TOO_LARGE`) |
| Cache | Semua respons API terautentikasi: `Cache-Control: private, no-store`, kecuali aset berkas yang tertulis (SPEC-005) |
| Header respons | `X-Request-Id: <uuid>` selalu ada (sama dengan `error.request_id`); `Retry-After: <detik>` pada 429/503 |
| Kepemilikan | Resource ber-ID milik pengguna lain atau tidak ada -> `404 NOT_FOUND` (tidak pernah 403) |
| Idempotensi | Tertulis per endpoint (UPSERT jawaban, submit attempt, register tidak idempoten) |
| Disclaimer | Semua tampilan band/skor AI wajib `"Perkiraan latihan, bukan skor resmi IELTS."` |
| Bahasa | UI dan pesan error Indonesia; materi/soal Inggris |

## 2. Registri Kode Error

### 2.1 Kode umum (berlaku untuk endpoint sesuai syarat)
| Kode | HTTP | Berlaku bila | Pesan default |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Body/query/path gagal skema Zod | "Data yang dikirim tidak valid." |
| `UNAUTHENTICATED` | 401 | Endpoint non-`public`: sesi tidak ada, kedaluwarsa, `token_version` beda, akun `DISABLED`/terhapus | "Sesi tidak valid atau telah berakhir." |
| `PASSWORD_CHANGE_REQUIRED` | 403 | `must_change_password=true` (lihat Guard) | "Anda harus mengganti password terlebih dahulu." |
| `FORBIDDEN` | 403 | Endpoint `admin` dipanggil pengguna `learner` | "Anda tidak punya akses." |
| `CSRF_ORIGIN_MISMATCH` | 403 | Mutasi dengan Origin asing | "Permintaan ditolak." |
| `NOT_FOUND` | 404 | Resource tidak ada / bukan milik pemanggil / tidak tersedia bagi pemanggil | "Data tidak ditemukan." |
| `PAYLOAD_TOO_LARGE` | 413 | Body/berkas melebihi batas | "Ukuran data terlalu besar." |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Content-Type tidak sesuai | "Format permintaan tidak didukung." |
| `RATE_LIMITED` | 429 | Bucket (bagian 3) terlampaui | "Terlalu banyak permintaan. Coba lagi sebentar lagi." |
| `INTERNAL_ERROR` | 500 | Galat tak terduga | "Terjadi kesalahan pada server." |
| `SERVICE_UNAVAILABLE` | 503 | Dependensi inti tidak siap | "Layanan belum siap." |

### 2.2 Kode spesifik fitur
| Kode | HTTP | Spec | Arti singkat |
|---|---|---|---|
| `INVALID_CREDENTIALS` | 401 | 001 | Email/password salah atau akun terkunci/nonaktif (pesan sama) |
| `SIGNUP_CLOSED` | 403 | 001 | Mode `closed` |
| `INVITE_INVALID` | 403 | 001 | Kode undangan tidak valid/kedaluwarsa/terpakai/tidak ada |
| `EMAIL_TAKEN` | 409 | 001, 002 | Email sudah terdaftar |
| `CURRENT_PASSWORD_INCORRECT` | 403 | 001 | Password saat ini salah |
| `CANNOT_MODIFY_SELF` | 409 | 002 | Admin mengubah akunnya sendiri |
| `LAST_ADMIN` | 409 | 002 | Mengosongkan admin aktif |
| `INVITE_NOT_ACTIVE` | 409 | 002 | Undangan tidak aktif |
| `LOCKED_CONTENT` | 403 | 003 (dipakai 005, 006, 007, 012, 013) | Sub-modul terkunci; `details[0].code` `PREVIOUS_INCOMPLETE` \| `TIER_LOCKED` |
| `ALREADY_UNLOCKED` | 409 | 003 | Override pada level yang sudah terbuka |
| `NOT_AVAILABLE` | 409 | 003 | Override pada konten `COMING_SOON` |
| `LEARN_REQUIREMENTS_NOT_MET` | 409 | 005 | Bukti belajar belum cukup |
| `NO_MINI_TASK` | 409 | 005 | Sub-modul tanpa Mini-Task |
| `MINI_TASK_NOT_SELF_CHECK` | 409 | 005 | Mini-Task bertipe AI |
| `LEARN_NOT_COMPLETED` | 409 | 005, 006, 012, 013 | Materi belum selesai |
| `ATTEMPT_EXPIRED` | 409 | 006 | Melewati deadline + 5 detik |
| `ATTEMPT_NOT_ACTIVE` | 409 | 006 | Attempt tidak `IN_PROGRESS` |
| `ATTEMPT_NOT_FINISHED` | 409 | 006, 015 | Attempt belum selesai |
| `QUESTION_ALREADY_ANSWERED` | 409 | 006, 015 | Soal sudah dijawab (PRACTICE beda jawaban / Placement) |
| `QUESTION_REQUIRES_SUBMISSION` | 409 | 006 | Soal Writing/Speaking dijawab lewat submission |
| `ASSESSMENT_TYPE_NOT_ENABLED` | 409 | 006 | Tipe set belum punya handler |
| `SECTION_NOT_STARTABLE` | 409 | 006 | `BOSS_SECTION` dimulai langsung |
| `SKIP_NOT_AVAILABLE` | 409 | 008 | Skip Test tidak tersedia |
| `COOLDOWN_ACTIVE` | 429 | 008, 014 | Jeda antar percobaan aktif |
| `DAILY_ATTEMPT_LIMIT` | 429 | 008, 014 | Batas percobaan harian |
| `VERSION_LABEL_TAKEN` | 409 | 009 | Label versi tabel band ganda |
| `ALREADY_ACTIVE` | 409 | 009 | Tabel band sudah aktif |
| `BAND_TABLE_IN_USE` | 409 | 009 | Tabel band aktif/terpakai tidak dapat dihapus |
| `RANGE_NOT_SATISFIABLE` | 416 | 011, 013 | Rentang `Range` tidak valid |
| `QUESTION_TYPE_MISMATCH` | 409 | 012, 013 | Jenis soal tidak cocok dengan `kind` |
| `MINI_TASK_TYPE_MISMATCH` | 409 | 012, 013 | Tipe Mini-Task tidak cocok |
| `SUBMISSION_ALREADY_EXISTS` | 409 | 012, 013 | Submission untuk soal itu sudah ada |
| `AI_SUBMISSION_IN_PROGRESS` | 409 | 012, 013 | Sudah ada submission AI berjalan |
| `AI_DAILY_LIMIT_REACHED` | 429 | 012, 013 | Kuota harian AI habis |
| `AI_QUEUE_FULL` | 503 | 012, 013 | Antrean AI penuh |
| `SUBMISSION_NOT_RETRYABLE` | 409 | 012, 013 | Status/kode galat tidak dapat diulang |
| `RETRY_LIMIT_REACHED` | 409 | 012 | 3 retry terpakai |
| `AI_DISABLED` | 409 | 012 | `AI_ENABLED=false` |
| `SELF_ASSESSMENT_NOT_ALLOWED` | 409 | 012 | Status tidak mengizinkan penilaian sendiri |
| `RECORDING_CONSENT_REQUIRED` | 409 | 013 | Persetujuan rekaman belum diberikan |
| `UNSUPPORTED_AUDIO_TYPE` | 415 | 013 | Magic bytes audio tidak didukung |
| `RECORDING_IN_USE` | 409 | 013 | Rekaman sedang diproses |
| `RECORDING_UNAVAILABLE` | 409 | 013 | Rekaman sudah dihapus/dipurge |
| `BOSS_NOT_AVAILABLE` | 409 | 014 | Boss belum tersedia |
| `BOSS_ALREADY_PASSED` | 409 | 014 | Boss sudah lulus |
| `SECTION_ORDER_VIOLATION` | 409 | 014 | Section sebelumnya belum selesai |
| `SECTION_ALREADY_DONE` | 409 | 014 | Section sudah selesai |
| `SECTION_NOT_ACTIVE` | 409 | 014 | Section belum/ tidak aktif |
| `SECTION_EXPIRED` | 409 | 014 | Waktu section habis |
| `PLACEMENT_NOT_AVAILABLE` | 409 | 015 | Placement tidak tersedia |
| `QUESTION_NOT_CURRENT` | 409 | 015 | Bukan soal Placement saat ini |
| `TIER_ABOVE_RECOMMENDATION` | 409 | 015 | Tier terpilih melebihi rekomendasi |
| `PLACEMENT_ALREADY_APPLIED` | 409 | 015 | Placement sudah diterapkan |
| `SOURCE_CODE_TAKEN` | 409 | 018 | Kode sumber ganda |
| `SOURCE_IN_USE` | 409 | 018 | Sumber dipakai aset tersimpan |
| `SOURCE_NOT_STORABLE` | 409 | 018 | Sumber tidak boleh menyimpan salinan |
| `ASSET_CODE_TAKEN` | 409 | 018 | `asset_code` ganda |
| `DUPLICATE_ASSET` | 409 | 018 | Berkas identik sudah ada |
| `UNSUPPORTED_FILE_TYPE` | 415 | 018, 019 | Jenis berkas tidak didukung |
| `MACRO_NOT_ALLOWED` | 415 | 018 | DOCX bermakro |
| `ASSET_ALREADY_EXISTS` | 409 | 018 | Video dengan `external_ref` sama ada |
| `RIGHTS_SOURCE_MISMATCH` | 409 | 018 | Status hak tidak cocok sumber |
| `ATTRIBUTION_REQUIRED` | 409 | 018 | Atribusi wajib |
| `ASSET_IN_PUBLISHED_USE` | 409 | 018 | Aset dirujuk konten terpublikasi |
| `ASSET_IN_USE` | 409 | 018 | Aset dirujuk konten |
| `IMPORT_FILE_INVALID` | 400 | 019 | Berkas impor melanggar aturan sinkron |
| `IMPORT_IN_PROGRESS` | 409 | 019 | Ada batch aktif |
| `DUPLICATE_BATCH` | 409 | 019 | `file_sha256` sama |
| `BATCH_NOT_PUBLISHABLE` | 409 | 019 | Status bukan `PREVIEW_READY` |
| `BATCH_HAS_ERRORS` | 409 | 019 | Ada item `INVALID` |
| `WARNINGS_NOT_ACKNOWLEDGED` | 409 | 019 | Peringatan belum diakui |
| `BATCH_NOT_CANCELLABLE` | 409 | 019 | Status tidak dapat dibatalkan |
| `BATCH_NOT_ROLLBACKABLE` | 409 | 019 | Status bukan `PUBLISHED` |
| `ROLLBACK_BLOCKED` | 409 | 019 | Ada data pengguna menahan rollback |
| `ORDER_INDEX_TAKEN` | 409 | 020 | `order_index` bentrok |
| `SET_HAS_ACTIVE_ATTEMPTS` | 409 | 020 | Set punya attempt berjalan |
| `INVALID_STATUS_TRANSITION` | 409 | 020 | Transisi status tidak diizinkan |
| `PUBLISH_BLOCKED` | 409 | 020 (dan 019 sebagai `summary.last_error`) | Ada penghalang publikasi |
| `REVIEW_CONFIRMATION_REQUIRED` | 409 | 020 | Konfirmasi reviu konten AI wajib |
| `CONFLICT_RETRY` | 409 | 020 | Konflik versi, muat ulang dan coba lagi |

Kode galat job (bukan HTTP; ada di `JobDTO.error_code`): `LLM_UNREACHABLE`, `LLM_TIMEOUT`, `LLM_ERROR`, `LLM_INVALID_OUTPUT`, `STT_UNREACHABLE`, `STT_EMPTY`, `AUDIO_UNREADABLE`, `AUDIO_TOO_LONG`, `AUDIO_TOO_SHORT`, `INTERNAL`, `VALIDATION_CHANGED`, `PUBLISH_BLOCKED`.

## 3. Bucket Rate Limit (in-memory token bucket per proses; kuota harian di Postgres)
| Bucket | Kunci | Batas | Endpoint |
|---|---|---|---|
| `login_ip` | IP | 5/menit | `POST /auth/login` |
| `login_email` | email huruf kecil | 10/15 menit | `POST /auth/login` |
| `register_ip` | IP | 5/jam | `POST /auth/register` |
| `account_action` | user | 5/jam | `POST /auth/change-password` |
| `general_ip` | IP | 60/menit | endpoint `public` |
| `general_user` | user | 300/menit | semua endpoint terautentikasi (default) |
| `answer_submit` | user | 60/menit | `PUT /attempts/{id}/answers/{qid}` |
| `attempt_start` | user | 30/jam | `POST /attempts` |
| `heartbeat` | user + endpoint | 30/menit | `POST .../learn-progress`, `PUT /me/last-learned` |
| `job_poll` | user | 1/detik | `GET /submissions/{id}` |
| `upload_recording` | user | 10/jam | `POST /submissions/speaking` |
| `import_admin` | user | 10/jam | `POST /admin/import-batches` |
| Kuota AI | user (DB) | `ai.daily_limit_per_user` per 24 jam bergulir; 1 submission aktif; antrean global `ai.queue_max` | `POST /submissions/writing|speaking` |
IP diambil dari `X-Forwarded-For` hanya bila berasal dari proxy tepercaya (`AUTH_TRUST_HOST=true`); disimpan sebagai HMAC (`ip_hash`).

## 4. DTO Bersama (Zod; `src/contracts/common.ts`)
```ts
import { z } from 'zod';
export const Uuid = z.uuid();
export const IsoDateTime = z.iso.datetime();
export const Band = z.number().min(0).max(9).multipleOf(0.5);
export const SkillCategory = z.enum(['GRAMMAR','VOCAB','LISTENING','READING','WRITING','SPEAKING']);
export const ProgressStatus = z.enum(['LOCKED','UNLOCKED','IN_PROGRESS','COMPLETED','SKIPPED']);
export const ReviewStatus = z.enum(['DRAFT','IN_REVIEW','APPROVED','PUBLISHED','ARCHIVED']);
export const AssessmentType = z.enum(['ACTIVE_DRILL','SKIP_MODULE_TEST','SKIP_TIER_TEST','TIER_BOSS_EXAM','PLACEMENT_TEST','BOSS_SECTION']);

export const ErrorBodySchema = z.strictObject({
  error: z.strictObject({
    code: z.string(), message: z.string(), request_id: Uuid,
    details: z.array(z.strictObject({ path: z.string(), code: z.string(), message: z.string() })).optional(),
  }),
});
export const PageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export const PageMetaSchema = z.strictObject({ page: z.number().int(), page_size: z.number().int(), total: z.number().int() });

export const UserDTO = z.strictObject({
  id: Uuid, email: z.string(), display_name: z.string(), role: z.enum(['learner','admin']),
  target_band: Band.nullable(), must_change_password: z.boolean(),
  consent_recording_at: IsoDateTime.nullable(), keep_recordings: z.boolean(),
  placement_completed_at: IsoDateTime.nullable(),
});
export const JobDTO = z.strictObject({
  id: Uuid,
  kind: z.enum(['GRADE_WRITING','GRADE_SPEAKING','STT_TRANSCRIBE','IMPORT_VALIDATE','IMPORT_PUBLISH']),
  status: z.enum(['QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED']),
  stage: z.enum(['TRANSCRIBING','GRADING','SAVING']).nullable(),
  progress_percent: z.number().int().min(0).max(100),
  queue_position: z.number().int().nullable(), error_code: z.string().nullable(), attempt: z.number().int(),
});
export const QuotaDTO = z.strictObject({
  limit: z.number().int(), used: z.number().int(), remaining: z.number().int(), resets_at: IsoDateTime.nullable(),
});
export const EvaluationFlagsDTO = z.strictObject({
  injection_suspected: z.boolean(), score_capped: z.boolean(),
  cap_reason: z.enum(['word_count','non_english','duration']).nullable(),
  high_band_capped: z.boolean(), non_english_suspected: z.boolean(), overall_recomputed: z.boolean(),
  pronunciation_estimated: z.boolean(), low_audio_quality: z.boolean(),
});
```
Skema Zod per fitur berada di `src/contracts/<modul>.ts`: `auth` (001), `admin` (002), `curriculum` (003), `content` (004), `player` (005), `attempts` (006), `resume` (007), `exams` (008, 014), `band` (009), `ai` (012, 013), `placement` (015), `gamification` (016), `skills` (017), `assets` (018), `import` (019), `curation` (020), `health` (000). `QuestionPublicSchema`, `AnswerResponseSchema`, `AttemptSchema`, `AttemptResultSchema` didefinisikan di `attempts.ts` sesuai tabel SPEC-006. Tipe TypeScript klien diturunkan dengan `z.infer`; klien dan server memakai berkas yang sama.

## 5. Indeks Endpoint
Auth: P = public, U = user, A = admin. Zod = modul di atas.

| # | Method + Path | Auth | Spec | Sukses |
|---|---|---|---|---|
| 1 | `GET /api/health` | P | 000 | 200 |
| 2 | `GET /api/v1/auth/signup-config` | P | 001 | 200 |
| 3 | `POST /api/v1/auth/register` | P | 001 | 201 |
| 4 | `POST /api/v1/auth/login` | P | 001 | 200 |
| 5 | `POST /api/v1/auth/logout` | U | 001 | 204 |
| 6 | `GET /api/v1/auth/me` | U | 001 | 200 |
| 7 | `POST /api/v1/auth/change-password` | U | 001 | 200 |
| 8 | `PATCH /api/v1/me/profile` | U | 001 | 200 |
| 9 | `GET /api/v1/admin/users` | A | 002 | 200 |
| 10 | `POST /api/v1/admin/users` | A | 002 | 201 |
| 11 | `PATCH /api/v1/admin/users/{user_id}` | A | 002 | 200 |
| 12 | `POST /api/v1/admin/users/{user_id}/reset-password` | A | 002 | 200 |
| 13 | `POST /api/v1/admin/users/{user_id}/delete` | A | 002 | 204 |
| 14 | `POST /api/v1/admin/invites` | A | 002 | 201 |
| 15 | `GET /api/v1/admin/invites` | A | 002 | 200 |
| 16 | `DELETE /api/v1/admin/invites/{invite_id}` | A | 002 | 204 |
| 17 | `GET /api/v1/admin/settings` | A | 002 | 200 |
| 18 | `PUT /api/v1/admin/settings/{key}` | A | 002 | 200 |
| 19 | `GET /api/v1/admin/audit-log` | A | 002 | 200 |
| 20 | `GET /api/v1/admin/health` | A | 002 | 200 |
| 21 | `GET /api/v1/curriculum/tree` | U | 003 | 200 |
| 22 | `POST /api/v1/admin/users/{user_id}/progress/unlock` | A | 003 | 200 |
| 23 | `GET /api/v1/sub-modules/{sub_module_code}` | U | 005 | 200 |
| 24 | `POST /api/v1/sub-modules/{sub_module_id}/learn-progress` | U | 005 | 200 |
| 25 | `POST /api/v1/sub-modules/{sub_module_id}/learn-complete` | U | 005 | 200 |
| 26 | `POST /api/v1/sub-modules/{sub_module_id}/mini-task/complete` | U | 005 | 200 |
| 27 | `GET /api/v1/assets/{asset_id}/file` | U | 005 | 200/304 |
| 28 | `POST /api/v1/attempts` | U | 006 (008, 014, 015 ekstensi) | 201/200 |
| 29 | `GET /api/v1/attempts/{attempt_id}` | U | 006 | 200 |
| 30 | `PUT /api/v1/attempts/{attempt_id}/answers/{question_id}` | U | 006 (015 ekstensi) | 200 |
| 31 | `POST /api/v1/attempts/{attempt_id}/submit` | U | 006 | 200 |
| 32 | `GET /api/v1/attempts/{attempt_id}/result` | U | 006 | 200 |
| 33 | `PUT /api/v1/me/last-learned` | U | 007 | 200 |
| 34 | `GET /api/v1/me/last-learned` | U | 007 | 200 |
| 35 | `GET /api/v1/exams/{assessment_set_id}/intro` | U | 008 (014, 015 ekstensi) | 200 |
| 36 | `GET /api/v1/band-tables/active` | U | 009 | 200 |
| 37 | `GET /api/v1/admin/band-tables` | A | 009 | 200 |
| 38 | `GET /api/v1/admin/band-tables/{table_id}` | A | 009 | 200 |
| 39 | `POST /api/v1/admin/band-tables` | A | 009 | 201 |
| 40 | `POST /api/v1/admin/band-tables/{table_id}/activate` | A | 009 | 200 |
| 41 | `DELETE /api/v1/admin/band-tables/{table_id}` | A | 009 | 204 |
| 42 | `GET /api/v1/attempts/{attempt_id}/audio` | U | 011 (014 query `section`) | 200/206 |
| 43 | `POST /api/v1/submissions/writing` | U | 012 | 202 |
| 44 | `GET /api/v1/submissions/{submission_id}` | U | 012 | 200 |
| 45 | `GET /api/v1/submissions` | U | 012 | 200 |
| 46 | `POST /api/v1/submissions/{submission_id}/retry` | U | 012 (013 perilaku) | 202 |
| 47 | `POST /api/v1/submissions/{submission_id}/self-assessment` | U | 012 (013 perilaku) | 201 |
| 48 | `GET /api/v1/ai/status` | U | 012 (013 field) | 200 |
| 49 | `GET /api/v1/admin/submissions/{submission_id}` | A | 012 | 200 |
| 50 | `POST /api/v1/me/recording-consent` | U | 013 | 200 |
| 51 | `PATCH /api/v1/me/recording-preferences` | U | 013 | 200 |
| 52 | `POST /api/v1/submissions/speaking` | U | 013 | 202 |
| 53 | `GET /api/v1/submissions/{submission_id}/recording` | U | 013 | 200/206 |
| 54 | `DELETE /api/v1/submissions/{submission_id}/recording` | U | 013 | 204 |
| 55 | `GET /api/v1/admin/submissions/{submission_id}/recording` | A | 013 | 200/206 |
| 56 | `POST /api/v1/attempts/{attempt_id}/sections/{section_set_id}/start` | U | 014 | 200 |
| 57 | `POST /api/v1/attempts/{attempt_id}/sections/{section_set_id}/submit` | U | 014 | 200 |
| 58 | `GET /api/v1/placement` | U | 015 | 200 |
| 59 | `POST /api/v1/placement/apply` | U | 015 | 200 |
| 60 | `GET /api/v1/me/stats` | U | 016 | 200 |
| 61 | `GET /api/v1/me/points` | U | 016 | 200 |
| 62 | `GET /api/v1/me/skills/radar` | U | 017 | 200 |
| 63 | `GET /api/v1/me/band-predictions` | U | 017 | 200 |
| 64 | `GET /api/v1/me/exam-history` | U | 017 | 200 |
| 65 | `GET /api/v1/admin/content-sources` | A | 018 | 200 |
| 66 | `POST /api/v1/admin/content-sources` | A | 018 | 201 |
| 67 | `PATCH /api/v1/admin/content-sources/{source_id}` | A | 018 | 200 |
| 68 | `POST /api/v1/admin/assets` | A | 018 | 201 |
| 69 | `POST /api/v1/admin/assets/external` | A | 018 | 201 |
| 70 | `GET /api/v1/admin/assets` | A | 018 | 200 |
| 71 | `GET /api/v1/admin/assets/{asset_id}` | A | 018 | 200 |
| 72 | `GET /api/v1/admin/assets/{asset_id}/file` | A | 018 | 200 |
| 73 | `PATCH /api/v1/admin/assets/{asset_id}` | A | 018 | 200 |
| 74 | `DELETE /api/v1/admin/assets/{asset_id}` | A | 018 | 204 |
| 75 | `GET /api/v1/admin/license-summary` | A | 018 | 200 |
| 76 | `POST /api/v1/admin/import-batches` | A | 019 | 201 |
| 77 | `GET /api/v1/admin/import-batches` | A | 019 | 200 |
| 78 | `GET /api/v1/admin/import-batches/{batch_id}` | A | 019 | 200 |
| 79 | `GET /api/v1/admin/import-batches/{batch_id}/items` | A | 019 | 200 |
| 80 | `GET /api/v1/admin/import-batches/{batch_id}/items/{row_number}` | A | 019 | 200 |
| 81 | `POST /api/v1/admin/import-batches/{batch_id}/publish` | A | 019 | 202 |
| 82 | `POST /api/v1/admin/import-batches/{batch_id}/cancel` | A | 019 | 200 |
| 83 | `POST /api/v1/admin/import-batches/{batch_id}/rollback` | A | 019 | 200 |
| 84 | `GET /api/v1/admin/import-templates/{kind}` | A | 019 | 200 |
| 85 | `GET /api/v1/admin/import-contract` | A | 019 | 200 |
| 86 | `GET /api/v1/admin/curriculum` | A | 020 | 200 |
| 87 | `GET /api/v1/admin/sub-modules/{sub_module_id}` | A | 020 | 200 |
| 88 | `PATCH /api/v1/admin/modules/{module_id}` | A | 020 | 200 |
| 89 | `PATCH /api/v1/admin/sub-modules/{sub_module_id}` | A | 020 | 200 |
| 90 | `PATCH /api/v1/admin/sub-modules/{sub_module_id}/material` | A | 020 | 200 |
| 91 | `GET /api/v1/admin/assessment-sets` | A | 020 | 200 |
| 92 | `GET /api/v1/admin/assessment-sets/{set_id}` | A | 020 | 200 |
| 93 | `PATCH /api/v1/admin/assessment-sets/{set_id}` | A | 020 | 200 |
| 94 | `PATCH /api/v1/admin/assessment-sets/{set_id}/questions/{question_id}` | A | 020 | 200 |
| 95 | `POST /api/v1/admin/{entity}/{id}/status` (`entity` = `modules`\|`sub-modules`\|`assessment-sets`) | A | 020 | 200 |
| 96 | `GET /api/v1/admin/assessment-sets/{set_id}/quality` | A | 020 | 200 |
| 97 | `GET /api/v1/admin/content-revisions` | A | 020 | 200 |
| 98 | `GET /api/v1/admin/content-revisions/{revision_id}` | A | 020 | 200 |
Total: 98 endpoint. Tidak ada endpoint yang menerima "tandai selesai", skor, atau status dari klien.

## 6. Rute UI (Next.js App Router)
| Rute | Auth | Spec |
|---|---|---|
| `/masuk`, `/daftar` | publik | 001 |
| `/ganti-password`, `/profil` | user | 001 (013, 016 menambah kartu) |
| `/` (dashboard) | user | 007 (016, 017 menambah slot) |
| `/peta` | user | 003 |
| `/belajar/[sub_module_code]` (query `tab`, `sub`, `t`, `q`, `attempt`) | user | 005, 006, 007 |
| `/ujian/mulai/[assessment_set_id]` | user | 008 (014, 015) |
| `/ujian/[attempt_id]` | user | 006 (008, 010, 011, 014, 015) |
| `/ujian/[attempt_id]/hasil` | user | 008, 014, 015 |
| `/riwayat` (alihkan ke `/riwayat/ujian`), `/riwayat/ujian` | user | 017 |
| `/riwayat/penilaian`, `/riwayat/penilaian/[submission_id]` | user | 012 |
| `/admin`, `/admin/pengguna`, `/admin/undangan`, `/admin/pengaturan`, `/admin/audit` | admin | 002 |
| `/admin/band` | admin | 009 |
| `/admin/konten/sumber`, `/admin/konten/aset` | admin | 018 |
| `/admin/impor`, `/admin/impor/[batch_id]` | admin | 019 |
| `/admin/konten/kurikulum`, `/admin/konten/soal`, `/admin/konten/revisi` | admin | 020 |

## 7. Registri Hook dan Titik Ekstensi (untuk menghindari ambiguitas urutan)
| Nama | Lokasi | Penerima awal -> pendaftar |
|---|---|---|
| `userCreatedHooks` | `src/server/auth/hooks.ts` | dipanggil 001 -> 003 `initializeProgress`, 016 buat `user_stats` |
| `userAnonymizedHooks` | `src/server/auth/hooks.ts` | dipanggil 002 -> 013 hapus rekaman |
| `assessmentTypeHandlers` | `src/server/attempts/handlers.ts` | 006 `ACTIVE_DRILL`; 008 `SKIP_MODULE_TEST`, `SKIP_TIER_TEST`; 014 `TIER_BOSS_EXAM`; 015 `PLACEMENT_TEST` |
| `attemptCompletedHooks` | `src/server/attempts/hooks.ts` | urutan tetap: (1) handler tipe + `GatekeepingService` (dalam handler), (2) 016 `gamificationHook`, (3) 017 `skillScoreHook` |
| `evaluationGradedHooks` | `src/server/ai/hooks.ts` | 012/013 memanggil -> 017 `skillScoreEvaluationHook`; penyelesaian Mini-Task |
| `activityHooks` | `src/server/activity/hooks.ts` | dipanggil 005 (`learn-complete`, Mini-Task) dan 006 -> 016 `recordActivity` |
| `seedModules` (urutan) | `scripts/seed.ts` | 000 `content_sources`, `app_settings`; 004 `curriculum-structure`; 009 `band-tables`; 012 `rubrics-writing`; 013 `rubrics-speaking` |
| `jobHandlers` | `src/worker/index.ts` | 012 `ai-grade-writing`; 013 `stt-transcribe`, `ai-grade-speaking`; 019 `import-validate`, `import-publish` |
| `purgeTasks` | `src/worker/purge.ts` | 002 `anonymizeDeletedUsers`; 012 `purgeAiRawOutput`; 013 `purgeRecordings`; 019 `purgeImportBatches` |
Semua hook berjalan di dalam transaksi pemicu; kegagalan membatalkan transaksi.

## 8. Registri `app_settings` (nilai default disemai `db:seed`; diubah lewat `PUT /admin/settings/{key}`)
Tipe `int` = bilangan bulat dalam [min, max]; `enum` = salah satu nilai. Kunci di luar tabel ini TIDAK ada (404). `skip.default_threshold` pada `data-model.md` TIDAK dipakai (digantikan `tiers.skip_threshold_percent`).

| Kunci | Tipe | Min-Max / Nilai | Default | Spec | Deskripsi |
|---|---|---|---|---|---|
| `signup.mode` | enum | `open`, `invite`, `closed` | `invite` (disemai dari env `SIGNUP_MODE`) | 001 | Mode pendaftaran |
| `learn.min_active_seconds` | int | 10-3600 | 60 | 005 | Waktu belajar aktif minimal sebelum "Selesai Belajar" |
| `drill.question_count` | int | 1-50 | 10 | 006 | Jumlah soal Active Drill |
| `speed.default_target_ms` | int | 1000-600000 | 20000 | 006 | Target waktu per soal bila soal tak punya `target_time_ms` |
| `attempt.cooldown_minutes` | int | 0-1440 | 60 | 008, 014 | Jeda antar percobaan Skip/Boss |
| `attempt.max_per_set_per_day` | int | 1-20 | 3 | 008, 014 | Maks percobaan baru per set per 24 jam |
| `placement.question_count` | int | 10-50 | 25 | 015 | Jumlah soal Placement |
| `ai.daily_limit_per_user` | int | 1-100 | 10 (semai dari env `AI_DAILY_LIMIT_PER_USER`) | 012 | Kuota submission AI per 24 jam |
| `ai.queue_max` | int | 1-100 | 20 | 012 | Maks job AI menunggu |
| `retention.audio_days` | int | 1-365 | 90 (semai dari env `AUDIO_RETENTION_DAYS`) | 013 | Retensi rekaman Speaking setelah dinilai |
| `retention.ai_raw_output_days` | int | 1-365 | 180 | 012 | Retensi `ai_evaluations.raw_output` |
| `crown.silver_min` | int | 1-100 | 75 | 016 | Ambang Silver |
| `crown.gold_min` | int | 1-100 | 90 | 016 | Ambang Gold (harus > `crown.silver_min`; pelanggaran: 400 `VALIDATION_ERROR` `gold_not_greater_than_silver`) |
| `points.correct_answer` | int | 0-1000 | 10 | 016 | Poin per jawaban benar Drill |
| `points.speed_streak_min` | int | 2-20 | 3 | 016 | Panjang streak minimal untuk bonus |
| `points.speed_streak_bonus` | int | 0-1000 | 5 | 016 | Bonus per jawaban ber-streak |
| `points.crown_silver` | int | 0-10000 | 50 | 016 | Poin mahkota Silver |
| `points.crown_gold` | int | 0-10000 | 100 | 016 | Poin mahkota Gold (total) |
| `points.mini_task` | int | 0-10000 | 20 | 016 | Poin Mini-Task |
| `points.boss_pass` | int | 0-10000 | 200 | 016 | Poin lulus Boss |
| `points.daily_activity` | int | 0-1000 | 5 | 016 | Poin aktivitas harian pertama |
Kunci sistem tersembunyi: `system.worker_heartbeat_at` (SPEC-002).

## 9. Rekap Delta Skema (di atas `schema.reference.ts`; satu migrasi Drizzle per baris)
| Spec | Tag migrasi | Perubahan |
|---|---|---|
| 000 | `0000_init`, `0001_circular_fk`, `0002_custom_views_triggers` | Baseline 31 tabel, FK melingkar, view `v_publish_blockers`, REVOKE/GRANT |
| 001 | `spec_001_auth_security` | `users` + `token_version integer NN 0`, `must_change_password boolean NN false`, `last_failed_login_at timestamptz NULL`, `consent_recording_at timestamptz NULL`, `keep_recordings boolean NN true`; tabel `signup_invites` |
| 004 | `spec_004_content_foundation` | `content_assets.asset_code varchar(80) NULL UNIQUE` (parsial) |
| 005 | `spec_005_learn_evidence` | `user_sub_module_progress` + `learn_active_seconds integer NN 0`, `learn_visited_subtabs text[] NN '{}'`, `learn_last_ping_at timestamptz NULL` |
| 012 | `spec_012_ai_flags` | `ai_evaluations.flags jsonb NN '{}'` |
| 016 | `spec_016_points_unique` | indeks unik parsial `point_ledger_once_uq` |
Delta keamanan (`security-standards.md` bagian 16) terpetakan: `token_version` (001), `signup_invites` (001), `ai_evaluations.flags` (012), persetujuan rekaman (`consent_recording_at` + `keep_recordings`, 001/013), cooldown dan ambang (`app_settings`, bagian 8).

## 10. Tinjauan Konsistensi (Low-Entropy Gate lintas spec)
- Nama tabel/kolom/enum identik dengan `data-model.md` dan `schema.reference.ts`; nama baru hanya yang ada di bagian 9.
- Satu tempat per konsep: gerbang (003), penilaian soal (006), konversi band (009), kuota/pipeline AI (012), rekaman (013), poin (016), skor skill (017). Spec lain hanya merujuk.
- Tidak ada endpoint yang menerima skor/status/ID pemilik dari klien; kunci jawaban hanya keluar sesuai SPEC-006 D9/D10.

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-03 | Analyst | Kontrak FINAL awal: 98 endpoint, registri error, bucket rate limit, DTO Zod, registri hook, `app_settings`, delta skema |
| 2026-11-03 | Backend Engineer | Spec 005 aditif: `progress.min_active_seconds` pada `GET /sub-modules/{code}`; regex kode sub-modul dilonggarkan satu digit tier (lihat spec 005). Tidak ada perubahan path/method. |
| 2026-11-03 | Backend Engineer | Bagian 8/spec 002: `SettingDTO.options` (aditif, enum). Bagian 5: tidak ada perubahan path/method. Kode `INVALID_STATUS_TRANSITION` dipakai `PublishService.changeStatus` (status 409). |
