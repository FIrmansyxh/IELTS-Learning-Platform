# ielts-learning-platform (codes/)

Aplikasi belajar IELTS General Training yang berjalan 100% di satu perangkat (ADR-005): Next.js 15 (App Router) + TypeScript + Tailwind 4 + shadcn/ui, Drizzle + **SQLite** (`node:sqlite`, tanpa server database), antrean job dalam proses, Vitest, Playwright. Versi terkunci: lihat `VERSIONS.md`. Perlu Node.js >= 22.20 (disarankan 24).

## Menjalankan
```bash
npm ci
cp .env.example .env                 # isi AUTH_SECRET dan IP_HMAC_SECRET (openssl rand -base64 32)
npm run db:migrate && npm run db:seed
npm run content:import -- content/gt-modules/3.3.3 --publish   # contoh modul ajar
npm run dev                          # http://127.0.0.1:3005 -> pilih/buat profil di /pilih-profil (tanpa login)
npm run doctor                       # periksa kesiapan
```
Data tersimpan di satu berkas SQLite: `data/ielts.db` (ubah lewat `DATABASE_PATH`; di-gitignore). Cadangkan dengan menyalin berkas itu saat aplikasi mati. Penilaian Writing otomatis (opsional) memakai `llama-server` lokal: set `AI_ENABLED=true`; antrean berjalan di dalam proses web, tidak perlu worker terpisah.

Jangan menjalankan `next build` dengan `NODE_ENV=development` di environment (mis. setelah `source .env`); biarkan Next yang memuat `.env`.

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
```
Tanpa `ffprobe`, durasi audio hanya terbaca untuk WAV (peringatan `ffprobe_unavailable`).

### Jenis ujian dan modul General Training (ADR-004)
`EXAM_MODULE=GENERAL_TRAINING` (default) menyembunyikan sub-modul bertag `ACADEMIC` dari learner; `ACADEMIC` membaliknya. Konten General Training:
```bash
npm run bank:validate -- content/gt-bank                 # bank soal (Writing/Speaking/Reading/Grammar)
npm run content:validate -- content/gt-modules/3.3.3     # modul ajar surat
npm run content:import -- content/gt-modules/3.3.3 --publish
```

## Perintah utama
`npm run lint | typecheck | test | test:integration | test:e2e | build | bench:ai`

Tes integrasi memakai berkas SQLite sementara (otomatis, tanpa Docker). E2E: jalankan `npm run dev`, lalu `E2E_SKIP_WEBSERVER=1 E2E_BASE_URL=http://127.0.0.1:3005 npx playwright test` (set `E2E_CHROME_PATH` bila browser Playwright belum terpasang).

`npm run bench:ai -- --models qwen2.5:3b-instruct,qwen2.5:7b-instruct` (khusus driver Ollama; harus berjalan di 127.0.0.1:11434).

### LLM lokal (ADR-004): llama.cpp
Driver default `LLM_DRIVER=llamacpp` memakai `llama-server` (winget: `winget install ggml.llamacpp`). Contoh untuk RTX 3060 6 GB:
```powershell
$env:LLAMA_CACHE = 'G:\llm-models'   # lokasi model GGUF
llama-server -hf bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M --device Vulkan0 -ngl 99 -c 4096 --parallel 1 --host 127.0.0.1 --port 8080
```
Lalu di `.env`: `AI_ENABLED=true`, `LLAMACPP_BASE_URL=http://127.0.0.1:8080`, `SPEAKING_AI_ENABLED=false`. LLM hanya menilai Writing; Speaking dilatih lewat prompt AI suara pihak ketiga (tombol "Salin prompt" pada soal Speaking).
