# ielts-learning-platform (codes/)

Aplikasi belajar IELTS General Training yang berjalan 100% di satu perangkat (ADR-005): Next.js 15 (App Router) + TypeScript + Tailwind 4 + shadcn/ui, Drizzle + **SQLite** (`node:sqlite`, tanpa server database), antrean job dalam proses, Vitest, Playwright. Versi terkunci: lihat `VERSIONS.md`. Perlu Node.js >= 22.20 (disarankan 24).

## Menjalankan
Satu perintah, dari folder `codes/`, setelah `npm ci` (Windows: klik ganda `start-local.cmd`, yang menjalankan `npm ci` bila `node_modules` belum ada):
```bash
npm ci
npm run start:local                       # http://127.0.0.1:3005/pilih-profil
npm run start:local -- --port 3010        # port lain (bawaan 3005; 1024-65535)
npm run start:local -- --no-open          # jangan buka browser
npm run start:local -- --rebuild          # paksa build ulang
```
Skrip menyiapkan semuanya berurutan: `.env` (dibuat dari `.env.example` dengan rahasia acak bila belum ada; tidak pernah ditimpa), cadangan harian, migrasi dan seed, impor konten bawaan `content/gt-modules/*` (hanya bila belum ada konten terbit), build (hanya bila sumber berubah), lalu `next start` di `127.0.0.1` dan membuka browser. Ctrl+C menghentikan semuanya. Bila port dipakai program lain, skrip menyarankan `--port`; bila aplikasi ini sudah berjalan, skrip hanya membuka browser. Build pertama butuh internet (mengunduh font Google). Pemeriksaan kesiapan: `npm run doctor`.

Pengembangan: `npm run dev` (hot reload, `http://127.0.0.1:3005`). Jangan menjalankan `next build` dengan `NODE_ENV=development` di environment; biarkan Next yang memuat `.env`.

### Data, cadangan, dan pemulihan
Data tersimpan di satu berkas SQLite: `data/ielts.db` (ubah lewat `DATABASE_PATH`; di-gitignore). Cadangan otomatis harian (7 hari terakhir) di `data/backups/ielts-YYYY-MM-DD.db`: dibuat saat `start:local`, tiap 6 jam saat server produksi berjalan, atau manual:
```bash
npm run db:backup                                    # buat cadangan hari ini (maks. satu per tanggal)
# hentikan aplikasi (Ctrl+C), lalu:
npm run db:restore -- ielts-2026-11-07.db --yes     # atau: -- latest --yes
```
Database yang ditimpa diamankan dulu sebagai `data/backups/ielts-sebelum-pulih-<waktu>.db`.

### AI opsional (penilai Writing)
Tanpa pengaturan apa pun, tulisan masuk ke "Nilai Sendiri". Untuk penilaian otomatis, isi `.env`: `AI_ENABLED=true`, `LLM_DRIVER=llamacpp`, lalu salah satu `LLAMACPP_MODEL_PATH=<berkas.gguf>` atau `LLAMACPP_HF_REPO=<repo:kuantisasi>` (opsional `LLAMACPP_BIN`, `LLAMACPP_ARGS`). `start:local` menyalakan `llama-server` sendiri (hanya bila `LLAMACPP_BASE_URL` loopback; log di `data/logs/llama-server.log`) atau memakai ulang yang sudah berjalan. Antrean job berjalan di dalam proses web; tidak ada worker terpisah.

### Profil lokal dan perintah pemeliharaan (SPEC-025)
Tanpa login atau daftar: layar `/pilih-profil` memilih atau membuat profil (maks. 10, tanpa password). Server hanya melayani loopback (`Host` asing ditolak 403); jangan membuka port ke jaringan. Panel admin sudah dihapus; gunakan perintah berikut (`<profil>` = nama atau id):
```bash
npm run doctor                                                       # periksa kesiapan (DB, migrasi, seed, band, LLM, internet)
npm run profile:list | profile:create -- "Nama" | profile:rename -- <profil> "Nama baru" | profile:delete -- <profil> --yes
npm run progress:unlock -- <profil> 3.3.2                            # buka kunci Tier (3), Modul (3.3), atau Sub-modul (3.3.3)
npm run progress:reset  -- <profil> --sub 3.3.3 --yes                # atau --all
npm run points:show | points:adjust -- <profil> 50 --reason "bonus"  # selisih negatif juga boleh: -20
npm run settings:list | settings:get -- <kunci> | settings:set -- <kunci> <nilai>
npm run band:list | band:activate -- <id-tabel> | band:import -- tabel.json [--activate]
npm run cli -- --help                                                # bantuan lengkap
```
Konten ditambahkan lewat berkas di repo:
```bash
npm run content:validate -- content/golden-sample                 # exit 0 valid, 1 ada galat
npm run content:import   -- content/golden-sample [--dry-run] [--publish]   # exit 0/1/2 (publikasi terhalang)/3
npm run bank:validate    -- content/gt-bank                       # bank soal General Training
npm run content:import:all                                        # semua konten bawaan berurutan: gt-listening (aset audio) -> gt-bank -> gt-modules/3.3.3
```
Tanpa `ffprobe`, durasi audio hanya terbaca untuk WAV (peringatan `ffprobe_unavailable`).

Audio Listening dibuat lokal dengan Kokoro TTS + ffmpeg (pemasangan: `scripts/tts/README.md`):
```bash
npm run listening:check -- --script content/gt-listening/scripts/GT-L-S2-001.md
npm run listening:build -- --script content/gt-listening/scripts/GT-L-S2-001.md   # tulis mp3 + assets.manifest.json
```
Bagian Listening baru terbit hanya bila `content/gt-listening/reviews/<part_code>.review.json` disetujui manusia (`approved: true`, `clarity >= 4`, `speed >= 3`, `answer_leak: false`) dan hash naskah/audio cocok. Bank berisi 2 set ujian penuh: Listening S1-S4 x2, Reading simulasi x3 (C-30).

### Jenis ujian dan modul General Training (ADR-004)
`EXAM_MODULE=GENERAL_TRAINING` (default) menyembunyikan sub-modul bertag `ACADEMIC` dari learner; `ACADEMIC` membaliknya. Konten General Training:
```bash
npm run bank:validate -- content/gt-bank                 # bank soal (Writing/Speaking/Reading/Grammar)
npm run content:validate -- content/gt-modules/3.3.3     # modul ajar surat
npm run content:import -- content/gt-modules/3.3.3 --publish
```

## Perintah utama
`npm run lint | typecheck | test | test:integration | test:e2e | build | bench:ai`

Tes integrasi memakai berkas SQLite sementara (otomatis). Coverage: `npm run coverage` menjalankan suite unit DAN integrasi dalam satu run (`vitest.coverage.config.ts`, vitest projects, provider v8) dan mengukur `src/server/**` tanpa `coverage.exclude`; gagal bila coverage baris gabungan < 70%. Jangan memakai `vitest run --coverage` biasa untuk menilai server: modul terikat database hanya dijalankan oleh suite integrasi sehingga angkanya menyesatkan (~32%). `npm test` dan `npm run test:integration` tidak berubah. Laporan di `coverage/` (`coverage-summary.json`, `lcov.info`). E2E: jalankan `npm run dev`, lalu `E2E_SKIP_WEBSERVER=1 E2E_BASE_URL=http://127.0.0.1:3005 npx playwright test` (set `E2E_CHROME_PATH` bila browser Playwright belum terpasang).

`npm run bench:ai -- --models qwen2.5:3b-instruct,qwen2.5:7b-instruct` (khusus driver Ollama; harus berjalan di 127.0.0.1:11434).

### LLM lokal (ADR-004): llama.cpp
Driver default `LLM_DRIVER=llamacpp` memakai `llama-server` (winget: `winget install ggml.llamacpp`). Model penilai Writing: **gpt-oss-20b MXFP4** (ADR-004, addendum 2026-11-11). Contoh untuk RTX 3060 6 GB + RAM 32 GB:
```powershell
$env:LLAMA_CACHE = 'G:\llm-models'   # lokasi model GGUF (berkas 12,1 GB)
llama-server -hf ggml-org/gpt-oss-20b-GGUF:MXFP4 --device Vulkan0 -ngl 99 --n-cpu-moe 20 -c 6144 --parallel 1 --host 127.0.0.1 --port 8080
```
Kebutuhan terukur: sekitar 3,4 GB VRAM dan 10-11 GB RAM; generasi sekitar 7,6 token/dtk, satu evaluasi sekitar 70 dtk (median benchmark), evaluasi pertama setelah server menyala bisa lebih dari 250 dtk. Naikkan `AI_JOB_TIMEOUT_SEC` ke 300 (lihat `.env.example`). Skor LLM lokal bersifat **indikatif**: pada benchmark kasus baru, 18 dari 24 evaluasi dalam rentang acuan (MAE band 0,66), skala cenderung terkompresi (surat lemah dinilai terlalu tinggi, tulisan sangat bagus terlalu rendah). Jangan dianggap setara penguji IELTS.

Lalu di `.env`: `AI_ENABLED=true`, `LLAMACPP_BASE_URL=http://127.0.0.1:8080`, `SPEAKING_AI_ENABLED=false`. LLM hanya menilai Writing; Speaking dilatih lewat prompt AI suara pihak ketiga (tombol "Salin prompt" pada soal Speaking).

Benchmark model: `npx tsx scripts/bench-gt-writing.mts --out <berkas.json> --reps 3 --hint "text,calib" [--cases heldout] --models "label=repo:quant|flag server,..."` (set `LLAMA_CACHE`). `--cases heldout` memakai kasus yang tidak dipakai menyetel prompt (`scripts/bench/gt-cases-heldout.mts`).
