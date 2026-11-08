# SPEC-025: Aplikasi Lokal Satu Perangkat (Profil Lokal, CLI Pengganti Admin, SQLite)

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-005)
- **Created:** 2026-11-08
- **Status:** approved (human, 2026-11-08); Fase 1-3 SELESAI; Fase 4 AC detail dimatangkan (spec-lock 2026-11-08), implementasi belum
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
4. **Fase 4:** satu perintah menjalankan aplikasi dari mesin bersih (setelah `npm ci`); `doctor` hijau. Rincian testable: bagian "Fase 4: AC detail" (P4-01..P4-60).
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

## Fase 4: AC detail (spec-lock 2026-11-08)
Mematangkan AC Fase 4 (TASK-025d) tanpa mengubah D1-D11. Kode `P4-nn` dipakai oleh tes dan task file. Kolom **V** = cara verifikasi: **U** tes unit Vitest (dependensi diinjeksi/dipalsukan), **I** tes integrasi (berkas SQLite sementara), **C** job CI `start-local-smoke` (runner Linux bersih), **M** manual di mesin bersih Windows 11, **G** pemeriksaan `git`/`grep`/berkas. Semua pesan galat di bawah adalah teks persis (tes memeriksa substring yang dicetak tebal).

### Keputusan desain Fase 4 (penjelas D11; bukan perubahan keputusan)
- **K1. Berkas.** Pintu masuk `codes/scripts/start-local.mjs` (JavaScript murni, sintaks lama, hanya memeriksa versi Node lalu `import()` dinamis `codes/scripts/lib/start-local.mjs`). Logika murni diekspor dari `lib/` agar dapat diuji. Anak proses dijalankan dengan `process.execPath` + jalur biner di `node_modules` (`tsx/dist/cli.mjs`, `next/dist/bin/next`), tanpa shell, supaya identik di Windows/Linux/macOS.
- **K2. Server produksi lokal = `next start -H 127.0.0.1 -p <port>`**, bukan `.next/standalone/server.js` (standalone mengikat `0.0.0.0` lewat `HOSTNAME` dan tidak menyalin `.next/static`). Konsekuensi: `output: 'standalone'` dihapus dari `next.config.ts` (hanya dibutuhkan Dockerfile), skrip `start` menjadi `next start -H 127.0.0.1 -p 3005`.
- **K3. Env turunan.** Skrip selalu memberi anak proses `NODE_ENV=production`, `HOSTNAME=127.0.0.1`, `AUTH_URL=http://127.0.0.1:<port>`, `ALLOWED_HOSTS=localhost:<port>,127.0.0.1:<port>,[::1]:<port>` (menimpa nilai di `.env` untuk anak proses saja; `.env` tidak diubah). `--port` tidak butuh penyuntingan `.env`.
- **K4. Rentang Node.** Batas bawah 22.20; `engines` menjadi `">=22.20.0"` (batas `<23` dihapus karena menolak Node 24 yang disarankan README).
- **K5. Cadangan.** `VACUUM INTO` (salinan konsisten, mandiri tanpa `-wal`/`-shm`) ke `data/backups/ielts-YYYY-MM-DD.db` (tanggal lokal mesin), maksimal satu per tanggal, simpan 7 berkas bernama itu yang terbaru. Pemicu: (a) `start:local` sebelum migrasi, (b) pemeriksa dalam proses tiap 6 jam saat `NODE_ENV=production`, (c) `npm run db:backup`. Pemulihan: `npm run db:restore`. Dua perintah CLI ini menambah D7 (aditif).
- **K6. Kegagalan non-kritis tidak menahan aplikasi:** cadangan, impor konten bawaan, pembukaan browser, dan `llama-server` hanya menghasilkan peringatan. Kegagalan kritis (Node, HOSTNAME, port, `.env`, migrasi, seed, build, kesiapan server) menghentikan dengan kode keluar 1.
- **K7. Kode keluar.** `0` = berhenti normal (SIGINT/SIGTERM) atau aplikasi sudah berjalan; `1` = galat prasyarat/operasi; `2` = argumen salah; kode non-nol dari server diteruskan (minimal 1).
- **K8. `src/worker/*` tidak mati:** `queues.ts`, `registry.ts`, `purge.ts` dipakai antrean dalam proses. Mereka DIPINDAH ke `src/server/jobs/` (bukan dihapus); `queueOptions` dan `QueueOptionsDef` (khusus pg-boss, nol pemakai) dihapus.

### Alur `npm run start:local [-- --port <n>] [--no-open] [--rebuild]` (urutan tetap)
1. Parse argumen (default port 3005; port valid = bilangan bulat 1024-65535).
2. Periksa Node >= 22.20.
3. Periksa `HOSTNAME` (bila diset) berupa loopback (`127.0.0.1`, `localhost`, `::1`).
4. Periksa port: bebas, atau diduduki aplikasi ini sendiri (lihat P4-06), atau berhenti dengan galat.
5. Siapkan `codes/.env` (P4-07..09).
6. Cadangan harian bila berkas DB sudah ada (P4-32..).
7. `db:migrate`, lalu `db:seed`.
8. Impor `content/gt-modules/*` bila belum ada sub-modul berstatus `PUBLISHED`.
9. `next build` bila perlu (P4-16..19).
10. Nyalakan `llama-server` bila diminta (P4-26..29), tidak menunggu.
11. Nyalakan `next start`, tunggu `GET /api/health` = 200 (maks 60 dtk), cetak `Aplikasi siap: http://127.0.0.1:<port>`, buka browser.
12. Tunggu sampai SIGINT/SIGTERM atau server berhenti; matikan semua anak proses.

### AC: `start:local` (kode keluar, pesan, efek samping)
| ID | Diberikan | Ketika | Maka | V |
|---|---|---|---|---|
| P4-01 | argumen `--port 3010` | skrip dijalankan | server mendengarkan `127.0.0.1:3010`, URL tercetak `http://127.0.0.1:3010`, anak proses menerima `ALLOWED_HOSTS` berisi `127.0.0.1:3010` | U (parser+env turunan), C |
| P4-02 | argumen `--port abc`, `--port 80`, `--port 70000`, atau opsi tak dikenal `--foo` | skrip dijalankan | kode keluar 2, stderr memuat **Argumen tidak valid** dan bantuan penggunaan, tidak ada berkas dibuat atau diubah | U |
| P4-03 | Node `v20.11.0` (versi dipalsukan) | skrip dijalankan | kode keluar 1, stderr memuat **Node.js v20.11.0 terlalu lama. Aplikasi butuh Node.js 22.20 atau lebih baru.**; `.env` dan `data/` tidak dibuat | U |
| P4-04 | env `HOSTNAME=0.0.0.0` (atau nama mesin) | skrip dijalankan | kode keluar 1, stderr memuat **HOSTNAME=0.0.0.0 bukan alamat loopback** dan petunjuk menghapus variabel itu; tanpa efek samping | U |
| P4-05 | port diduduki program lain (bukan aplikasi ini) | skrip dijalankan | kode keluar 1, stderr memuat **Port 3005 sudah dipakai program lain. Coba: npm run start:local -- --port 3006**; DB, `.env`, `.next` tidak disentuh | U (net.Server nyata), M |
| P4-06 | port diduduki aplikasi ini (`GET /api/health` mengembalikan 200 dengan `data.status = "ok"`) | skrip dijalankan | tercetak **Aplikasi sudah berjalan: http://127.0.0.1:3005**, browser dibuka (kecuali `--no-open`), kode keluar 0, tidak ada migrasi/server kedua | U |
| P4-07 | `codes/.env` tidak ada | skrip dijalankan | `.env` dibuat (flag `wx`) dari isi `.env.example` dengan `AUTH_SECRET` dan `IP_HMAC_SECRET` diisi `crypto.randomBytes(32).toString('base64')`, keduanya berbeda; `AUTH_URL=http://127.0.0.1:3005`; stdout/stderr tidak memuat nilai rahasia | U |
| P4-08 | `.env` ada dan kedua rahasia >= 32 byte | skrip dijalankan | isi `.env` tidak berubah (hash SHA-256 sama sebelum/sesudah) | U |
| P4-09 | `.env` ada tetapi `AUTH_SECRET` kosong atau `IP_HMAC_SECRET` < 32 byte | skrip dijalankan | kode keluar 1, stderr memuat nama kunci yang salah dan **atau hapus .env agar dibuat otomatis**; `.env` tidak diubah | U |
| P4-10 | DB belum ada, lalu DB sudah terbaru | skrip dijalankan dua kali | kali 1: berkas `data/ielts.db` ada dan `_migrations` berisi semua tag jurnal `drizzle/`; kali 2: log memuat **sudah terbaru**, jumlah baris semua tabel tidak berubah | I |
| P4-11 | migrasi atau seed keluar non-nol | skrip dijalankan | kode keluar 1, stderr memuat nama langkah yang gagal (**db:migrate** atau **db:seed**), server tidak dinyalakan | U |
| P4-12 | DB sudah di-seed | `db:seed` dijalankan dua kali berturut-turut | tidak ada galat; `count(*)` pada `tiers`, `modules`, `sub_modules`, `content_sources`, `app_settings`, `band_conversion_tables` identik sebelum/sesudah; nilai `app_settings` yang diubah lewat `settings:set` tidak ditimpa | I |
| P4-13 | tidak ada baris `sub_modules.status = 'PUBLISHED'` | skrip dijalankan | tiap subfolder `content/gt-modules/*` diimpor dengan `--publish`; setelah selesai ada >= 1 baris `PUBLISHED` | I, C |
| P4-14 | sudah ada >= 1 sub-modul `PUBLISHED` | skrip dijalankan | tidak ada impor; log memuat **Konten sudah ada, impor dilewati** | U |
| P4-15 | impor konten keluar non-nol (mis. kode 2 publikasi terhalang) | skrip dijalankan | log memuat peringatan **Impor konten bawaan gagal (kode 2)**, langkah berikutnya tetap jalan, kode keluar akhir tidak terpengaruh | U |
| P4-16 | `.next/BUILD_ID` tidak ada | skrip dijalankan | `next build` dijalankan sekali dengan `NODE_ENV=production` | U |
| P4-17 | `.next/BUILD_ID` ada dan tidak ada berkas masukan lebih baru dari mtime-nya | skrip dijalankan | build dilewati, log memuat **Build terbaru** | U |
| P4-18 | satu berkas di `src/**`, `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, atau `postcss.config.mjs` lebih baru dari `.next/BUILD_ID`; atau opsi `--rebuild` | skrip dijalankan | build dijalankan ulang | U |
| P4-19 | `next build` gagal | skrip dijalankan | kode keluar 1, stderr memuat **Build gagal** dan petunjuk **build pertama butuh internet untuk mengunduh font**, server tidak dinyalakan | U |
| P4-20 | server berjalan | permintaan ke `127.0.0.1:<port>` dengan `Host: evil.example`, dan koneksi ke IP LAN mesin pada port yang sama | `Host` asing dijawab `403 HOST_NOT_ALLOWED`; koneksi ke IP LAN ditolak (tidak mendengarkan); argumen anak proses memuat `-H 127.0.0.1` | U (argumen), C (curl) |
| P4-21 | build dan DB siap | server naik | dalam <= 60 dtk `GET /api/health` = 200, stdout memuat baris persis **Aplikasi siap: http://127.0.0.1:3005**, dan `GET /pilih-profil` = 200 | C, M |
| P4-22 | `/api/health` tidak 200 selama 60 dtk | batas waktu tercapai | anak proses dimatikan, kode keluar 1, stderr memuat **Server tidak siap dalam 60 detik** | U |
| P4-23 | server siap | tanpa `--no-open` / dengan `--no-open` | browser dibuka tepat sekali (Windows `cmd /c start "" <url>`, macOS `open`, Linux `xdg-open`) / tidak dibuka; bila perintah buka gagal: peringatan **Gagal membuka browser, buka manual: <url>** dan kode keluar tidak berubah | U (spawner palsu), M |
| P4-24 | server berjalan | SIGINT (Ctrl+C) | semua anak proses berhenti <= 10 dtk, kode keluar 0, port bebas kembali | C, M |
| P4-25 | server berhenti sendiri dengan kode 7 | skrip menyadari | `llama-server` yang dijalankan skrip ikut dimatikan, kode keluar 7 | U |
| P4-59 | DB berisi 2 profil dan progres | `start:local` dijalankan pada DB itu | jumlah baris `users` dan `user_sub_module_progress` tidak berubah; tidak ada profil/progres tambahan | I |

### AC: `llama-server` opsional (D11)
Variabel `.env` (semua opsional): `LLAMACPP_BIN` (bawaan `llama-server`), `LLAMACPP_MODEL_PATH` (berkas GGUF) atau `LLAMACPP_HF_REPO` (mis. `bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M`), `LLAMACPP_ARGS` (argumen tambahan dipisah spasi, mis. `--device Vulkan0 -ngl 99`). Host dan port diambil dari `LLAMACPP_BASE_URL`.
| ID | Diberikan | Ketika | Maka | V |
|---|---|---|---|---|
| P4-26 | `AI_ENABLED` tidak `true` atau `LLM_DRIVER` bukan `llamacpp` | skrip dijalankan | tidak ada proses llama dibuat dan tidak ada baris log berawalan `[llama]` | U |
| P4-27 | `AI_ENABLED=true` dan `GET <LLAMACPP_BASE_URL>/health` sudah 200 | skrip dijalankan | tidak dibuat proses baru, log memuat **llama-server sudah berjalan, dipakai ulang** | U |
| P4-28 | `AI_ENABLED=true`, `LLM_DRIVER=llamacpp`, host `LLAMACPP_BASE_URL` loopback, `LLAMACPP_MODEL_PATH` terisi, belum ada yang menjawab | skrip dijalankan | `spawn(LLAMACPP_BIN, ['-m', path, '--host', '127.0.0.1', '--port', <port URL>, '-c', '4096', '--parallel', '1', ...LLAMACPP_ARGS dipisah spasi], { shell: false })` dipanggil tepat sekali; keluaran ditambahkan ke `data/logs/llama-server.log`; skrip tidak menunggu model siap; proses ini dimatikan saat skrip berhenti | U |
| P4-29 | `AI_ENABLED=true` tetapi biner tidak ditemukan (ENOENT), atau model tidak diset, atau host URL bukan loopback | skrip dijalankan | satu baris peringatan **Penilai Writing tidak dinyalakan: <alasan>** (alasan: `biner tidak ditemukan`, `LLAMACPP_MODEL_PATH/LLAMACPP_HF_REPO belum diisi`, atau `LLAMACPP_BASE_URL bukan loopback`), aplikasi tetap naik, kode keluar tidak terpengaruh | U |

### AC: pintasan Windows `codes/start-local.cmd`
Isi tetap: `@echo off`; `cd /d "%~dp0"`; jika `where node` gagal cetak **Node.js belum terpasang. Pasang Node.js 22.20 atau lebih baru dari https://nodejs.org** lalu `pause` dan `exit /b 1`; jika folder `node_modules` tidak ada jalankan `call npm ci`; lalu `call npm run start:local -- %*`; simpan `%ERRORLEVEL%`; bila non-nol `pause`; `exit /b` dengan kode itu. Berkas ber-EOL CRLF (tambahkan `*.cmd text eol=crlf` ke `codes/.gitattributes`).
| ID | Diberikan | Ketika | Maka | V |
|---|---|---|---|---|
| P4-30 | Windows 11 bersih, Node 22.20+ terpasang, repo baru di-clone (tanpa `node_modules`) | pengguna klik ganda `start-local.cmd` | `npm ci` berjalan otomatis, lalu aplikasi naik dan browser terbuka pada `http://127.0.0.1:3005/pilih-profil` tanpa langkah manual lain | M |
| P4-31 | repo berada di jalur berspasi (mis. `G:\Vibe Code\...`) dan skrip dipanggil dari folder lain | `start-local.cmd --no-open` dipanggil | bekerja (cwd = folder `codes`), argumen diteruskan | M |
| P4-32a | Node tidak terpasang, atau start:local keluar non-nol | `.cmd` selesai | jendela tidak menutup sendiri (`pause`), kode keluar `.cmd` = kode keluar skrip | M |

### AC: cadangan harian (edge case spec; modul `src/server/backup.ts`)
API: `backupIfDue({ dbPath, backupDir, now, keep = 7 }) -> { status: 'created'|'skipped_today'|'no_database'|'failed', file?: string, pruned: string[] }`. Nama berkas `ielts-YYYY-MM-DD.db` (tanggal lokal dari `now`); hanya berkas yang cocok `^ielts-\d{4}-\d{2}-\d{2}\.db$` yang dihitung/dihapus. Penulisan ke `<nama>.tmp` lalu `rename` (atomik).
| ID | Diberikan | Ketika | Maka | V |
|---|---|---|---|---|
| P4-32 | DB berisi data, belum ada cadangan hari ini | `backupIfDue` | `status='created'`; `data/backups/ielts-<hari-ini>.db` ada; `PRAGMA integrity_check` pada salinan = `ok`; `count(*)` `users` dan `sub_modules` sama dengan sumber; tidak ada berkas `.tmp`, `-wal`, `-shm` tersisa | I |
| P4-33 | cadangan hari ini sudah ada | `backupIfDue` dipanggil lagi | `status='skipped_today'`, mtime berkas cadangan tidak berubah | I |
| P4-34 | 8 berkas bernama pola (hari berbeda, lebih lama), 1 berkas `catatan.txt`, 1 berkas `ielts-manual.db` | `backupIfDue` membuat berkas hari ini | tepat 7 berkas pola tersisa (hari ini + 6 terbaru sebelumnya), `pruned` memuat 2 nama tertua, `catatan.txt` dan `ielts-manual.db` utuh | I |
| P4-35 | koneksi lain sedang menulis (transaksi WAL berjalan) | `backupIfDue` | berhasil tanpa galat; salinan berisi seluruh baris yang sudah commit; salinan terbuka sendiri tanpa berkas `-wal` | I |
| P4-36 | folder cadangan tidak dapat ditulisi (atau disk penuh) | `backupIfDue` | `status='failed'`, tidak melempar; log `backup_gagal` (tanpa isi DB); tidak ada berkas `.tmp`; DB sumber tidak berubah; `start:local` mencetak peringatan **Cadangan gagal** dan tetap lanjut | I, U |
| P4-37 | berkas DB belum ada (peluncuran pertama) | `backupIfDue` | `status='no_database'`, tidak ada berkas dibuat | I |
| P4-38 | `NODE_ENV=production` di proses web | `register()` (instrumentation) dipanggil | pemeriksa terdaftar sekali dengan interval 21.600.000 ms dan `unref()`; setiap tik memanggil `backupIfDue`; pada `NODE_ENV` lain pemeriksa tidak terdaftar | U (timer palsu) |
| P4-39 | cadangan valid `ielts-2026-11-07.db` dan DB saat ini berbeda, aplikasi berhenti | `npm run db:restore -- ielts-2026-11-07.db --yes` (atau `latest`) | DB saat ini dipindah ke `data/backups/ielts-sebelum-pulih-YYYYMMDD-HHmmss.db` (nama ini di luar pola retensi), `-wal`/`-shm` lama dihapus, `DATABASE_PATH` berisi isi cadangan, `PRAGMA integrity_check` = `ok`, kode keluar 0 | I |
| P4-39a | `db:restore` tanpa `--yes`; atau berkas tidak ada; atau cadangan gagal `integrity_check`; atau DB sedang dipakai (`BEGIN IMMEDIATE` gagal dalam 1 dtk) | perintah dijalankan | kode keluar 1 dan pesan berturut-turut **Tambahkan --yes untuk melanjutkan**, **Cadangan tidak ditemukan: <nama>**, **Cadangan rusak, tidak dipakai**, **Database sedang dipakai. Hentikan aplikasi lalu ulangi.**; DB saat ini tidak berubah | I |
| P4-39b | `npm run db:backup` | dijalankan | memanggil `backupIfDue` dengan `now=sekarang`, mencetak `created`/`skipped_today`, kode keluar 0 (1 bila `failed`) | I |

### AC: `doctor`
| ID | Diberikan | Ketika | Maka | V |
|---|---|---|---|---|
| P4-40 | instalasi baru setelah `start:local` pertama, `AI_ENABLED=false` | `npm run doctor` | kode keluar 0, tidak ada baris `[GAGAL]`; baris LLM berstatus `[CATAT]` | M, C |
| P4-41 | environment tanpa `DATABASE_URL`/`DATABASE_MIGRATOR_URL`/`TEST_DATABASE_URL` | `doctor` dan `cli`/`content-import` dijalankan | berjalan normal; kode `scripts/cli.ts` dan `scripts/content-import.ts` tidak membaca variabel itu | G, I |
| P4-42 | `.env` memuat salah satu `DATABASE_URL`, `DATABASE_MIGRATOR_URL`, `TEST_DATABASE_URL` | `doctor` | satu baris `[CATAT]` bernama **Sisa konfigurasi Postgres** yang menyebut nama kunci (bukan nilai) dan **aman dihapus dari .env**; tidak menggagalkan | U |
| P4-43 | berkas DB rusak (`PRAGMA quick_check` != `ok`) atau bukan database | `doctor` | `[GAGAL] Integritas database: ... Pulihkan: npm run db:restore -- latest --yes`, kode keluar 1 | I |
| P4-44 | DB ada | `doctor` | baris **Cadangan**: `[OK]` bila cadangan terbaru <= 48 jam (menyebut tanggalnya), `[CATAT] belum ada cadangan` bila tidak ada, `[CATAT] cadangan terakhir <tanggal> (lebih dari 48 jam)` bila lebih lama | U |
| P4-45 | kondisi apa pun | `doctor` | stdout memuat baris **Catatan koneksi internet:** diikuti semua entri `OFFLINE_NOTES` (YouTube, Speaking pihak ketiga, unduhan font/model) | U |

### AC: Frontend (satu-satunya perubahan UI Fase 4)
Tidak ada halaman, rute, atau komponen baru. Hanya `src/components/player/video-card.tsx` + `src/i18n/id.ts` (kunci baru `player.video.offline` = `Video butuh koneksi internet`).
| ID | Diberikan | Ketika | Maka | V |
|---|---|---|---|---|
| P4-47 | `navigator.onLine === false` saat `VideoCard` dipasang | render | teks **Video butuh koneksi internet** (ikon `VideoOff`, `role="status"`) tampil di tempat pemutar; `loadYouTubeApi` TIDAK dipanggil | U (RTL) |
| P4-48 | pemutar sedang tampil dan event `offline` terbit | event diterima | pemutar diganti panel P4-47 tanpa muat ulang halaman | U |
| P4-49 | panel offline tampil dan event `online` terbit | event diterima | status kembali `loading` dan `loadYouTubeApi` dipanggil; tidak ada tombol "Coba lagi" tambahan | U |

### AC: pembersihan
**Dihapus (git rm / hapus dari disk):**
- `.pgdata/` di akar repo (1.454 berkas data Postgres yang TERNYATA ter-track git; bukan hanya artefak lokal).
- `codes/Dockerfile`, `codes/.dockerignore`, `codes/docker-compose.yml`, `codes/docker-compose.dev.yml`, `codes/docker-compose.staging.yml`.
- `codes/docker/` seluruhnya (`backup/backup.sh`, `caddy/Caddyfile`, `db/init/01-roles.sh`, `stt/Dockerfile`).
- `codes/scripts/dev-db.ps1`.
- `codes/.local-pg/` (tidak ter-track; hapus dari disk).
- Di `src/worker/queues.ts` (sebelum dipindah, K8): `queueOptions`, `QueueOptionsDef`.

**Diubah (bukan dihapus):**
- `.github/workflows/ci.yml`: hapus `services.postgres`, env `TEST_DATABASE_URL`/`DATABASE_MIGRATOR_URL`/`SKIP_PRE_MIGRATE_BACKUP`, langkah `build:worker`, validasi `docker compose`, `docker build`, Trivy, `E2E_PG_PASSWORD`, `docker compose up/down`. Job `integration` = `npm ci` + `npm run test:integration` (berkas SQLite sementara dari `global-setup.ts`). Job `e2e` = build, migrasi+seed ke `DATABASE_PATH` sementara, Playwright. Tambah job `start-local-smoke` (P4-21/24/13/40). Job `security` tetap `npm audit` + gitleaks.
- `codes/package.json`: tambah `start:local`, `db:backup`, `db:restore`; `start` = `next start -H 127.0.0.1 -p 3005`; `engines.node` = `>=22.20.0`.
- `codes/next.config.ts`: hapus `output: 'standalone'`, `'pg'`/`'pg-boss'` dari `serverExternalPackages`, `outputFileTracingIncludes` (rute auth sudah tiada), komentar proxy/HSTS.
- `codes/.env.example`: `AUTH_URL=http://127.0.0.1:3005`, `ALLOWED_HOSTS` hanya port 3005, hapus blok S3/MinIO ke komentar berlabel "opsional, tidak dipakai bawaan", `STT_BASE_URL=http://127.0.0.1:8081`, tambah blok `LLAMACPP_BIN`/`LLAMACPP_MODEL_PATH`/`LLAMACPP_HF_REPO`/`LLAMACPP_ARGS` (dikomentari).
- `codes/playwright.config.ts`: port bawaan 3000 -> 3005 (`baseURL`, `webServer.url`).
- `codes/.gitignore`: hapus `.local-pg/`; `/data/` sudah mencakup `data/backups` dan `data/logs`. `.gitignore` akar: tambah `.pgdata/`. `codes/.gitattributes`: hapus baris `Dockerfile`, tambah `*.cmd text eol=crlf`.
- `codes/eslint.config.mjs` (`src/worker/**` -> `src/server/jobs/**`), `codes/vitest.config.ts` (komentar Postgres -> SQLite; buang entri `coverage.exclude` yang jalurnya sudah tidak ada; ambang 70% tetap).
- `codes/README.md` (bagian "Menjalankan" = satu perintah, `--port`, AI opsional, cadangan, pemulihan, hapus panduan `.env` manual dan Docker), `codes/VERSIONS.md` (selaraskan tabel dengan `package.json` saat ini, hapus bagian "Image Docker" dan "Penyesuaian API pg-boss", ubah catatan Node), komentar historis di `src/db/schema.ts`, `src/server/db.ts`, `src/server/jobs/queue.ts`, `tests/integration/global-setup.ts`, `scripts/cli.ts`, `scripts/content-import.ts` (hapus baris `process.env.DATABASE_URL ??= ...`), `tests/integration/content.itest.ts` baris 285.
- Dipindah: `src/worker/{queues,registry,purge}.ts` -> `src/server/jobs/`; impor di `queue.ts` dan `tests/integration/cli.itest.ts` disesuaikan.

**TIDAK boleh dihapus:** `drizzle/` (migrasi SQLite), `src/server/db.ts`, `db-migrate.ts`, `jobs/queue.ts`, handler di `registry.ts`, `purge.ts` (`anonymizeDeletedUsers`, dipakai tes), `scripts/{migrate,seed,cli,content-import,bank-validate,seed-full-content,unlock-ready,bench-*,pull-models.*}`, `scripts/_env.ts`, `content/**`, `data/` pengguna, `codes/.env` pengguna (tidak boleh ditimpa atau dihapus oleh pembersihan), driver `STORAGE_DRIVER=s3` di kode (hanya contoh env yang dikomentari), `tests/**`, dokumen sejarah (`task/**/dev_log.md`, `qa_report.md`, ADR lama). Berkas workflow VasVibe (`agent/`, `.claude/`, `.codex/`, `README.md` akar yang berasal dari template) bukan bagian pembersihan.
| ID | Diberikan | Ketika | Maka | V |
|---|---|---|---|---|
| P4-50 | pembersihan selesai | `git ls-files .pgdata codes/Dockerfile codes/.dockerignore "codes/docker-compose*" codes/docker codes/scripts/dev-db.ps1 codes/src/worker` | keluaran kosong; `codes/.local-pg` tidak ada di disk | G |
| P4-51 | pembersihan selesai | `git ls-files codes/drizzle codes/src/server/jobs codes/scripts/migrate.ts codes/scripts/seed.ts codes/scripts/cli.ts codes/content` | semua jalur "tidak boleh dihapus" tetap ada; `npm run test:integration` lulus (termasuk `ai-queue.itest.ts` dan `cli.itest.ts`) | G, I |
| P4-52 | pembersihan selesai | `git grep -niE "postgres\|docker\|pg-boss\|pgboss\|DATABASE_URL\|DATABASE_MIGRATOR_URL\|TEST_DATABASE_URL\|pg_advisory\|caddy\|tailscale\|testcontainers\|build:worker" -- codes ":!codes/package-lock.json" ":!codes/content" ":!codes/src/db/schema.ts" ":!codes/src/server/db.ts" ":!codes/src/server/jobs/queue.ts" ":!codes/tests/integration/global-setup.ts"` | keluaran kosong, kecuali baris di `codes/README.md` dan `codes/VERSIONS.md` yang berada di bagian berjudul **Catatan migrasi dari Postgres** (maks. 10 baris) | G |
| P4-53 | `package.json` baru | `node -e` membaca `scripts` dan `engines` | `scripts.start` = `next start -H 127.0.0.1 -p 3005`; ada `start:local`, `db:backup`, `db:restore`; tidak ada `build:worker`; `engines.node` = `>=22.20.0` | G |
| P4-54 | `ci.yml` baru | job dijalankan di GitHub Actions | tidak ada `docker`, `services:`, atau `postgres` di berkas; keenam job (`lint-typecheck`, `unit`, `integration`, `build`, `e2e`, `start-local-smoke`) plus `security` hijau | G, C |
| P4-55 | `next.config.ts` baru | `npm run build` lalu `npm run start` | build sukses; tidak ada peringatan "standalone"; server mendengarkan hanya `127.0.0.1:3005` | I, M |
| P4-56 | `.gitignore` baru | `git status` setelah `start:local` | `data/`, `.env`, `.next`, `data/backups`, `data/logs` tidak muncul sebagai tidak ter-track | G |
| P4-57 | akhir fase | `npm run typecheck`, `lint`, `test -- --coverage`, `test:integration`, `test:e2e` | semuanya lulus; coverage `src/server/**` lines >= 70%; tidak ada regresi gatekeeping, band, Writing, Speaking eksternal | I |
| P4-58 | mesin bersih Windows 11 (tanpa `node_modules`, `.env`, `data/`, `.next`) dengan Node 22.20+ dan internet | `git clone`, `npm ci`, `npm run start:local` | tanpa langkah lain: `.env` dibuat, DB ter-migrasi+seed, konten bawaan terbit, build, server siap, browser terbuka di `/pilih-profil`, membuat profil dan membuka dashboard (200) berhasil; `npm run doctor` hijau | M |
| P4-60 | antrean dipindah ke `src/server/jobs` | kirim Writing dengan `AI_ENABLED=true`, `LLM_DRIVER=mock`; panggil job `retention-purge` | submission menjadi `GRADED`; purge selesai tanpa galat | I |

**Catatan pelaksanaan P4-52 (koreksi dokumentasi, 2026-11-08):** `git grep` P4-52 juga mengenai `codes/src/server/cli/doctor.ts` (baris "Sisa konfigurasi Postgres" dan nama kunci `DATABASE_URL`/`DATABASE_MIGRATOR_URL`/`TEST_DATABASE_URL`, diwajibkan P4-42), tes yang memeriksanya (`codes/tests/unit/phase4-ops.test.ts`, `codes/tests/integration/backup.itest.ts`), dan bagian "Catatan migrasi dari Postgres" di `codes/VERSIONS.md`. Ketiganya adalah pengecualian sah P4-52 di samping `codes/README.md`.

**Catatan di luar cakupan dev (dicatat di task file, "perlu pembaruan oleh Document"):** ADR-001, `state/knowledge_base/architecture/{capacity_planning,current_state,infrastructure}.md`, `state/knowledge_base/data-model/data-model.md`, `state/knowledge_base/security/security-standards.md`, `state/knowledge_base/requirements/requirements.md`, spec 000, `project_overview.md`, `specifications/_api-contract.md`, spec 012/013/019 (sisa istilah Postgres/Docker), `task/TASK-000_environment-setup/*`. Isinya tidak diubah oleh fase ini.

**Di luar cakupan Fase 4 (Non-Goals tambahan):** pemasang/installer, ikon desktop, auto-start saat boot, pembaruan otomatis, layanan Windows, HTTPS, enkripsi cadangan, cadangan ke luar mesin, font lokal (build pertama tetap butuh internet, D10), deteksi "internet putus tetapi `navigator.onLine` true" pada kartu video (tetap jatuh ke status gagal pemuatan yang ada), impor data dari Postgres lama.

**Pembagian kerja.** Backend/Ops: skrip `start-local*`, `.cmd`, `backup.ts` + CLI `db backup|restore`, instrumentation, `doctor`, CI, pembersihan, dokumentasi (P4-01..46, 50..60 kecuali P4-47..49). Frontend: hanya P4-47..49.

## Human Approval
- [x] Disetujui human (2026-11-08, "Setujui, mulai Fase 1")

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
| 2026-11-08 | Analyst (spec-lock Fase 4) | Tambah bagian "Fase 4: AC detail" (K1-K8, alur start:local, P4-01..P4-60, daftar hapus/ubah/jangan-hapus). D1-D11 tidak diubah. Penambahan aditif: CLI `db:backup`/`db:restore`, `next start` menggantikan standalone, `engines` tanpa batas atas, pemindahan `src/worker` ke `src/server/jobs`. Temuan: `.pgdata/` ter-track git (1.454 berkas); `doctor` sudah tidak butuh `DATABASE_MIGRATOR_URL` (sisa hanya di `cli.ts`, `content-import.ts`, tes, `.env` lokal). |
| 2026-11-08 | Backend (koreksi dokumentasi) | Fase 4: catat pengecualian `git grep` P4-52 (`doctor.ts`, tesnya, `VERSIONS.md`) agar spec sesuai kenyataan. Tidak ada perubahan AC lain. |
