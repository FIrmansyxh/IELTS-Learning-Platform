# SPEC-002: Admin Dasar (Kelola Pengguna, Undangan, Pengaturan, Audit, Kesehatan Sistem)

> **DIGANTIKAN (superseded) oleh SPEC-025 / ADR-005 (2026-11-08).** Login, daftar, undangan, dan password dihapus; aplikasi memakai profil lokal. Dokumen ini dipertahankan sebagai riwayat.

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-000, SPEC-001
- **Prioritas:** P0
- **Cakupan:** Backend + Frontend

## User Story
Sebagai Admin (pemilik platform), saya ingin membuat undangan pendaftaran, mengelola akun pengguna (buat, nonaktifkan, ubah peran, reset password, hapus), mengubah pengaturan operasional, dan melihat audit serta kesehatan sistem, sehingga saya dapat mengendalikan siapa yang memakai platform dan memantau keamanannya tanpa mengakses database langsung.

## Non-Goals / Out of Scope
- Tidak ada ekspor data pengguna, impersonasi login sebagai pengguna lain, atau pengiriman email.
- Tidak ada pengelolaan peran lebih dari dua (`learner`, `admin`) dan tidak ada izin granular.
- Tidak ada UI untuk melihat teks Writing/rekaman pengguna (SPEC-012/013 menyediakan akses admin dengan audit).
- Tidak ada pengelolaan konten, sumber, aset, tabel band (SPEC-009, 018, 019, 020).
- Tidak ada hapus permanen akun (hanya soft delete + anonimisasi terjadwal).
- Tidak ada pemicu manual job retensi dari UI.
- Tidak ada dashboard metrik historis; hanya status saat ini.

## Technical Flow
1. Admin membuka `/admin`; server memeriksa `requireAdmin()` (sesi aktif, `role='admin'`, `token_version` cocok) pada setiap permintaan halaman dan API.
2. Admin membuka `/admin/undangan`, menekan "Buat Undangan", memilih masa berlaku (hari); browser memanggil `POST /api/v1/admin/invites`.
3. Server membuat kode acak 20 karakter Crockford base32 (CSPRNG), menyimpan SHA-256 dari kode ternormalisasi di `signup_invites.code_hash`, menulis `audit_log` `INVITE_CREATED`, dan mengembalikan kode mentah SATU KALI.
4. Admin menyalin kode dan membagikannya ke calon pengguna di luar aplikasi.
5. Admin membuka `/admin/pengguna` dan memanggil `GET /api/v1/admin/users` untuk daftar; memakai aksi baris untuk `PATCH` (peran/status), `reset-password`, atau `delete`.
6. Pada setiap perubahan peran/status/reset/hapus, server menaikkan `users.token_version` 1 sehingga semua sesi pengguna itu tidak valid, lalu menulis `audit_log`.
7. Admin membuka `/admin/pengaturan`, mengubah nilai kunci `app_settings` lewat `PUT /api/v1/admin/settings/{key}`; server memvalidasi nilai terhadap registri (`_api-contract.md` bagian 8), menyimpan, dan menulis `audit_log` `SETTINGS_CHANGED` dengan nilai lama dan baru.
8. Admin membuka `/admin/audit` dan memanggil `GET /api/v1/admin/audit-log` dengan filter.
9. Admin membuka `/admin` (ringkasan) yang memanggil `GET /api/v1/admin/health`.
10. Job terjadwal `retention-purge` (SPEC-000) menjalankan tugas `anonymizeDeletedUsers` setiap hari: untuk `users` dengan `deleted_at <= now() - interval '30 days'` dan belum teranonimisasi, server menimpa `email = 'deleted-<id>@invalid'`, `display_name = 'Pengguna dihapus'`, `password_hash = '!deleted'`, lalu memanggil `userAnonymizedHooks` (SPEC-013 menghapus file rekaman) dan menulis `audit_log` `USER_ANONYMIZED`.

## API Contract
Konvensi umum: `_api-contract.md` bagian 1. Semua endpoint di bawah: **Auth: admin**. Kode umum yang berlaku: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN` (403; sesi `learner`), `PASSWORD_CHANGE_REQUIRED`, `CSRF_ORIGIN_MISMATCH` (mutasi), `NOT_FOUND` (path id), `RATE_LIMITED`, `INTERNAL_ERROR`. Zod di `src/contracts/admin.ts`. Bucket rate limit: `general_user` (300/menit) kecuali disebut lain.

**`AdminUserDTO`:** `{ id: uuid, email: string, display_name: string, role: "learner"|"admin", status: "ACTIVE"|"DISABLED", target_band: number|null, must_change_password: boolean, last_login_at: string|null, created_at: string, deleted_at: string|null }`

### GET /api/v1/admin/users
- **Success status:** 200 | **Zod:** `AdminUserListQuerySchema`

| Query | Type | Required | Constraint |
|---|---|---|---|
| `page` | int | tidak | >= 1, default 1 |
| `page_size` | int | tidak | 1-100, default 20 |
| `q` | string | tidak | trim, 1-100; cocok `ILIKE` pada `email` atau `display_name` (karakter `%` `_` di-escape) |
| `role` | enum | tidak | `learner` \| `admin` |
| `status` | enum | tidak | `ACTIVE` \| `DISABLED` |
| `include_deleted` | boolean | tidak | default `false` |

Urutan: `created_at DESC`.
**Response (Success):**
```json
{ "data": [ { "id": "b8f2c1a4-5d3e-4a7b-9c21-0e6f7a8b9c10", "email": "budi.santoso@example.test", "display_name": "Budi Santoso", "role": "learner", "status": "ACTIVE", "target_band": 6.0, "must_change_password": false, "last_login_at": "2026-11-03T09:12:44.000Z", "created_at": "2026-11-01T03:00:00.000Z", "deleted_at": null } ], "meta": { "page": 1, "page_size": 20, "total": 1 } }
```
**Response (Error):** hanya kode umum.

### POST /api/v1/admin/users
- **Success status:** 201 | **Zod:** `AdminCreateUserRequestSchema`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `email` | string | ya | aturan sama dengan SPEC-001 register |
| `display_name` | string | ya | 2-80 |
| `role` | enum | ya | `learner` \| `admin` |
```json
{ "email": "sari.dewi@example.test", "display_name": "Sari Dewi", "role": "learner" }
```
**Response (Success) 201:**
```json
{ "data": { "user": { "id": "0c7d9e12-34ab-4cde-8f01-23456789abcd", "email": "sari.dewi@example.test", "display_name": "Sari Dewi", "role": "learner", "status": "ACTIVE", "target_band": null, "must_change_password": true, "last_login_at": null, "created_at": "2026-11-03T10:00:00.000Z", "deleted_at": null }, "temporary_password": "Qm7vXk3PzR9tNc2H" } }
```
`temporary_password`: 16 karakter acak (CSPRNG) dari alfabet `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789`; hanya muncul di respons ini dan tidak disimpan; `must_change_password=true`.
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 409 | EMAIL_TAKEN | Email sudah ada (tanpa membedakan huruf), termasuk akun terhapus yang belum teranonimisasi |

### PATCH /api/v1/admin/users/{user_id}
- **Success status:** 200 | **Zod:** `AdminUpdateUserRequestSchema`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `role` | enum | tidak | `learner` \| `admin` |
| `status` | enum | tidak | `ACTIVE` \| `DISABLED` |
Minimal satu field. Path `user_id`: uuid.
```json
{ "status": "DISABLED" }
```
**Response (Success) 200:** `{ "data": { "user": <AdminUserDTO terbaru> } }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body kosong (`empty_update`) atau field tak dikenal |
| 404 | NOT_FOUND | `user_id` tidak ada atau sudah dihapus |
| 409 | CANNOT_MODIFY_SELF | `user_id` = id admin yang memanggil. Pesan: "Anda tidak dapat mengubah akun Anda sendiri." |
| 409 | LAST_ADMIN | Perubahan membuat jumlah admin `ACTIVE` menjadi 0. Pesan: "Minimal satu admin aktif harus tersisa." |

### POST /api/v1/admin/users/{user_id}/reset-password
- **Success status:** 200 | **Request body:** tidak ada
**Response (Success) 200:** `{ "data": { "temporary_password": "Hx4dTn8WbK2mYp6Z" } }` (aturan sama dengan di atas; set `must_change_password=true`; `token_version` +1; reset `failed_login_count=0`, `locked_until=NULL`).
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Pengguna tidak ada atau terhapus |
| 409 | CANNOT_MODIFY_SELF | Target adalah admin pemanggil (gunakan `change-password`) |

### POST /api/v1/admin/users/{user_id}/delete
- **Success status:** 204 | **Request body:** tidak ada
Efek: `deleted_at = now()`, `status = 'DISABLED'`, `token_version` +1, `audit_log` `USER_DELETED`. Anonimisasi 30 hari kemudian (Technical Flow butir 10).
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Pengguna tidak ada atau sudah terhapus |
| 409 | CANNOT_MODIFY_SELF | Target adalah admin pemanggil |
| 409 | LAST_ADMIN | Target adalah satu-satunya admin aktif |

### POST /api/v1/admin/invites
- **Success status:** 201 | **Zod:** `CreateInviteRequestSchema`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `expires_in_days` | int | tidak | 1-30, default 7 |
```json
{ "expires_in_days": 7 }
```
**Response (Success) 201:**
```json
{ "data": { "id": "5e1d7a90-2b3c-4d5e-8f60-718293a4b5c6", "code": "K7QM-4XZP-9T2V-HD8W-RJ3N", "expires_at": "2026-11-10T10:00:00.000Z", "created_at": "2026-11-03T10:00:00.000Z" } }
```
`code`: 20 karakter dari alfabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` dalam 5 kelompok 4 karakter dipisah `-`; muncul sekali; yang tersimpan hanya hash.
**Response (Error):** hanya kode umum.

### GET /api/v1/admin/invites
- **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `status` | enum | tidak | `active` \| `used` \| `expired` \| `revoked` (kosong = semua) |
| `page`, `page_size` | int | tidak | seperti daftar pengguna |
**Response (Success):**
```json
{ "data": [ { "id": "5e1d7a90-2b3c-4d5e-8f60-718293a4b5c6", "status": "used", "expires_at": "2026-11-10T10:00:00.000Z", "created_at": "2026-11-03T10:00:00.000Z", "used_at": "2026-11-03T11:30:00.000Z", "used_by_email": "sari.dewi@example.test", "revoked_at": null } ], "meta": { "page": 1, "page_size": 20, "total": 1 } }
```
Status turunan: `revoked` bila `revoked_at` terisi; `used` bila `used_at` terisi; `expired` bila `expires_at <= now()`; selain itu `active`. Kode tidak pernah dikembalikan.

### DELETE /api/v1/admin/invites/{invite_id}
- **Success status:** 204 (set `revoked_at = now()`, `audit_log` `INVITE_REVOKED`)
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Undangan tidak ada |
| 409 | INVITE_NOT_ACTIVE | Undangan sudah terpakai, kedaluwarsa, atau dicabut |

### GET /api/v1/admin/settings
- **Success status:** 200
**Response (Success):**
```json
{ "data": [ { "key": "attempt.cooldown_minutes", "value": 60, "default": 60, "type": "int", "min": 0, "max": 1440, "description": "Jeda minimal antar percobaan Skip Test/Boss pada set yang sama (menit).", "updated_at": "2026-11-03T08:00:00.000Z", "updated_by": null } ] }
```
Daftar kunci = registri `_api-contract.md` bagian 8 (semua kunci selalu muncul; bila baris DB hilang, `value` = `default`).

### PUT /api/v1/admin/settings/{key}
- **Success status:** 200 | **Zod:** `UpdateSettingRequestSchema`
Path `key`: harus salah satu kunci registri, selain itu 404 `NOT_FOUND`.
| Field | Type | Required | Constraint |
|---|---|---|---|
| `value` | sesuai tipe kunci | ya | `int`: bilangan bulat dalam [min,max]; `enum`: salah satu nilai; `bool`: true/false |
```json
{ "value": 45 }
```
**Response (Success) 200:** objek satu pengaturan (bentuk sama dengan elemen daftar).
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | `value` bertipe salah atau di luar [min,max]; `details[].code`: `invalid_type`, `out_of_range`, `invalid_enum` |
| 404 | NOT_FOUND | `key` bukan kunci registri |

### GET /api/v1/admin/audit-log
- **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `action` | string | tidak | 1-60, cocok persis |
| `actor_user_id` | uuid | tidak | |
| `entity_type` | string | tidak | 1-40 |
| `from`, `to` | string | tidak | ISO-8601 UTC; `from <= to` |
| `page`, `page_size` | int | tidak | seperti daftar pengguna |
Urutan `id DESC`.
**Response (Success):**
```json
{ "data": [ { "id": 1042, "actor_user_id": "b8f2c1a4-5d3e-4a7b-9c21-0e6f7a8b9c10", "actor_email_masked": "b***@example.test", "action": "AUTH_LOGIN_FAILED", "entity_type": "user", "entity_id": "b8f2c1a4-5d3e-4a7b-9c21-0e6f7a8b9c10", "metadata": { "reason": "bad_password" }, "ip_hash_prefix": "9f2a41c7", "created_at": "2026-11-03T09:12:40.000Z" } ], "meta": { "page": 1, "page_size": 20, "total": 1 } }
```
**Response (Error):** `VALIDATION_ERROR` (`from > to`: `details[].code = "range_invalid"`).

### GET /api/v1/admin/health
- **Success status:** 200
**Response (Success):**
```json
{ "data": { "db": { "status": "up", "latency_ms": 3 }, "queue": { "waiting": 2, "active": 1, "failed_24h": 0, "oldest_waiting_age_sec": 41 }, "llm": { "enabled": true, "driver": "ollama", "status": "up", "model_writing": "qwen2.5:3b-instruct", "model_speaking": "qwen2.5:3b-instruct" }, "stt": { "status": "up", "model": "base" }, "worker": { "heartbeat_age_sec": 7 }, "disk": { "assets_used_mb": 512, "assets_free_mb": 48230 }, "app": { "version": "0.1.0", "node": "22.20.0" } } }
```
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `db.status` | `"up"` \| `"down"` | tidak | `SELECT 1` < 2 dtk |
| `queue.*` | int | `oldest_waiting_age_sec` nullable bila `waiting = 0` | dari `async_jobs`/pg-boss |
| `llm.status` | `"up"` \| `"down"` \| `"disabled"` | tidak | `GET {OLLAMA_BASE_URL}/api/tags` timeout 2 dtk; `disabled` bila `AI_ENABLED=false` |
| `stt.status` | `"up"` \| `"down"` \| `"disabled"` | tidak | `GET {STT_BASE_URL}/` timeout 2 dtk |
| `worker.heartbeat_age_sec` | int | nullable bila belum pernah tercatat | detik sejak nilai `app_settings` kunci `system.worker_heartbeat_at` (worker memperbaruinya tiap 15 dtk) |
| `disk.*` | int (MB) | tidak | `statfs` pada `ASSETS_DIR` |
**Response (Error):** hanya kode umum. Kegagalan satu komponen TIDAK menggagalkan endpoint (komponen ditandai `down`).

## Database Changes
Tidak ada tabel/kolom baru (memakai `users`, `signup_invites`, `app_settings`, `audit_log` dari SPEC-000/001).
- Seed `app_settings`: seluruh kunci registri `_api-contract.md` bagian 8, ditambah kunci sistem `system.worker_heartbeat_at` (nilai `null`, tidak dapat diubah lewat API; `PUT` ke kunci ini = 404 `NOT_FOUND`; tidak muncul di `GET /settings`).
- Tugas purge terdaftar: `anonymizeDeletedUsers` di `purgeTasks`.
- Nilai `audit_log.action` yang ditulis spec ini: `INVITE_CREATED`, `INVITE_REVOKED`, `USER_CREATED_BY_ADMIN`, `USER_ROLE_CHANGED`, `USER_STATUS_CHANGED`, `USER_PASSWORD_RESET`, `USER_DELETED`, `USER_ANONYMIZED`, `SETTINGS_CHANGED`. `metadata` tidak memuat email mentah, password, atau kode undangan.

## UI/UX
Rujukan: `design-system.md` 5.5 Navbar (sidebar admin), 5.6 Table, 5.4 Modal/Dialog/Sheet, 5.2 Input/Form, 5.7 Badge/Toast/Skeleton.

| Rute | Isi | State |
|---|---|---|
| `/admin` | Kartu ringkasan dari `GET /admin/health` (DB, Antrean, Penilai AI, STT, Worker, Disk) memakai Badge status (ikon + teks: "Aktif", "Mati", "Nonaktif") | loading: Skeleton 6 kartu; error: kartu "Gagal memuat" + Button "Coba lagi" |
| `/admin/pengguna` | Table (kolom: Nama, Email, Peran, Status, Masuk terakhir, Aksi) + Input pencarian + filter Select peran/status + Button "Tambah Pengguna" (Sheet form; hasil menampilkan `temporary_password` dalam Dialog dengan Button "Salin" dan peringatan "Hanya ditampilkan sekali") | kosong: "Belum ada pengguna."; aksi destruktif (nonaktifkan, hapus) lewat Dialog konfirmasi; mobile: Table menjadi daftar kartu |
| `/admin/undangan` | Table undangan + Button "Buat Undangan" (Dialog pilih masa berlaku, hasil kode dalam Dialog dengan Button "Salin") | kosong: "Belum ada undangan." |
| `/admin/pengaturan` | Form per kelompok kunci (Input angka / Select / Switch) dengan label, deskripsi, nilai bawaan, Button "Simpan" per baris | error validasi di bawah field; sukses Toast "Pengaturan disimpan." |
| `/admin/audit` | Table audit + filter aksi, pengguna, rentang tanggal; paginasi | kosong: "Tidak ada catatan untuk filter ini." |

- Layout admin: sidebar (desktop) / bottom sheet menu (mobile) berisi Ringkasan, Pengguna, Undangan, Pengaturan, Audit; spec lain menambah item lewat `src/app/admin/nav.config.ts`.
- Pengguna `learner` yang membuka `/admin/**` dialihkan ke `/` (halaman 403 "Anda tidak punya akses").

## Acceptance Criteria
- [ ] **Given** sesi `learner` **When** memanggil endpoint `/api/v1/admin/*` apa pun **Then** 403 `FORBIDDEN`; tanpa sesi 401 `UNAUTHENTICATED`.
- [ ] **Given** admin **When** `POST /api/v1/admin/invites` **Then** 201, `code` cocok regex `^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$`, baris `signup_invites` hanya menyimpan `code_hash` (64 hex) dan `GET /admin/invites` tidak pernah memuat `code`.
- [ ] **Given** undangan 7 hari **When** `expires_at` terlewati **Then** `GET /admin/invites?status=expired` memuatnya dan register dengan kode itu 403 `INVITE_INVALID`.
- [ ] **Given** undangan aktif **When** `DELETE /admin/invites/{id}` **Then** 204 dan register dengan kode itu 403 `INVITE_INVALID`; memanggil `DELETE` lagi 409 `INVITE_NOT_ACTIVE`.
- [ ] **Given** admin **When** `POST /admin/users` dengan data valid **Then** 201, `temporary_password` 16 karakter dari alfabet yang ditentukan, `must_change_password=true`, dan login dengan password itu sukses lalu semua endpoint non-akun 403 `PASSWORD_CHANGE_REQUIRED`.
- [ ] **Given** pengguna X sedang punya sesi aktif **When** admin `PATCH` `status=DISABLED` **Then** permintaan X berikutnya 401 `UNAUTHENTICATED` dan `users.token_version` naik tepat 1.
- [ ] **Given** hanya satu admin aktif **When** ia mencoba `PATCH` dirinya `role=learner` **Then** 409 `CANNOT_MODIFY_SELF`; **When** admin lain mencoba menurunkan satu-satunya admin tersisa **Then** 409 `LAST_ADMIN`.
- [ ] **Given** dua admin aktif A dan B **When** A menonaktifkan B **Then** 200; **When** kemudian akun lain mencoba menurunkan/menonaktifkan A (admin aktif terakhir) **Then** 409 `LAST_ADMIN`.
- [ ] **Given** `reset-password` pada pengguna X **When** sukses **Then** 200 dengan `temporary_password`, `failed_login_count=0`, `locked_until IS NULL`, `must_change_password=true`, `audit_log` `USER_PASSWORD_RESET`.
- [ ] **Given** pengguna dihapus **When** `GET /admin/users` default **Then** tidak muncul; dengan `include_deleted=true` muncul dengan `deleted_at` terisi; login oleh pengguna itu 401 `INVALID_CREDENTIALS`.
- [ ] **Given** pengguna dengan `deleted_at` 31 hari lalu **When** tugas `anonymizeDeletedUsers` berjalan **Then** `email = 'deleted-<id>@invalid'`, `display_name = 'Pengguna dihapus'`, `password_hash = '!deleted'`, dan menjalankan ulang tugas tidak mengubah apa pun; pengguna dengan `deleted_at` 29 hari lalu tidak berubah.
- [ ] **Given** `PUT /admin/settings/attempt.cooldown_minutes` dengan `{"value": 2000}` **When** dikirim **Then** 400 `VALIDATION_ERROR` `out_of_range`; dengan `{"value": 45}` 200 dan baris `app_settings` berubah serta `audit_log` `SETTINGS_CHANGED` memuat nilai lama (60) dan baru (45).
- [ ] **Given** `GET /admin/settings` **When** tabel `app_settings` kosong **Then** 200 dan semua kunci registri muncul dengan `value = default`.
- [ ] **Given** `GET /admin/audit-log?action=AUTH_LOGIN_FAILED&from=2026-11-03T00:00:00.000Z` **When** dipanggil **Then** hanya baris yang cocok dan urut `id DESC`; `from` > `to` menghasilkan 400 `range_invalid`.
- [ ] **Given** Ollama mati **When** `GET /admin/health` **Then** 200 dengan `llm.status = "down"` dan komponen lain tetap dilaporkan; dalam waktu respons total < 5 detik.
- [ ] **Given** E2E Playwright **When** admin membuat undangan, pengguna mendaftar dengan kode itu, admin menonaktifkan pengguna **Then** pengguna tidak bisa login lagi.

## Edge Cases & Validation
- [ ] `user_id`/`invite_id` bukan uuid: 400 `VALIDATION_ERROR` (`details[].path = "user_id"`, `code = "invalid_uuid"`).
- [ ] `q` berisi `%` atau `_`: diperlakukan literal (di-escape).
- [ ] Membuat pengguna dengan email milik akun terhapus yang belum teranonimisasi: 409 `EMAIL_TAKEN`; setelah anonimisasi, email itu bebas dipakai.
- [ ] `PATCH` yang tidak mengubah nilai (mis. `status` sama): 200 tanpa menaikkan `token_version` dan tanpa `audit_log`.
- [ ] Dua admin mengubah pengaturan sama serentak: yang terakhir menang; keduanya tercatat di `audit_log`.
- [ ] Semua aksi tulis admin menulis `audit_log` dalam transaksi yang sama dengan perubahan data; bila audit gagal, perubahan dibatalkan.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft |
| 2026-11-03 | Backend Engineer | Perubahan kontrak ADITIF: `SettingDTO` (`GET /admin/settings`, `PUT /admin/settings/{key}`) menambah `options: string[] \| null` (nilai pilihan untuk kunci `enum`, `null` untuk `int`) agar UI tidak menanam daftar nilai. Frontend sudah memakainya (`src/contracts/admin.ts`). |
