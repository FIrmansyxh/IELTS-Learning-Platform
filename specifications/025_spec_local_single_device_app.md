# SPEC-025: Aplikasi Lokal Satu Perangkat (Profil Lokal, CLI Pengganti Admin, SQLite)

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-005)
- **Created:** 2026-11-08
- **Status:** approved (human, 2026-11-08); Fase 1-3 SELESAI, Fase 4 belum
- **Supersedes:** SPEC-001 (auth), SPEC-002 (admin) seluruhnya; SPEC-018/019/020 pada bagian UI admin
- **Depends on:** SPEC-000, SPEC-003, SPEC-007
- **Prioritas:** P1
- **Cakupan:** Backend (sesi profil, penghapusan auth/admin, CLI, port SQLite, antrean dalam proses) + Frontend (pemilih profil, hapus halaman masuk/daftar/admin) + Ops (satu perintah menjalankan)

## User Story
Sebagai pemilik yang belajar di laptop sendiri, saya ingin membuka aplikasi tanpa login, memilih profil belajar, dan menjalankan semuanya secara lokal tanpa internet, sehingga pemakaian ringan dan sederhana, dan konten baru ditambahkan lewat kode.

## Non-Goals / Out of Scope
- Tidak ada akses jaringan (LAN/Internet) ke aplikasi; tidak ada multi-tenant.
- Tidak ada password, email, undangan, atau peran admin.
- Tidak ada panel admin; tidak ada kurasi konten lewat UI.
- Tidak menghapus data model progres/poin/hasil (tabel dan relasi `user_id` tetap).
- Tidak mengganti LLM lokal atau alur penilaian Writing/Speaking.

## Definisi Tetap
**D1. Profil.** Profil = baris `users` dengan `display_name` (1-40 karakter, unik tanpa memedulikan huruf besar/kecil). Kolom email/password_hash/role/lockout dibuang dari model (Fase 3) atau diisi nilai tak terpakai selama Fase 1-2. Maksimal 10 profil.
**D2. Sesi.** `POST /api/v1/profiles/{id}/select` menerbitkan cookie sesi bertanda tangan (httpOnly, `SameSite=Strict`, tanpa `Secure` karena HTTP loopback). `requireUser()` tetap menjadi satu-satunya gerbang; tanpa cookie -> `401`, UI mengarahkan ke `/pilih-profil` (bukan `/profil`, yang sudah dipakai halaman pengaturan profil). Bila hanya ada satu profil dan pengguna tidak sedang berganti profil (`?pilih=1`), UI memilihnya otomatis. Pergantian profil = `POST /api/v1/profiles/leave`.
**D3. Profil pertama.** Pada peluncuran pertama tanpa profil, halaman `/pilih-profil` menawarkan "Buat profil" (nama). Tidak ada pendaftaran terpisah.
**D4. Keamanan lokal.**
- Server hanya mendengarkan `127.0.0.1` (dev dan produksi lokal); skrip start gagal bila `HOSTNAME` bukan loopback.
- `withApi` menolak permintaan dengan `Host` selain `localhost`, `127.0.0.1`, `[::1]` (cegah DNS rebinding) dengan `403 HOST_NOT_ALLOWED`.
- Pemeriksaan `Origin`/`Sec-Fetch-Site` pada mutasi tetap berlaku (cegah situs lain mengirim permintaan ke localhost).
- Profil Docker `proxy`, Caddy, dan panduan Tailscale dihapus.
- Hapus profil meminta konfirmasi nama dan menghapus seluruh progres profil itu (cascade).
**D5. Yang dihapus (Fase 1).** Halaman `/masuk`, `/daftar`, `/ganti-password`; endpoint `auth/login|register|change-password|signup-config`; undangan; kebijakan password, daftar password umum, argon2, lockout, rate-limit login/daftar, `must_change_password`, `token_version`.
**D6. Yang dihapus (Fase 2).** Halaman `/admin/*`, semua `api/v1/admin/*` (45 endpoint), `src/components/admin/*` (36 komponen), `requireAdmin`, `auth: 'admin'`, audit viewer, panel kesehatan, license-summary UI, antarmuka kurasi (SPEC-020 UI), tes terkait.
**D7. CLI pengganti (Fase 2).** `npm run`: `profile:list|create|rename|delete`, `progress:reset -- --profile <nama> [--sub <kode>|--all]`, `progress:unlock -- --profile <nama> --code <kode>`, `points:adjust -- --profile <nama> --delta <n> --reason "..."`, `settings:get|set`, `band:list|activate|import -- <berkas.json>`, `content:validate|import` (ada), `bank:validate` (ada), `doctor` (cek DB, LLM, folder aset, versi). Semua CLI menulis ke audit log lokal (tabel tetap) tanpa UI.
**D8. Penyimpanan data (Fase 3).** SQLite satu berkas di `data/ielts.db` (WAL), diakses lewat driver yang diverifikasi di awal Fase 3 (kandidat: `node:sqlite` via adaptor Drizzle `sqlite-proxy`, atau `better-sqlite3`). Pemetaan: uuid -> TEXT (UUID v4 dibuat aplikasi); jsonb -> TEXT JSON dengan validasi Zod di batas; enum -> TEXT + CHECK; numeric(band/skor) -> INTEGER sentesimal atau TEXT dengan pembulatan di aplikasi (band selalu kelipatan 0,5); timestamptz -> INTEGER epoch ms UTC; `now()` -> parameter waktu dari aplikasi (memudahkan tes); `FOR UPDATE` dan `pg_advisory_xact_lock` -> `BEGIN IMMEDIATE` (satu penulis); trigger/view kustom (0002) ditulis ulang untuk SQLite; indeks parsial dan CHECK dipertahankan (didukung SQLite).
**D9. Antrean (Fase 3).** pg-boss dan proses worker dihapus. Penilaian Writing berjalan dalam antrean dalam proses (satu job AI aktif, timeout dan retry seperti sekarang) dengan tabel `async_jobs` sebagai jembatan status UI. Job yang tertinggal saat aplikasi mati ditandai ulang `QUEUED` saat start. Pembersihan retensi rekaman dijadwalkan dengan timer dalam proses.
**D10. Offline.** `npm run doctor` melaporkan: tidak ada panggilan jaringan keluar saat belajar; daftar pengecualian yang diakui (video YouTube, Speaking via AI pihak ketiga, unduhan font saat build pertama, unduhan model). Kartu video menampilkan "Video butuh koneksi internet" saat offline.
**D11. Satu perintah (Fase 4).** `npm run start:local` membangun bila perlu, menyiapkan DB, menyalakan server di `127.0.0.1:3005`, dan membuka browser; pintasan Windows (`.cmd`) menjalankannya. LLM (`llama-server`) dinyalakan opsional oleh skrip yang sama bila `AI_ENABLED=true`.

## Technical Flow (per fase)
- **Fase 1:** tambah profil + sesi profil -> pasang UI pemilih profil -> hapus login/daftar/ganti-password/undangan -> perbarui tes.
- **Fase 2:** tulis CLI D7 -> hapus admin (halaman, API, komponen, tes) -> hapus peran admin dari guard.
- **Fase 3:** verifikasi driver -> skema SQLite + migrasi -> port 28 berkas SQL mentah -> antrean dalam proses -> pindahkan tes integrasi ke SQLite -> hapus pg-boss dan dependensi pg.
- **Fase 4:** skrip start, `doctor`, dokumentasi, pembersihan Docker.

## Database Changes
- Fase 1: `users.display_name` (unik, nocase); email/password dihentikan pemakaiannya. Migrasi 0010.
- Fase 3: skema ditulis ulang untuk SQLite; migrasi Postgres lama dipensiunkan (data lokal lama dapat dimigrasikan lewat skrip `data:import-from-postgres` sekali pakai bila diperlukan).

## UI/UX
- `/pilih-profil`: kartu profil (nama, progres singkat), tombol "Buat profil", menu per profil (ganti nama, hapus). Avatar inisial.
- Header: nama profil aktif + tautan "Ganti profil". Tidak ada menu Admin, Masuk, Daftar.
- Tanpa email atau password di UI mana pun.

## Acceptance Criteria
1. **Fase 1:** tanpa cookie, rute terautentikasi mengembalikan 401 dan UI menuju `/profil`; memilih profil membuka dashboard; satu profil otomatis terpilih; progres terpisah antar profil; permintaan dengan `Host` asing ditolak 403; seluruh jalur login/daftar/ganti-password/undangan tidak ada lagi.
2. **Fase 2:** tidak ada rute atau halaman `/admin`; setiap fungsi D7 bekerja lewat CLI dengan keluaran jelas dan menulis audit; `grep auth: 'admin'` kosong.
3. **Fase 3:** `npm run test:integration` lulus pada SQLite; tidak ada dependensi `pg`/`pg-boss`; evaluasi Writing selesai lewat antrean dalam proses; kill proses saat job berjalan lalu start ulang tidak meninggalkan job menggantung.
4. **Fase 4:** satu perintah menjalankan aplikasi dari mesin bersih (setelah `npm ci`); `doctor` hijau.
5. Setiap fase: typecheck, lint, tes unit dan integrasi lulus; tidak ada regresi pada gatekeeping, band, Writing, Speaking eksternal.

## Edge Cases & Validation
- Dua tab membuka profil berbeda: cookie terakhir menang; UI memeriksa `GET /me` dan menampilkan profil aktif.
- Menghapus profil yang sedang aktif: sesi dibatalkan, kembali ke `/profil`.
- Port 3005 terpakai: skrip start memberi pesan jelas dan opsi `--port`.
- Berkas DB terkunci/rusak: `doctor` melaporkan; pemulihan dari cadangan (`data/backups/`, salinan otomatis harian berumur 7 hari).
- Data lama Postgres: tidak otomatis dimigrasikan; skrip sekali pakai opsional.

## Status Implementasi
**Fase 1 (selesai 2026-11-08):**
- API: `GET|POST /api/v1/profiles`, `POST /profiles/{id}/select`, `DELETE /profiles/{id}` (konfirmasi nama), `POST /profiles/leave`; semua `auth: 'public'` dan satu-satunya endpoint tanpa sesi (dijaga tes endpoint-guards).
- Keamanan: penjaga `Host` loopback (`HOST_NOT_ALLOWED`), `Origin` tetap diperiksa, cookie `SameSite=Strict`.
- Dihapus: halaman `/masuk`, `/daftar`, `/ganti-password`; endpoint login, register, logout, change-password, signup-config; undangan (API, UI, tabel `signup_invites`), buat-pengguna-dengan-password, reset password, bootstrap admin, modul password/argon2, bendera `must_change_password` pada guard, pengaturan `signup.mode`.
- Migrasi `0010_spec_025_local_profiles`: hapus `signup_invites`, reset `must_change_password`, beri akhiran pada nama kembar lama, indeks unik `lower(display_name)` (profil belum dihapus).
- Sengaja ditunda ke Fase 2: panel admin lainnya (pengguna, poin, pengaturan, band, aset, impor, kurasi, audit, kesehatan) dan peran `admin` masih ada tetapi tak terjangkau karena tidak ada lagi cara menjadi admin; kolom `users.email/password_hash/role` tetap sampai skema ditulis ulang (Fase 3).

**Fase 2 (selesai 2026-11-08):**
- Dihapus: seluruh `/admin/*` (halaman), `api/v1/admin/*` (rute), `components/admin/*`, `server/admin/*`, pipeline impor batch (`server/import/*`, job `import-validate`/`import-publish`, purge impor), manajemen aset berlisensi via UI (`server/assets/*`), kurasi konten (`curation-service`), kontrak dan klien API admin, tingkat `auth: 'admin'`, `requireAdmin`, menu Admin, blok teks i18n admin (±600 baris), komponen UI yang hanya dipakai admin, serta tes terkait.
- CLI pengganti (`npm run cli -- <area> <perintah>` dan alias): `profile:list|create|rename|delete`, `progress:unlock|reset`, `points:show|adjust`, `settings:list|get|set`, `band:list|activate|import`, `doctor`. Logika di `src/server/cli/*` (dapat diuji); `content:validate|import` dan `bank:validate` sudah ada.
- `doctor` memeriksa Node, `.env`, binding loopback, DB, migrasi (butuh `DATABASE_MIGRATOR_URL`), seed, tabel band aktif, profil, folder aset, LLM; juga mencetak daftar kebutuhan internet.
- Disengaja tetap ada sampai Fase 3: kolom `users.role/email/password_hash`, tabel `import_batches`, `import_batch_items`, `content_revisions` (tak terpakai), peran di JWT, UI perekam Speaking lama (pipeline STT dorman).
- Catatan: `progress:reset --sub` tidak menurunkan status Modul/Tier yang sudah selesai (status monoton, SPEC-003).

**Fase 3 (selesai 2026-11-08):**
- Database: SQLite lewat `node:sqlite` (tanpa dependensi native) + Drizzle `sqlite-proxy` (`src/server/db.ts`). Satu koneksi sinkron; transaksi diserialkan mutex + `BEGIN IMMEDIATE`; transaksi bersarang memakai savepoint; kode di dalam transaksi yang memanggil `getDb()` ikut transaksi itu. WAL + `busy_timeout`, `foreign_keys=ON`. Berkas: `DATABASE_PATH` (bawaan `./data/ielts.db`).
- Skema: lapisan kompatibilitas di `src/db/schema.ts` (uuid=TEXT dengan default SQL, timestamp=INTEGER ms dibaca sebagai `Date`, numeric=REAL dibaca string berskala tetap, jsonb/array=TEXT JSON, enum=TEXT bertipe sempit). Kolom login (`email`, `password_hash`, `role`, kunci akun) dan tabel impor dibuang. Migrasi lama Postgres diganti baseline `0000_baseline_sqlite` + `0001_publish_blockers_view` (view ditulis ulang dengan `json_each`); migrator sendiri `src/server/db-migrate.ts` (tabel `_migrations`).
- Antrean: `src/server/jobs/queue.ts` dalam proses (FIFO, job AI satu per satu, ulang maks 3x, pemulihan job QUEUED/RUNNING saat start, purge harian). Proses worker, pg-boss, dan `pg_advisory_*` dihapus; `async_jobs` tetap menjadi jembatan status UI.
- Dihapus: dependensi `pg`, `pg-boss`, `@types/pg`, `testcontainers`; `scripts/seed-learner.ts`; peran `app_rw/app_migrator` dan penegakan append-only `audit_log`/`point_ledger` di tingkat DB (tidak ada lagi pemisahan peran pada aplikasi satu perangkat).
- Tes: tes integrasi memakai berkas SQLite sementara (`tests/integration/global-setup.ts`); ditambah `ai-queue.itest.ts` (Writing masuk antrean -> GRADED).
- Verifikasi: `tsc` bersih, unit 640/640, integrasi 217/217, `next build` OK, Playwright 14/14 (desktop+mobile) terhadap SQLite. Perbandingan kinerja: pohon kurikulum p95 2,6 ms (batas tes 300 ms).
- Belum (Fase 4): `npm run start:local`, pembersihan Docker/Compose/`scripts/dev-db.ps1`/`docker/`, dan impor data satu kali dari Postgres lama (tidak dibuat; data uji saja).

## Human Approval
- [x] Disetujui human (2026-11-08, "Setujui, mulai Fase 1")

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
