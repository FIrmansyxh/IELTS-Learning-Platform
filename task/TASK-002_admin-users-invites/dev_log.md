# Dev Log TASK-002: Admin Dasar

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W1)

Spec: `specifications/002_spec_admin_users_invites.md`. Kontrak Zod mengikuti `src/contracts/admin.ts` (dimiliki Backend; klien mengonsumsi skemanya).

### Yang dibangun
- **Rute** (`codes/src/app/admin/`): `layout.tsx` (AuthenticatedLayout + `AdminGuard` + `AdminNav`), `page.tsx` (ringkasan kesehatan), `pengguna`, `undangan`, `pengaturan`, `audit`; `nav.config.ts` (titik ekstensi untuk spec admin lain).
- **Komponen** (`components/admin/`): `health-cards` (6 kartu, Badge ikon+teks Aktif/Mati/Nonaktif, polling 30 dtk, Skeleton, error + "Coba lagi"), `users-panel` (+ `create-user-sheet`, `unlock-sheet`), `invites-panel`, `settings-panel`, `audit-panel`, `responsive-list` (tabel >= md, kartu label:nilai di mobile, state loading/error/kosong, paginasi), `dialogs` (`SecretDialog`, `ConfirmDialog`), `admin-guard`, `admin-nav` (sidebar desktop, bottom sheet mobile).
- **Perilaku**: password sementara dan kode undangan hanya hidup di state komponen (tidak di cache query/storage), dialog dengan peringatan "Hanya ditampilkan sekali" + tombol Salin; aksi destruktif (nonaktifkan, hapus, reset, ubah peran, cabut undangan) lewat Dialog konfirmasi; aksi pada akun sendiri dinonaktifkan di UI (server tetap menolak dengan `CANNOT_MODIFY_SELF`); pencarian di-debounce 300 ms; pengaturan per baris (Input angka/Select/Switch) dengan validasi rentang di klien dan pemetaan galat server (`details[].code`); filter audit (aksi, UUID pengguna, rentang tanggal -> batas hari UTC) dengan validasi `from <= to`; learner di `/admin/**` melihat kartu 403 lalu dialihkan ke `/`.
- Pengelompokan pengaturan berdasarkan prefiks kunci; opsi `enum` dibaca dari `options` pada `SettingDTO` (tambahan aditif Backend).

### Keputusan dan temuan
1. Status worker di kartu Worker: `heartbeat_age_sec` null atau > 45 dtk dianggap "Mati" (worker menulis tiap 15 dtk). Spec tidak memberi ambang; mudah diubah di `WORKER_STALE_SEC`.
2. Kartu Antrean dan Disk selalu "Aktif" (spec tidak memberi status untuk keduanya).
3. Contoh respons spec untuk `GET /admin/settings` tidak memuat daftar opsi enum; Backend menambah `options` pada `SettingDTO` dan klien memakainya (tidak ada daftar tertanam di klien).
4. Filter audit "pengguna" berupa input UUID (belum ada endpoint pencarian pengguna untuk combobox; di luar kontrak).

### Verifikasi
- Test: `src/components/admin/admin.test.tsx` (kesehatan, SecretDialog, daftar/kosong/galat pengguna, aksi diri sendiri nonaktif, undangan tanpa kode + buat undangan, pengaturan validasi/PUT/galat server, parameter audit).
- Ringkasan lint/typecheck/test/build ada di `TASK-003/dev_log.md`. Belum: E2E, integrasi nyata dengan Backend, uji pembaca layar.


---

## [BACKEND] 2026-11-03 07:55 (Backend Engineer, wave W1)

**Target Spec:** `specifications/002_spec_admin_users_invites.md` | **Status:** Completed (sisi server)

### 1. Implementation Summary
Semua 12 endpoint admin memakai `withApi({ auth: 'admin' })` (401 tanpa sesi, 403 `FORBIDDEN` untuk learner; `PASSWORD_CHANGE_REQUIRED` diperiksa lebih dahulu). Setiap aksi tulis menulis `audit_log` dalam transaksi yang sama dengan perubahan data (kegagalan audit membatalkan perubahan).
- **Pengguna**: daftar (`q` ILIKE dengan `%`, `_`, `\` di-escape; filter peran/status/`include_deleted`; urut `created_at DESC`), buat (password sementara 16 karakter CSPRNG, `must_change_password=true`, hook `userCreatedHooks`), PATCH (peran/status; `CANNOT_MODIFY_SELF` diperiksa lebih dulu, lalu 404, lalu `LAST_ADMIN` dengan `SELECT ... FOR UPDATE` pada admin aktif; tanpa perubahan nilai = 200 tanpa `token_version`/audit), reset-password (hitungan gagal/kunci direset), hapus (soft delete, `status=DISABLED`).
- **Undangan**: kode 20 karakter Crockford (CSPRNG), hanya SHA-256 tersimpan, kode tampil sekali; daftar dengan status turunan `active|used|expired|revoked`; cabut = `INVITE_NOT_ACTIVE` bila bukan aktif.
- **Pengaturan**: registri 21 kunci (`src/server/settings/registry.ts`), `GET` selalu memuat semua kunci (default bila baris hilang), `PUT` memvalidasi tipe/rentang/enum + aturan `crown.gold_min > crown.silver_min` (`gold_not_greater_than_silver`), audit `SETTINGS_CHANGED` {old,new}. Kunci sistem `system.worker_heartbeat_at` disemai (`'null'::jsonb`) dan tidak muncul/ tidak dapat di-PUT.
- **Audit**: filter `action/actor_user_id/entity_type/from/to`, `range_invalid`, email aktor dimasking, `ip_hash_prefix` 8 hex.
- **Health**: DB (`SELECT 1`, 2 dtk), antrean (`pgboss.job`), LLM/STT (probe 2 dtk, `disabled` bila `AI_ENABLED=false`), heartbeat worker, disk (`statfs`), versi; komponen gagal ditandai, endpoint tetap 200 (diuji dengan Ollama mati < 5 dtk).
- **Worker**: `src/worker/purge.ts` `anonymizeDeletedUsers` (30 hari, idempoten, memanggil `userAnonymizedHooks`, audit `USER_ANONYMIZED`) terdaftar di `purgeTasks` (registry mengekspor ulang).

### 2. Files Created/Modified
`src/server/admin/{users,invites,settings,audit,health}.ts`, `src/server/settings/{registry,service}.ts`, `src/contracts/admin.ts`, `src/app/api/v1/admin/{users,users/[user_id],users/[user_id]/reset-password,users/[user_id]/delete,invites,invites/[invite_id],settings,settings/[key],audit-log,health}/route.ts`, `src/worker/{purge,registry}.ts`, `scripts/seed.ts` (modul `system_settings`), `tests/integration/admin.itest.ts` (17 tes), `tests/integration/baseline.itest.ts` (jumlah `app_settings` 21 -> 22), `tests/unit/seed.test.ts` (daftar modul seed).

### 3. Technical Notes
1. **Perubahan kontrak aditif (change-management)**: `SettingDTO.options: string[] | null` (nilai enum; `null` untuk `int`). Dicatat di Revision History spec 002 dan `agent_handoff.json`; FE sudah memakainya.
2. `LAST_ADMIN` tidak dapat dipicu lewat HTTP oleh admin aktif yang masih ada (pemanggil sendiri selalu admin aktif lain); diuji di tingkat service dengan aktor admin yang sudah dinonaktifkan.
3. `ip_hash` diisi dari `X-Forwarded-For` hanya bila `AUTH_TRUST_HOST=true` (lihat TASK-001 catatan 3).
4. Heartbeat worker menyimpan string ISO di `app_settings` (kode W0); health menghitung usia dari string itu.
5. Pengguna terhapus (`deleted_at`) tidak bisa login, email baru dapat dipakai hanya setelah anonimisasi (indeks unik tetap mencakup baris terhapus).
6. Tidak diuji/belum: UI admin dengan data nyata (FE), E2E, `retention-purge` melalui pg-boss (hanya fungsi tugas diuji langsung).

### 4. Verifikasi
Lihat `TASK-003/dev_log.md` (ringkasan menyeluruh). AC tercakup: 403/401 semua endpoint admin, undangan (regex, hash-only, kedaluwarsa, cabut, 409), buat pengguna + login + `PASSWORD_CHANGE_REQUIRED`, nonaktifkan -> 401 + `token_version` +1, `CANNOT_MODIFY_SELF`, `LAST_ADMIN`, reset password, hapus + include_deleted + anonimisasi 31 vs 29 hari, pengaturan (rentang, 45, audit 60->45, tabel kosong), audit-log filter, health.

### 5. Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 07:55 | Backend W1: admin users/invites/settings/audit/health + purge anonimisasi |
