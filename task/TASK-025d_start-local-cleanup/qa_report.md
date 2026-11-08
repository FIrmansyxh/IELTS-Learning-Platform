# QA & Security Report: TASK-025d (SPEC-025 Fase 4, start:local + pembersihan Docker/Postgres)

**Date:** 2026-11-08
**Target Branch:** claude/platform-e2e-learning-3b7c17 (perubahan belum di-commit; ditinjau lewat `git status`/`git diff` + berkas untracked)
**Reviewer:** QA (static review + security, depth standard dengan OWASP pada permukaan yang relevan)
**Verdik akhir: PASS-WITH-FIXES** (0 CRITICAL, 1 HIGH, 4 MEDIUM, 8 LOW)

## 0. Pemeriksaan otomatis yang dijalankan (baca-saja)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 57 berkas, 712 tes lulus |
| `npx vitest run -c vitest.integration.config.ts` | 15 berkas, 241 tes lulus |
| `npx eslint --max-warnings=0` (peluncur, backup, cli, jobs, instrumentation, player, konfigurasi) | exit 0 |
| `npx vitest run --coverage` dengan `coverage.exclude` dikosongkan (via CLI, direktori laporan di scratchpad) | Lines `src/server/**` **29,23%** (konfigurasi sekarang melaporkan 91,5%) |
| `git ls-files .pgdata \| wc -l` | **1454** berkas masih ter-track |
| `git grep` P4-52 | hanya `VERSIONS.md` (bagian Catatan migrasi, sah) dan `src/server/cli/doctor.ts` (diwajibkan P4-42) |
| Eksperimen kecil di scratchpad (bukan di repo): probe `BEGIN IMMEDIATE` + `rename` dengan koneksi SQLite idle, dan kutipan argumen `cmd /c` | lihat M-2 dan L-2 |

Tidak dijalankan: Playwright, GitHub Actions, pengujian manual Windows bersih (P4-30/31/32a/58). Tidak ada kode diubah, tidak ada `git add/commit/rm`.

## 1. Code Quality & Standards
- [x] Pass (dengan catatan)
- Penamaan, struktur, dan injeksi dependensi pada `scripts/lib/start-local.mjs` rapi dan terbaca; fungsi murni terpisah dari efek samping sehingga teruji.
- Impor `src/worker` -> `src/server/jobs` bersih: `git grep "src/worker|@/worker"` kosong; `queue.ts` memakai `./queues` dan `./registry`; `tsc` dan seluruh tes hijau. Tidak ditemukan kode mati baru (`queueOptions`/`QueueOptionsDef` memang dihapus).
- Pengecualian ESLint `security/detect-non-literal-fs-filename` diperluas ke `src/server/backup.ts` dan `src/server/cli/**`, dan komentar `eslint-disable` di `run.ts` dihapus. Dapat diterima (jalur dari konfigurasi/CLI operator lokal), tetapi cakupannya luas (lihat L-8).
- Kelemahan kualitas tes dicatat di L-7.

## 2. Security Assessment
- [x] Pass (tanpa CRITICAL; ada MEDIUM yang perlu diperbaiki sebelum E2E)
- Hardcoded secret: tidak ada. `.env` tidak ter-track dan ter-ignore (`codes/.gitignore:11`). `git grep` pola rahasia di berkas baru: nol.
- Peluncur:
  - Spawn tanpa shell di semua jalur (`shell:false`, `process.execPath` + jalur biner di `node_modules`), tidak ada interpolasi string ke perintah. Argumen yang diterima hanya `--port/--no-open/--rebuild/--help`; `--port` divalidasi `^\d+$` lalu rentang 1024-65535; opsi lain ditolak (kode 2). Tidak ada injeksi argumen/jalur dari input pengguna ke `cmd`/shell (satu-satunya URL ke `cmd /c start` dibangun dari port numerik tervalidasi).
  - Bind loopback: `next start -H 127.0.0.1`, `HOSTNAME` non-loopback ditolak, `deriveEnv` menimpa `HOSTNAME/AUTH_URL/ALLOWED_HOSTS` untuk anak proses saja. Pengecualian: `llama-server` (lihat M-4).
  - `.env`: ditulis dengan flag `wx` (tidak menimpa), `mode 0o600` (tidak berefek di Windows), rahasia `randomBytes(32)` terpisah, tidak dicetak. Berkas yang ada divalidasi tanpa diubah.
  - Penanganan sinyal: SIGINT/SIGTERM/SIGBREAK dipasang, anak proses di-SIGTERM lalu SIGKILL setelah 10 dtk, handler dilepas di `finish`.
- Cadangan/pemulihan: `VACUUM INTO ?` memakai parameter terikat (tidak ada SQL injection lewat jalur); argumen `db restore` dibatasi `path.basename`, ekstensi `.db`, harus berkas biasa di folder cadangan (traversal ditolak, termasuk `C:foo.db` di Windows). Lihat M-2 untuk celah pada pemeriksaan "DB sedang dipakai".
- CI: `permissions: contents: read`, tidak ada rahasia di `ci.yml` (rahasia e2e dibuat acak per-run lewat `openssl`), gitleaks + `npm audit` dipertahankan. Catatan L-6 (pin action).
- Input/XSS/CSRF: tidak ada permukaan baru selain `VideoCard` (tidak ada `dangerouslySetInnerHTML`; `video_id` tetap lewat regex).

## 3. Architecture Alignment
- [x] Pass (dengan catatan)
- Sesuai K1-K8 dan D11: `next start` loopback, `standalone` dan `pg`/`pg-boss` dihapus dari `next.config.ts`, `engines.node >=22.20.0`, skrip `start`/`start:local`/`db:backup`/`db:restore`, antrean dipindah ke `src/server/jobs/`.
- Berkas "TIDAK boleh dihapus" semua masih ada: `drizzle/` (5 berkas ter-track), `src/server/db.ts`, `db-migrate.ts`, `jobs/queue.ts`, `jobs/registry.ts`, `jobs/purge.ts`, `scripts/{migrate,seed,cli,content-import,bank-validate,seed-full-content,unlock-ready,bench-*,pull-models.*,_env.ts}`, `content/`, `codes/.env` pengguna. Berkas lama (`Dockerfile`, `.dockerignore`, `docker-compose*`, `docker/`, `scripts/dev-db.ps1`, `src/worker/*`) memang sudah terhapus dari indeks kerja (status `D`).
- Penyimpangan: `.pgdata/` belum dihapus (H-1) dan perubahan `coverage.exclude` melampaui yang diizinkan spec (M-3).

## 4. Temuan (diurutkan menurut tingkat)

### CRITICAL
Tidak ada.

### HIGH

**H-1. P4-50 belum terpenuhi: `.pgdata/` masih ter-track git (1.454 berkas) dan ada di disk.**
- Bukti: `git ls-files .pgdata | wc -l` = 1454; `.pgdata/PG_VERSION` ada. Dev log mengakui "MENUNGGU IZIN HUMAN". `.gitignore` akar sudah menambah `.pgdata/` (`.gitignore` diff), tetapi ignore tidak berpengaruh pada berkas yang sudah ter-track.
- Dampak: AC P4-50 gagal; commit berikutnya membawa data Postgres lama ke riwayat; `git status` kotor setelah Postgres lama dijalankan.
- Saran: setelah human setuju, `git rm -r --cached .pgdata` (dan hapus dari disk bila diinginkan). Ini keputusan human, bukan cacat kode; tetapi fase tidak boleh ditandai selesai sebelum ini.

### MEDIUM

**M-1. `countPublished` membaca `DATABASE_PATH` hanya dari environment proses, bukan dari `.env`; impor konten bawaan bisa terlewat atau menyasar DB yang salah.**
- Berkas:baris: `codes/scripts/lib/start-local.mjs:247-257` (`realCountPublished` memakai `env.DATABASE_PATH`) dipanggil di `:465` dengan `childEnv` (turunan `ctx.env`, tanpa isi `.env`). Bandingkan `:445` yang benar memakai `merged` (`.env` + proses).
- Bukti: README menyatakan DB dapat diubah lewat `DATABASE_PATH` (di `.env`, dimuat `scripts/_env.ts` oleh migrate/seed/cli dan oleh Next). Bila `DATABASE_PATH` hanya ada di `.env`, migrate/seed membuat DB di lokasi kustom, tetapi `realCountPublished` membuka `data/ielts.db` (tidak ada -> galat -> peringatan "Tidak bisa memeriksa konten terbit", `published=-1`, impor dilewati) atau, bila ada DB lama di sana, memutuskan berdasarkan DB yang salah. Tes unit menyuntik `countPublished` palsu (`start-local.test.ts:111`), sehingga cacat ini tidak terlihat; P4-13/P4-14 tidak diuji dengan `DATABASE_PATH` dari `.env`.
- Saran: ubah `:465` menjadi `deps.countPublished({ ...merged, ...childEnv }, cwd)` (atau teruskan `merged.DATABASE_PATH`), dan tambah tes yang menulis `.env` dengan `DATABASE_PATH` kustom dan memeriksa jalur yang dibuka.

**M-2. Pemeriksaan "Database sedang dipakai" pada `db:restore` tidak mendeteksi server yang hidup; di POSIX bisa menimbulkan split-brain, di Windows berakhir dengan galat mentah EBUSY.**
- Berkas:baris: `codes/src/server/backup.ts:145-166` (`assertNotInUse`), `:193-196` (rename lalu hapus `-wal/-shm`), `codes/src/server/cli/run.ts:229-241`.
- Bukti: server menyimpan satu koneksi SQLite idle (`db.ts: getRaw()`); `BEGIN IMMEDIATE` dan `wal_checkpoint(TRUNCATE)` dari koneksi lain berhasil selama server tidak sedang dalam transaksi tulis. Eksperimen di scratchpad (koneksi WAL idle + probe identik): "probe passed with idle server connection open", lalu `renameSync` gagal `EBUSY: resource busy or locked` di Windows (galat bukan `RestoreError`, jadi sampai ke pengguna sebagai galat mentah/umum, bukan pesan **Database sedang dipakai. Hentikan aplikasi lalu ulangi.**). Di Linux/macOS rename akan berhasil dan server terus menulis ke inode lama yang kini berstatus "ielts-sebelum-pulih-*.db", sementara `-wal/-shm` dihapus dari bawahnya (risiko korupsi salinan pengaman).
- Dampak: AC P4-39a untuk kasus "DB sedang dipakai" hanya terbukti untuk transaksi tulis yang sedang berjalan (itest), bukan untuk skenario nyata yang dimaksud README ("hentikan aplikasi dulu").
- Saran: (a) tambahkan deteksi yang andal: coba `PRAGMA locking_mode=EXCLUSIVE` lalu tulis (gagal bila ada koneksi lain di mode WAL), dan/atau probe `GET /api/health` pada port yang dikonfigurasi, dan/atau berkas kunci `data/.app.lock` yang dibuat `start:local`; (b) bungkus `renameSync` (`:193`) dengan `try/catch` yang memetakan `EBUSY/EPERM/EACCES` ke `RestoreError('IN_USE', ...)`; (c) tambah tes integrasi dengan koneksi idle terbuka yang meniru server.

**M-3. Perubahan `coverage.exclude` mengosongkan jaring pengaman 70%; angka 91,5% tidak mencerminkan cakupan unit.**
- Berkas:baris: `codes/vitest.config.ts:21-43`.
- Bukti: dengan exclude dikosongkan, lines `src/server/**` = 29,23% (BE melaporkan ~33,5% pada kondisi awal). Spec (bagian "Diubah") hanya mengizinkan komentar Postgres -> SQLite dan "buang entri yang jalurnya sudah tiada; ambang 70% tetap", bukan menambah 20+ entri baru. Daftar baru memuat modul yang bukan murni terikat DB atau yang justru punya tes unit: `src/server/cli/**` (termasuk `doctor.ts`, diuji `phase4-ops.test.ts`), `src/server/backup.ts` dan `jobs/**` (kode baru Fase 4), `attempts/dto.ts` (nol impor `db`, 211 baris), serta semua `service.ts`. Tes integrasi tidak menghasilkan coverage, jadi pernyataan "diverifikasi oleh tes integrasi" tidak terukur. Ini menjadikan gerbang CI `unit` (`ci.yml` "Ambang coverage ... 70%") hampir tak bermakna.
- Catatan jujur: kondisi di bawah 70% sudah ada sebelum Fase 4 (hasil Fase 1-3), jadi ini bukan regresi baru, tetapi memutihkannya lewat exclude adalah keputusan yang harus eksplisit dari human.
- Saran (pilih satu, minta keputusan human): (1) kecualikan hanya berkas yang benar-benar tak bisa diuji unit dan keluarkan `dto.ts`, `cli/doctor.ts`, `cli/run.ts` dari exclude; (2) jalankan coverage pada `vitest.integration.config.ts` dan gabungkan dengan unit di CI; (3) turunkan ambang ke angka terukur (mis. 30%) dengan komentar bahwa itu dasar, plus tiket menaikkannya. Cantumkan angka jujur di dev log dan di komentar `vitest.config.ts`.

**M-4. `LLAMACPP_ARGS` dapat menimpa `--host 127.0.0.1`, sehingga LLM tanpa autentikasi bisa terbuka ke LAN.**
- Berkas:baris: `codes/scripts/lib/start-local.mjs:171` dan `:180` (`[...modelArgs, '--host','127.0.0.1','--port', port, ..., ...extra]`).
- Bukti: argumen tambahan ditaruh setelah `--host`/`--port`; pada `llama-server` opsi yang muncul terakhir menang, sehingga `LLAMACPP_ARGS=--host 0.0.0.0` (kesalahan konfigurasi yang wajar, mis. salin dari panduan llama.cpp) membuat server LLM mendengarkan semua antarmuka. Bertentangan dengan tujuan "bind HANYA 127.0.0.1" (D11) yang hanya divalidasi pada `LLAMACPP_BASE_URL`.
- Saran: tolak (peringatan "Penilai Writing tidak dinyalakan: LLAMACPP_ARGS tidak boleh memuat --host/--port") atau saring token `--host`, `--port`, `-h`, `--listen*` dari `extra`; letakkan `--host 127.0.0.1` terakhir sebagai pengaman. Tambah tes P4-28 untuk kasus ini.

### LOW

**L-1. `start-local.cmd` salah menghitung kode keluar pada kegagalan `npm ci`.** `codes/start-local.cmd:9-13`: `set CODE=%ERRORLEVEL%` dan `exit /b %CODE%` berada dalam blok `( ... )` sehingga `%...%` diperluas saat blok di-parse (CODE kosong, ERRORLEVEL basi), bukan saat dieksekusi. Akibatnya `exit /b` memakai kode yang salah (kemungkinan 0) walau `npm ci` gagal; melanggar P4-32a "kode keluar .cmd = kode keluar skrip" untuk cabang ini. Saran: `call npm ci || (pause & exit /b 1)` atau `setlocal EnableDelayedExpansion` dengan `!ERRORLEVEL!`. Cabang akhir (di luar blok) benar.

**L-2. Kutipan judul kosong pada `cmd /c start "" <url>` diubah Node menjadi `"\"\""`.** `codes/scripts/lib/start-local.mjs:225`. Eksperimen (`spawnSync('cmd',['/c','echo','start','""',url])`): cmd menerima `start "\"\"" http://...`; dengan `windowsVerbatimArguments:true` menerima `start "" http://...`. Kemungkinan tetap membuka browser (judul menjadi aneh) tetapi tidak terjamin; P4-23 hanya diuji dengan spawner palsu dan M belum dijalankan. Saran: tambahkan `windowsVerbatimArguments: true` untuk cabang win32 dan verifikasi manual.

**L-3. `VideoCard`: state awal dari `navigator.onLine` dapat menyebabkan hydration mismatch; `role="status"` yang dipasang dinamis mungkin tidak diumumkan; posisi akhir tidak dilaporkan saat offline.** `codes/src/components/player/video-card.tsx:45` memakai `useState(() => navigator.onLine !== false)` (server selalu `true`; aplikasi di localhost tetap termuat ketika internet putus, jadi skenario nyata). Saran: inisialisasi `true`, sinkronkan di `useEffect` (cek `navigator.onLine` sekali saat mount) atau `useSyncExternalStore`. Pendengar `online/offline` sudah dilepas benar dan `key="offline"/"host"` mencegah iframe tertinggal (baik). `role="status"` pada elemen yang baru dirender sering tidak diumumkan pembaca layar; pertimbangkan wadah `aria-live="polite"` yang selalu ada. Saat offline, cleanup efek memanggil `onPlayingChange(false)` tetapi tidak `onPosition(current)`, jadi posisi sejak laporan 5 dtk terakhir hilang.

**L-4. Alur `restoreBackup`: urutan operasi memberi jendela tanpa DB dan menelan kegagalan checkpoint.** `codes/src/server/backup.ts:153` (kegagalan `wal_checkpoint` ditelan), `:193-196` (DB dipindah dan `-wal` dihapus sebelum salinan dibuat di `:201`), `:215` (bila `integrityOk(dbPath)` gagal setelah rename, DB rusak dibiarkan tanpa pengembalian). Bila proses mati di antara `:193` dan `:202`, `start:local` berikutnya membuat DB kosong baru secara diam-diam (data aman di `ielts-sebelum-pulih-*`). Kegagalan checkpoint + penghapusan `-wal` bisa membuang transaksi yang belum ter-checkpoint dari salinan pengaman. Saran: salin dulu `source` -> `tmp`, verifikasi, baru `rename(db -> previous)` dan `rename(tmp -> db)`; jangan hapus `-wal` bila checkpoint gagal; kembalikan `previous` bila verifikasi akhir gagal. Juga: berkas `ielts-sebelum-pulih-*.db` tidak pernah dipangkas.

**L-5. Pemeriksa cadangan dalam proses (`instrumentation.ts`): tik tidak dilindungi `try/catch`, pertama berjalan setelah 6 jam, dan `VACUUM INTO` sinkron memblokir event loop.** `codes/src/instrumentation.ts:16-20`. `backupIfDue` menelan galat utama, tetapi `existsSync/listBackups` di luar `try` bisa melempar di callback timer (uncaught exception pada proses web). Saran: bungkus isi `tick` dengan `try/catch`; opsional jalankan satu tik awal tertunda (mis. 60 dtk setelah start) untuk pengguna yang memakai `npm start` langsung.

**L-6. Pin versi action memakai tag, bukan SHA; environment penuh diteruskan ke `llama-server`.** `.github/workflows/ci.yml` (semua `uses:`; VERSIONS.md sendiri mencatat ketersediaan tag belum diverifikasi). Saran: pin ke SHA commit. Terkait: `start-local.mjs:511` memberi `llama-server` `childEnv` penuh termasuk `AUTH_SECRET`/`IP_HMAC_SECRET`; berikan env minimal (`PATH`, `SystemRoot`, `HOME`/`USERPROFILE`, variabel GPU yang dibutuhkan).

**L-7. Beberapa AC dinyatakan lulus dengan bukti lemah.**
- P4-07 ("stdout/stderr tidak memuat nilai rahasia"): tes hanya memeriksa isi berkas, tidak menangkap keluaran `runStartLocal` (`start-local.test.ts:202-210`).
- P4-24 unit hanya memeriksa SIGTERM terkirim; "<= 10 dtk" dan "port bebas" hanya dibuktikan manual/CI (belum jalan).
- P4-36 itest kasus kedua menerima `['failed','created']` (`backup.itest.ts:166`), jadi tidak membuktikan apa pun di Windows tempat `chmod` tidak berlaku; kasus pertama (folder tak bisa dibuat) yang bermakna.
- P4-23 dan P4-05 hanya U (spawner/jaringan palsu); verifikasi M belum dilakukan.
- Saran: tambah assert bahwa `out`/`err` tidak memuat nilai rahasia; ganti assert longgar P4-36 dengan skenario yang andal lintas OS (mis. jalur cadangan = berkas biasa).

**L-8. Hal kecil lain.** (a) `ensureEnv` memvalidasi rahasia hanya dari berkas `.env` (`start-local.mjs:113-119`); rahasia yang hanya ada di environment proses ditolak walau valid, dan nilai placeholder >= 32 byte lolos. (b) `.env` mode `0o600` tidak berpengaruh di Windows; hak akses mengikuti ACL folder. (c) Race port: setelah `isPortFree` benar, bila `next start` gagal bind dan instance aplikasi lain menjawab `/api/health`, `probeApp` (`:560`) dievaluasi sebelum `serverDone` sehingga "Aplikasi siap" bisa dicetak untuk server yang salah; di Windows `exclusive:true` pada `127.0.0.1` tidak menjamin mendeteksi listener `0.0.0.0` (tidak diverifikasi). (d) Di Windows `child.kill('SIGTERM')` = TerminateProcess; anak dari `tsx` (yang memijahkan Node kedua) dan worker `next build` berpotensi yatim saat berhenti di luar Ctrl+C konsol (Ctrl+C konsol terbukti bersih oleh BE). (e) Pengecualian ESLint `security/*` untuk seluruh `src/server/cli/**` lebih luas dari yang dibutuhkan; batasi ke berkas yang memang membaca jalur dari argumen.

## 5. Tabel AC

Legenda: **Lulus** = bukti pada tingkat V yang tertulis ada dan benar; **Lulus (sebagian)** = U/I lulus tetapi tingkat C/M yang diwajibkan belum jalan; **Tidak terbukti** = belum ada bukti atau bukti lemah; **Gagal** = bertentangan dengan AC.

| AC | Status | Catatan |
|---|---|---|
| P4-01 | Lulus (sebagian) | U lulus; C (CI) belum jalan |
| P4-02 | Lulus | U |
| P4-03 | Lulus | U |
| P4-04 | Lulus | U |
| P4-05 | Lulus (sebagian) | U dengan `net.Server` nyata; M belum |
| P4-06 | Lulus | U |
| P4-07 | Lulus (sebagian) | Isi `.env` terbukti; "tidak mencetak rahasia" tidak diuji (L-7), kode tidak mencetak |
| P4-08 | Lulus | U (hash SHA-256) |
| P4-09 | Lulus | U |
| P4-10 | Lulus | I (proses terpisah) |
| P4-11 | Lulus | U |
| P4-12 | Lulus | I |
| P4-13 | Lulus (sebagian) | I lulus; C belum; cacat M-1 pada jalur `.env` kustom |
| P4-14 | Lulus (sebagian) | U dengan penghitung palsu; lihat M-1 |
| P4-15 | Lulus | U |
| P4-16 | Lulus | U |
| P4-17 | Lulus | U |
| P4-18 | Lulus | U |
| P4-19 | Lulus | U |
| P4-20 | Lulus (sebagian) | U (argumen `-H`) + manual lokal BE; C belum |
| P4-21 | Lulus (sebagian) | Manual lokal BE; C belum |
| P4-22 | Lulus | U |
| P4-23 | Lulus (sebagian) | U spawner palsu; M belum; risiko kutipan L-2 |
| P4-24 | Lulus (sebagian) | U lemah (L-7) + Ctrl+C Windows manual BE; C belum |
| P4-25 | Lulus | U |
| P4-26 | Lulus | U |
| P4-27 | Lulus | U |
| P4-28 | Lulus (sebagian) | Spawn sesuai spec, tetapi `LLAMACPP_ARGS` bisa menimpa host (M-4) |
| P4-29 | Lulus | U (3 alasan) |
| P4-30 | Tidak terbukti | Perlu M Windows bersih |
| P4-31 | Tidak terbukti | Perlu M (jalur berspasi) |
| P4-32a | Tidak terbukti | M belum; cabang `npm ci` salah kode keluar (L-1) |
| P4-32 | Lulus | I |
| P4-33 | Lulus | I |
| P4-34 | Lulus | I |
| P4-35 | Lulus | I |
| P4-36 | Lulus (sebagian) | Kasus folder tak bisa dibuat meyakinkan; kasus read-only longgar (L-7); sisi peluncur (U) lulus |
| P4-37 | Lulus | I |
| P4-38 | Lulus | U timer palsu; lihat L-5 |
| P4-39 | Lulus | I |
| P4-39a | Lulus (sebagian) | I lulus; "DB sedang dipakai" tidak andal pada server hidup (M-2) |
| P4-39b | Lulus | I |
| P4-40 | Lulus (sebagian) | Manual lokal; C belum |
| P4-41 | Lulus | G + I |
| P4-42 | Lulus | U |
| P4-43 | Lulus | I |
| P4-44 | Lulus | U |
| P4-45 | Lulus | U |
| P4-47 | Lulus (dengan catatan) | RTL; hydration (L-3) |
| P4-48 | Lulus | RTL |
| P4-49 | Lulus | RTL |
| P4-50 | **Gagal** | `.pgdata/` 1454 berkas masih ter-track (H-1); sisanya bersih |
| P4-51 | Lulus | Berkas wajib ada; integrasi 241 lulus |
| P4-52 | Lulus (dengan pengecualian) | Sisa hanya VERSIONS.md (4 baris, sah) dan `doctor.ts`/tes (diwajibkan P4-42); spec perlu menambahkan pengecualian ini |
| P4-53 | Lulus | `package.json` dan `phase4-ops.test.ts` |
| P4-54 | Tidak terbukti | `ci.yml` bersih dari docker/services/postgres secara statis; hijau di GitHub belum |
| P4-55 | Lulus (sebagian) | Build OK, loopback via `start:local`; `npm run start` langsung tidak dijalankan |
| P4-56 | Lulus | `git check-ignore` konfirmasi `.env`, `data/backups`, `.next` |
| P4-57 | Lulus (sebagian) / M-3 | typecheck, lint berkas ubahan, unit, integrasi hijau; Playwright tidak dijalankan; coverage 91,5% tidak jujur (29%); `eslint .` penuh masih punya temuan lama menurut dev log |
| P4-58 | Tidak terbukti | Perlu M mesin bersih |
| P4-59 | Lulus | I |
| P4-60 | Lulus | I (`ai-queue.itest.ts`) |

Ringkasan: 62 AC -> Lulus penuh 39; Lulus (sebagian)/dengan catatan 17; Tidak terbukti 5 (P4-30, 31, 32a, 54, 58); Gagal 1 (P4-50). Seluruh item C/M (CI hijau, Windows bersih) masih menunggu eksekusi.

## 6. Recommendations (ringkas, urut prioritas untuk Fullstack/BE/FE)
1. **Human**: putuskan penghapusan `.pgdata/` dari indeks (H-1) dan kebijakan coverage (M-3).
2. **BE**: perbaiki M-1 (`start-local.mjs:465`) dan tambah tes `.env` dengan `DATABASE_PATH`.
3. **BE**: perbaiki M-2 (`backup.ts:145-196`) dan M-4 (`start-local.mjs:171,180`); tambah tes.
4. **BE**: L-1 (`start-local.cmd:9-13`), L-2 (`start-local.mjs:225`), L-4, L-5, L-7.
5. **FE**: L-3 (`video-card.tsx:45`).
6. **DevOps**: pin action ke SHA (L-6); jalankan job `start-local-smoke` di runner nyata dan lampirkan bukti.
7. Setelah perbaikan M-1/M-2/M-4 dan keputusan H-1/M-3: dinyatakan aman untuk fase E2E/Tester; item M Windows (P4-30/31/32a/58) dijalankan oleh Manual Tester.
8. Spec perlu mencatat pengecualian P4-52 untuk `doctor.ts` dan tes (diwajibkan P4-42).

## Status serah-terima
Kode **belum** sepenuhnya siap untuk Tester: kembalikan ke BE (M-1, M-2, M-4) dan FE (L-3), dan minta keputusan human untuk H-1 dan M-3. Tidak ada CRITICAL; verdik: **PASS-WITH-FIXES**.
