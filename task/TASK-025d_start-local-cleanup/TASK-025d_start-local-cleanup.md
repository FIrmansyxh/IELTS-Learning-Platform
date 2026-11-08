# TASK-025d Satu Perintah Menjalankan (start:local) dan Pembersihan Docker/Postgres
**Spec:** `specifications/025_spec_local_single_device_app.md` (Fase 4 saja; rincian AC di bagian "Fase 4: AC detail", kode P4-01..P4-60; Fase 1-3 = TASK-025a/b/c)
**Priority:** P1
**Wave:** W10 (urutan build ke-1 dari 5)
**Size:** L (naik dari M setelah spec-lock: skrip peluncur, modul cadangan + restore, CI, pembersihan 1.454+ berkas)
**Assigned To:** Developer Agent (Backend/Ops; FE minimal: 1 komponen)
**Dependencies:** TASK-025c (SQLite + antrean dalam proses; status `ready_to_test`, belum `done`)
**Current Status:** in_progress (Backend/Ops selesai kode + tes 2026-11-08; menunggu izin human untuk .pgdata/, bukti CI start-local-smoke, Playwright, dan verifikasi manual Windows)

---

## Description
Menutup SPEC-025 Fase 4: `npm run start:local` (dan `codes/start-local.cmd` untuk Windows) menyiapkan `.env`, cadangan, migrasi+seed, konten bawaan, build bila perlu, `llama-server` opsional, lalu menyalakan `next start` di `127.0.0.1:3005` dan membuka browser. Sekaligus membersihkan seluruh sisa Docker/Compose/Caddy/Postgres dan memastikan `npm run doctor` hijau di mesin bersih setelah `npm ci`.

Task pondasi untuk TASK-022, 021, 024, 023.

## Acceptance Criteria
Sumber kebenaran: spec 025 bagian "Fase 4: AC detail". Ringkasan pengelompokan (tiap ID dicentang saat lulus; V = U unit, I integrasi, C CI smoke, M manual, G git/grep):

- [x] **start:local** P4-01..P4-25, P4-59 (otomatis lulus; bukti M/C tertentu belum, lihat dev_log) (argumen, Node, HOSTNAME, port, `.env`, migrasi, seed, konten, build, bind loopback, kesiapan, browser, SIGINT, kode keluar)
- [x] **llama-server opsional** P4-26..P4-29 (otomatis lulus; bukti M/C tertentu belum, lihat dev_log)
- [ ] **Pintasan Windows** P4-30, P4-31, P4-32a
- [x] **Cadangan harian 7 hari + pemulihan** P4-32..P4-39b (otomatis lulus; bukti M/C tertentu belum, lihat dev_log)
- [x] **doctor** P4-40..P4-45 (otomatis lulus; bukti M/C tertentu belum, lihat dev_log) (D10 internet notes termasuk)
- [ ] **Frontend: kartu video offline** P4-47..P4-49
- [ ] **Pembersihan** P4-50..P4-56, P4-60
- [ ] **Regresi dan mesin bersih** P4-57, P4-58 (AC-5 spec: typecheck, lint, unit, integrasi, e2e; coverage `src/server/**` >= 70%)

## Subtasks

### Backend / Ops (urutan disarankan)
1. **Pindah antrean** (K8): `src/worker/{queues,registry,purge}.ts` -> `src/server/jobs/`; hapus `queueOptions`/`QueueOptionsDef`; perbarui impor (`jobs/queue.ts`, `tests/integration/cli.itest.ts`) dan `eslint.config.mjs`. Lulus: P4-60.
2. **Modul cadangan** `src/server/backup.ts`: `backupIfDue`, `listBackups`, `restoreBackup` (`VACUUM INTO` ke `.tmp` lalu `rename`, pola nama `ielts-YYYY-MM-DD.db`, simpan 7). CLI `db backup` dan `db restore` di `src/server/cli/run.ts` + skrip `db:backup`, `db:restore` di `package.json`. Pemeriksa 6 jam di `src/instrumentation.ts` (hanya `NODE_ENV=production`, `unref`). Tes: P4-32..39b.
3. **Peluncur** `codes/scripts/start-local.mjs` (penjaga versi Node, sintaks lama) + `codes/scripts/lib/start-local.mjs` (parser argumen, `checkNode`, `checkHostname`, `isPortFree`/deteksi aplikasi sendiri via `/api/health`, `ensureEnv`, `needsBuild`, `planLlama`, `openBrowser`, orkestrasi dengan dependensi yang bisa diinjeksi). Anak proses: `process.execPath` + `node_modules/tsx/dist/cli.mjs` dan `node_modules/next/dist/bin/next`, tanpa shell. Pesan galat memakai teks persis dari spec. Tes unit `tests/unit/start-local.test.ts`: P4-01..09, 11, 14..19, 22, 23, 25..29.
4. **Pintasan Windows** `codes/start-local.cmd` (isi tetap di spec) + `*.cmd text eol=crlf` di `codes/.gitattributes`. Lulus: P4-30..32a (manual).
5. **`package.json` dan `next.config.ts`:** `start:local`, `db:backup`, `db:restore`, `start` = `next start -H 127.0.0.1 -p 3005`, `engines.node` = `>=22.20.0`; hapus `output: 'standalone'`, `pg`/`pg-boss` dari `serverExternalPackages`, `outputFileTracingIncludes`. Cek apakah `src/server/auth/common-passwords.txt` masih ada dan hapus bila tidak dipakai. Lulus: P4-53, P4-55.
6. **`doctor`** (`src/server/cli/doctor.ts`): cek integritas (`PRAGMA quick_check`), cek cadangan (ok/catat 48 jam), peringatan sisa konfigurasi Postgres di `.env`, tetap cetak `OFFLINE_NOTES`. Hapus `process.env.DATABASE_URL ??= ...` di `scripts/cli.ts` dan `scripts/content-import.ts`; perbaiki `tests/integration/content.itest.ts:285`. Catatan: `doctor` sendiri SUDAH tidak butuh `DATABASE_MIGRATOR_URL` (membaca `_migrations` dan jurnal `drizzle/`); teks "butuh `DATABASE_MIGRATOR_URL`" di Status Implementasi Fase 2 spec hanyalah sejarah. Lulus: P4-41..45.
7. **Hapus** (daftar pasti, spec bagian "AC: pembersihan"): `.pgdata/` (TER-TRACK git, 1.454 berkas; gunakan `git rm -r`, jangan commit sebelum human setuju), `codes/Dockerfile`, `codes/.dockerignore`, `codes/docker-compose{,.dev,.staging}.yml`, `codes/docker/`, `codes/scripts/dev-db.ps1`, `codes/.local-pg/` (tidak ter-track). JANGAN hapus daftar "TIDAK boleh dihapus" di spec, termasuk `codes/.env` pengguna.
8. **Bersihkan referensi:** `.env.example` (port 3005, blok S3/STT, blok LLAMACPP baru), `playwright.config.ts` (3000 -> 3005), `.gitignore` akar dan `codes/.gitignore`, `.gitattributes`, `vitest.config.ts`, `README.md` (bagian "Menjalankan" = satu perintah, `--port`, AI opsional, cadangan, pemulihan), `VERSIONS.md` (selaraskan dengan `package.json`; sisa catatan sejarah di bawah judul "Catatan migrasi dari Postgres"), komentar historis. Lulus: P4-52, P4-56.
9. **CI** `.github/workflows/ci.yml`: ganti job `integration` ke SQLite tanpa service, ganti job `build` (hapus `build:worker`, compose, docker build), ganti `e2e` (DB sementara, port 3005), hapus Docker/Trivy dari `security`, tambah `start-local-smoke` (jalankan `node scripts/start-local.mjs --no-open --port 3015` latar belakang, tunggu `/api/health`, cek `/pilih-profil` = 200, impor konten terbit, `npm run doctor` exit 0, kirim SIGINT dan pastikan exit 0). Lulus: P4-54 + bukti C untuk P4-13, 21, 24, 40.
10. **Verifikasi manual mesin bersih** (P4-58, P4-30, P4-31, P4-05, P4-23): clone baru Windows 11, catat hasil di `dev_log.md`.

### Frontend (satu komponen, tanpa halaman baru)
1. `src/components/player/video-card.tsx`: saat `navigator.onLine === false` tampilkan panel `VideoOff` + teks i18n `player.video.offline` = "Video butuh koneksi internet" (`role="status"`), jangan panggil `loadYouTubeApi`; dengarkan event `offline`/`online` (pasang/lepas di `useEffect`); saat `online` kembali ke status `loading`. Saat ini TIDAK ada teks ini di kode (diperiksa; hanya `failed`, `loading`, `openYoutube`).
2. Tambah kunci di `src/i18n/id.ts` (blok `video`, dekat baris 442-449). Tes RTL di `video-card.test.tsx`: P4-47..49 (palsukan `navigator.onLine` dengan `vi.spyOn(navigator, 'onLine', 'get')`).
3. Pernyataan eksplisit: tidak ada halaman, rute, atau komponen baru; tidak ada perubahan design-system.

## File / Area Kode yang Disentuh
- Baru: `codes/scripts/start-local.mjs`, `codes/scripts/lib/start-local.mjs`, `codes/start-local.cmd`, `codes/src/server/backup.ts`, `codes/tests/unit/start-local.test.ts`, `codes/tests/integration/backup.itest.ts`
- Ubah: `codes/package.json`, `next.config.ts`, `playwright.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.env.example`, `.gitattributes`, `.gitignore` (akar dan `codes/`), `README.md`, `VERSIONS.md`, `src/instrumentation.ts`, `src/server/cli/{run,doctor}.ts`, `scripts/{cli,content-import}.ts`, `src/server/jobs/queue.ts`, komentar di `src/db/schema.ts` dan `src/server/db.ts`, `tests/integration/{cli,content}.itest.ts`, `src/components/player/video-card.tsx` (+ tes), `src/i18n/id.ts`, `.github/workflows/ci.yml`
- Pindah: `src/worker/*` -> `src/server/jobs/`
- Hapus: lihat subtask 7

## Catatan "perlu pembaruan oleh Document" (BUKAN dikerjakan task ini; isi tidak boleh diubah oleh Developer)
Masih menyebut Docker/Postgres/pg-boss: `state/knowledge_base/decisions/ADR-001-local-docker-compose-topology.md` (tandai superseded oleh ADR-005), `ADR-003`, `ADR-004` (sebagian), `state/knowledge_base/architecture/{capacity_planning,current_state,infrastructure}.md`, `state/knowledge_base/data-model/data-model.md`, `state/knowledge_base/security/security-standards.md`, `state/knowledge_base/requirements/requirements.md`, `specifications/000_spec_environment_setup.md`, `specifications/_api-contract.md`, spec 002/012/013/019 (sebagian superseded), `project_overview.md` (baris 52, 56, 57: PostgreSQL via Docker, volume Docker, pg-boss), `task/TASK-000_environment-setup/*`. Dokumen sejarah (`dev_log`, `qa_report`) dibiarkan.

## Definition of Done
- Semua ID P4-01..P4-60 lulus menurut kolom V; typecheck, lint, test (coverage >= 70%), test:integration, test:e2e hijau; job CI `start-local-smoke` hijau.
- Verifikasi manual clone bersih Windows 11 tercatat di `dev_log.md` (P4-58).
- P4-52 (grep) kosong; `.pgdata/` sudah dihapus dari indeks git (commit hanya atas izin human).
- Status log diperbarui; menunggu gerbang QA/tester.

## Risiko / Catatan
- R1 (dijawab Analyst): `doctor` tidak lagi bergantung pada `DATABASE_MIGRATOR_URL`; sisa ada di `scripts/cli.ts:7`, `scripts/content-import.ts:10`, `content.itest.ts:285`, `.env` lokal.
- R2 (dijawab): cadangan harian 7 hari sekarang punya AC (P4-32..39b) dan mekanisme (K5). Tidak dipindah ke fase lain.
- R3 (dijawab): runner GitHub Actions adalah mesin bersih; `start-local-smoke` menguji alur tanpa LLM. Yang tetap manual: Windows `.cmd`, `llama-server` nyata, pembukaan browser.
- R4 (DIKOREKSI): `.pgdata/` di akar repo TER-TRACK git (1.454 berkas, commit `adad7f9`). `codes/.local-pg/` tidak ter-track. Penghapusan `.pgdata/` menghasilkan diff besar; commit hanya atas izin human. Riwayat git tetap menyimpan data lama (bila berisi data sensitif, pembersihan riwayat di luar cakupan: lihat pertanyaan terbuka).
- R5: `codes/.env` lokal pengembang berisi `DATABASE_URL`/`DATABASE_MIGRATOR_URL` berkredensial Postgres lama. Skrip tidak boleh menimpa; `doctor` memberi peringatan P4-42; pengguna menghapusnya sendiri.
- R6: Guard `HOSTNAME` (D4) dapat salah-positif bila shell mengekspor `HOSTNAME` = nama mesin (sebagian Linux/Docker). Pesan galat harus menunjukkan cara membersihkannya (P4-04). Peluncur selalu menimpa `HOSTNAME=127.0.0.1` untuk anak proses.
- R7: Build pertama butuh internet (font Google di `src/app/layout.tsx`); diakui di D10. Menyalin font lokal adalah keputusan terpisah (lihat pertanyaan terbuka).
- R8: Ctrl+C pada `.cmd` memunculkan "Terminate batch job (Y/N)?" bawaan Windows; jawab Y. Tidak dapat dihindari tanpa menjalankan `node` langsung.

## Pertanyaan terbuka untuk human
1. OPEN QUESTION: Font Google (`next/font/google`) membuat build pertama butuh internet. Setuju tetap (D10) atau ganti `next/font/local` agar build 100% offline? Default spec: tetap.
2. OPEN QUESTION: `.pgdata/` ter-track git. Hapus dari indeks saja (riwayat tetap) atau juga bersihkan riwayat? Default spec: hanya dihapus dari indeks.
3. OPEN QUESTION: Setuju `engines.node` diubah ke `>=22.20.0` (menerima Node 24)? Default spec: ya.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-08 12:00 | pm agent | task created | - |
| 2026-11-08 | analyst | spec-lock Fase 4 | AC dimatangkan (P4-01..P4-60), subtask diperjelas, R1-R4 dijawab/dikoreksi, ukuran M -> L; status tetap not_started |
| 2026-11-08 | backend | development started | - |
| 2026-11-08 | backend | backend/ops implemented | start-local, backup/restore, doctor, CI, pembersihan; unit 712, integrasi 241, build OK; .pgdata/ menunggu izin human; M/C belum; lihat dev_log.md |
| 2026-11-08 | backend | QA fixes applied | M-1, M-2, M-5, L-1, L-2, coverage.exclude dikembalikan (coverage jujur 33,49%, utang terbuka); pin SHA aksi ditunda; status tetap in_progress |
