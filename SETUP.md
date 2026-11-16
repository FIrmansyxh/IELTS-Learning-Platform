# 🚀 Setup Guide — IELTS Learning Platform

Panduan ini ditujukan untuk siapa saja yang ingin mencoba platform ini dari GitHub.  
Tersedia **dua jalur setup**:

| Jalur | Cocok untuk | Yang aktif |
|---|---|---|
| **A. Platform saja** | Belajar IELTS tanpa AI grader | Semua fitur kecuali penilaian Writing & Speaking otomatis |
| **B. Platform + AI** | Penilaian Writing & Speaking otomatis (lokal) | Semua fitur termasuk AI grader llama.cpp + Whisper |

> [!IMPORTANT]
> Platform ini **berjalan 100% lokal** — tidak butuh internet setelah setup awal (kecuali video YouTube embed) dan tidak ada biaya API berbayar.

---

## Prasyarat

| Kebutuhan | Versi minimum | Cara cek |
|---|---|---|
| **Node.js** | 22.20.0 (disarankan 24) | `node -v` |
| **Git** | — | `git --version` |
| **RAM bebas** | ≥ 2 GB (platform saja) · ≥ 16 GB (+ AI) | — |
| **Disk** | ≥ 1 GB (platform saja) · ≥ 15 GB (+ AI, termasuk model) | — |
| **GPU** *(opsional, hanya AI)* | VRAM ≥ 6 GB (Vulkan/CUDA) | — |

> [!NOTE]
> Node.js bisa diunduh dari https://nodejs.org — pilih versi **LTS** (22.x atau 24.x).  
> Windows: pastikan opsi "Add to PATH" dicentang saat instalasi.

---

## Langkah 1 — Clone Repo

```bash
git clone https://github.com/FIrmansyxh/IELTS-Learning-Platform.git
cd IELTS-Learning-Platform/codes
```

Seluruh kode aplikasi ada di dalam folder `codes/`.  
**Semua perintah selanjutnya dijalankan dari dalam folder `codes/` ini.**

---

## 🅐 Jalur A — Platform Saja (Tanpa AI)

Ini jalur tercepat. Tidak memerlukan GPU atau model LLM.  
Penilaian Writing & Speaking akan menggunakan mode **"Nilai Sendiri"** (self-assessment).

### A1. Install dependensi

```bash
npm ci
```

> `npm ci` (clean install) direkomendasikan daripada `npm install` agar versi dependensi persis sesuai `package-lock.json`.

### A2. Jalankan aplikasi

**Windows — cara termudah (klik ganda):**

Kembali ke folder `codes/`, lalu klik ganda file **`start-local.cmd`**.  
Skrip ini otomatis menjalankan `npm ci` bila `node_modules` belum ada, kemudian menjalankan aplikasi.

**Atau via terminal:**

```bash
npm run start:local
```

Skrip `start:local` akan otomatis:
1. Membuat file `.env` dari `.env.example` (dengan secret acak) — **tidak pernah menimpa `.env` yang sudah ada**
2. Membuat cadangan harian database (jika sudah ada data)
3. Menjalankan migrasi & seed database
4. Mengimpor konten bawaan (`content/gt-modules/*`)
5. Build aplikasi (hanya jika sumber berubah)
6. Membuka browser ke `http://127.0.0.1:3005/pilih-profil`

> [!TIP]
> Build pertama membutuhkan koneksi internet untuk mengunduh font Google (Inter & Plus Jakarta Sans).  
> Setelah itu, platform berjalan sepenuhnya offline.

### A3. Akses aplikasi

Buka browser dan kunjungi: **http://127.0.0.1:3005/pilih-profil**

- Buat profil baru (tanpa login/password, maksimal 10 profil per mesin)
- Mulai belajar!

### A4. Opsi tambahan `start:local`

```bash
npm run start:local -- --port 3010     # gunakan port lain (default: 3005)
npm run start:local -- --no-open       # jangan buka browser otomatis
npm run start:local -- --rebuild       # paksa build ulang (jika ada masalah cache)
```

### A5. Hentikan aplikasi

Tekan **Ctrl+C** di terminal.  
Semua proses (web server, job queue) akan dihentikan bersama.

---

## 🅑 Jalur B — Platform + AI (Penilaian Otomatis)

Jalur ini mengaktifkan penilaian **Writing** dan **Speaking** secara otomatis menggunakan model LLM lokal.

> [!WARNING]
> Kebutuhan hardware untuk jalur B cukup tinggi:
> - **RAM:** ≥ 16 GB (terukur: ~10–11 GB untuk model + ~2 GB untuk platform)
> - **GPU:** VRAM ≥ 6 GB (opsional tapi sangat disarankan; Vulkan/CUDA)
> - **Disk:** ~15 GB (model GGUF 12,1 GB + whisper 466 MB + aplikasi)
> 
> Skor AI bersifat **indikatif** (estimasi latihan), bukan setara penguji IELTS resmi.

### B1. Install dependensi platform

Sama seperti Jalur A:

```bash
npm ci
```

### B2. Install llama-server (llama.cpp)

**Windows (via winget):**

```powershell
winget install ggml.llamacpp
```

**Atau** unduh binary dari https://github.com/ggml-org/llama.cpp/releases  
(pilih `llama-*-bin-win-vulkan-x64.zip` untuk GPU Vulkan atau `...avx2...` untuk CPU-only).

Verifikasi instalasi:

```powershell
llama-server --version
```

### B3. Unduh model AI Writing

Model yang digunakan: **gpt-oss-20b MXFP4** (ukuran file: ~12,1 GB)

**Cara 1 — Auto-download via llama-server (paling mudah):**

```powershell
# Atur folder cache model (opsional, hindari unduh ulang)
$env:LLAMA_CACHE = 'G:\llm-models'

# llama-server akan otomatis mengunduh model saat pertama kali dijalankan
llama-server -hf ggml-org/gpt-oss-20b-GGUF:MXFP4 --host 127.0.0.1 --port 8080
```

**Cara 2 — Download manual dari Hugging Face:**

Kunjungi: https://huggingface.co/ggml-org/gpt-oss-20b-GGUF  
Unduh file `gpt-oss-20b-MXFP4.gguf` (12,1 GB), lalu simpan ke folder pilihan Anda.

### B4. (Opsional) Setup Whisper untuk penilaian Speaking

> [!NOTE]
> Jika Anda melewati langkah ini, penilaian Speaking akan menggunakan prompt manual  
> (copy ke Claude/ChatGPT/Gemini), yang tetap berfungsi tanpa Whisper.

1. **Unduh Whisper binary** (build CPU — tidak berebut VRAM dengan llama-server):  
   https://github.com/ggml-org/whisper.cpp/releases  
   Pilih `whisper-bin-x64.zip`, ekstrak ke folder pilihan (misalnya `%LOCALAPPDATA%\ielts-stt\bin`)

2. **Unduh model Whisper** (`ggml-small.en.bin`, 466 MB):  
   https://huggingface.co/ggerganov/whisper.cpp  
   Simpan ke folder pilihan (misalnya `%LOCALAPPDATA%\ielts-stt\models`)

### B5. Konfigurasi `.env`

Jalankan `start:local` sekali dulu untuk membuat `.env` otomatis:

```bash
npm run start:local -- --no-open
```

Lalu tekan **Ctrl+C**, dan edit file `.env` yang baru dibuat:

```bash
# Buka .env di text editor (Windows)
notepad .env
```

**Tambahkan / ubah baris-baris berikut:**

```env
# --- Aktifkan AI ---
AI_ENABLED=true
LLM_DRIVER=llamacpp
LLAMACPP_BASE_URL=http://127.0.0.1:8080

# Pilih SALAH SATU cara menentukan model:
# Opsi 1: Path file lokal (jika sudah download manual)
LLAMACPP_MODEL_PATH=G:\llm-models\gpt-oss-20b-MXFP4.gguf

# Opsi 2: Auto-download dari Hugging Face (jika belum download)
# LLAMACPP_HF_REPO=ggml-org/gpt-oss-20b-GGUF:MXFP4

# Argumen llama-server (sesuaikan dengan hardware Anda):
# - --device Vulkan0  → GPU Vulkan (NVIDIA/AMD)
# - -ngl 99           → load semua layer ke GPU
# - --n-cpu-moe 20    → layer MoE di CPU (hemat VRAM)
# - -c 6144           → context window
LLAMACPP_ARGS=--device Vulkan0 -ngl 99 --n-cpu-moe 20 -c 6144

# Timeout penilaian (naikkan jika sering timeout; default 300 detik)
AI_JOB_TIMEOUT_SEC=300

# --- Speaking AI (jika sudah setup Whisper) ---
SPEAKING_AI_ENABLED=true
STT_DRIVER=whisper
STT_BASE_URL=http://127.0.0.1:8081
WHISPER_BIN=C:\Users\<anda>\AppData\Local\ielts-stt\bin\Release\whisper-server.exe
WHISPER_MODEL_PATH=C:\Users\<anda>\AppData\Local\ielts-stt\models\ggml-small.en.bin
# WHISPER_ARGS=-t 8    # jumlah thread CPU (opsional)
```

> [!TIP]
> Ganti `<anda>` dengan username Windows Anda, dan `G:\llm-models` dengan path folder model Anda yang sebenarnya.

**Untuk hardware CPU-only** (tanpa GPU), gunakan argumen ini:

```env
LLAMACPP_ARGS=--n-gpu-layers 0
```

### B6. Jalankan aplikasi dengan AI

```bash
npm run start:local
```

Skrip `start:local` akan otomatis:
- Menyalakan `llama-server` (jika `LLAMACPP_BIN` atau model dikonfigurasi)
- Menyalakan `whisper-server` (jika `WHISPER_BIN` dikonfigurasi)
- Menjalankan platform di http://127.0.0.1:3005

Log AI server tersimpan di:
- `data/logs/llama-server.log`
- `data/logs/whisper-server.log`

### B7. Verifikasi AI aktif

```bash
npm run doctor
```

Output yang diharapkan (semua ✅):

```
✅ Database        — ielts.db ditemukan, migrasi terkini
✅ Seed            — data konfigurasi lengkap
✅ Band table      — tabel konversi aktif
✅ LLM (llamacpp)  — llama-server merespons di 127.0.0.1:8080
✅ Penilai Speaking (STT) — whisper-server merespons di 127.0.0.1:8081
```

### B8. Ekspektasi performa AI

| Metrik | Nilai |
|---|---|
| Hardware referensi | RTX 3060 6 GB + RAM 32 GB + i9-11900H |
| Kecepatan generasi | ~7,6 token/detik |
| Waktu penilaian Writing | ~70 detik (median); pertama kali setelah server menyala bisa >250 detik |
| Waktu transkripsi Speaking (2 mnt) | ~40 detik |
| Akurasi model (benchmark) | 18/24 evaluasi dalam rentang acuan; MAE band 0,66 |

> [!CAUTION]
> Skor AI **bukan** penilaian IELTS resmi. Gunakan sebagai estimasi latihan saja.  
> Skala cenderung terkompresi — surat lemah dinilai lebih tinggi, tulisan sangat bagus lebih rendah dari penguji nyata.

---

## Perintah Berguna

### Pemeliharaan database

```bash
npm run doctor                                    # cek kesiapan sistem
npm run db:backup                                 # buat backup manual
npm run db:restore -- ielts-2026-11-07.db --yes  # restore dari backup
npm run db:restore -- latest --yes               # restore backup terbaru
```

### Manajemen profil

```bash
npm run profile:list                              # daftar semua profil
npm run profile:create -- "Nama Profil"          # buat profil baru
npm run profile:rename -- "Lama" "Baru"          # ganti nama profil
npm run profile:delete -- "Nama" --yes           # hapus profil
```

### Manajemen progres

```bash
npm run progress:unlock -- "Profil" 3.3.2        # buka kunci Tier/Modul/Sub-modul
npm run progress:reset  -- "Profil" --all --yes  # reset semua progres
```

### Mode development (dengan hot reload)

```bash
npm run dev
# Buka: http://127.0.0.1:3005
```

### Menjalankan tes

```bash
npm test                    # unit tests
npm run test:integration    # integration tests (pakai SQLite sementara)
npm run test:e2e            # E2E Playwright (jalankan dev terlebih dahulu)
npm run coverage            # coverage report (unit + integration, threshold 70%)
```

---

## Struktur Data

Data tersimpan di `codes/data/` (tidak masuk ke Git):

```
codes/data/
├── ielts.db              # database SQLite utama
├── backups/              # backup otomatis harian (7 hari terakhir)
│   └── ielts-YYYY-MM-DD.db
├── assets/               # file media yang diupload
└── logs/                 # log AI server
    ├── llama-server.log
    └── whisper-server.log
```

> [!NOTE]
> Backup otomatis dibuat setiap kali `start:local` dijalankan dan setiap 6 jam saat server berjalan.  
> Maksimal 7 hari terakhir yang disimpan.

---

## Troubleshooting

### Port 3005 sudah dipakai

```bash
npm run start:local -- --port 3010
```

### Aplikasi sudah berjalan (browser tidak terbuka)

Jika `start:local` mendeteksi aplikasi sudah berjalan, ia hanya akan membuka browser.  
Ini normal — tidak ada yang perlu dilakukan.

### Build gagal / cache bermasalah

```bash
npm run start:local -- --rebuild
```

### Error database / migrasi gagal

```bash
npm run doctor       # identifikasi masalah
npm run db:migrate   # jalankan ulang migrasi manual
npm run db:seed      # jalankan ulang seed manual
```

### llama-server tidak merespons (AI timeout)

1. Periksa `data/logs/llama-server.log` untuk error
2. Pastikan `LLAMACPP_BASE_URL=http://127.0.0.1:8080` di `.env`
3. Naikkan `AI_JOB_TIMEOUT_SEC=300` (atau lebih tinggi)
4. Jalankan `npm run doctor` untuk status terkini

### Whisper gagal transkripsi

1. Pastikan path `WHISPER_BIN` dan `WHISPER_MODEL_PATH` benar di `.env`
2. Periksa `data/logs/whisper-server.log`
3. Nonaktifkan Speaking AI sementara: `SPEAKING_AI_ENABLED=false`

### Font tidak termuat (halaman tampil tanpa font yang benar)

Build pertama memerlukan internet untuk mengunduh font Google.  
Pastikan ada koneksi internet saat pertama kali menjalankan `start:local`.

---

## Variabel Lingkungan Penting

File `.env` dibuat otomatis dari `.env.example`. Variabel yang paling sering disesuaikan:

| Variabel | Default | Keterangan |
|---|---|---|
| `AUTH_URL` | `http://127.0.0.1:3005` | URL aplikasi |
| `ALLOWED_HOSTS` | `localhost:3005,127.0.0.1:3005` | Host yang diizinkan |
| `AI_ENABLED` | `false` | Aktifkan AI grader |
| `LLM_DRIVER` | `llamacpp` | Driver LLM: `llamacpp` / `ollama` / `mock` |
| `LLAMACPP_BASE_URL` | `http://127.0.0.1:8080` | URL llama-server |
| `LLAMACPP_MODEL_PATH` | *(kosong)* | Path file model GGUF |
| `LLAMACPP_HF_REPO` | *(kosong)* | Repo Hugging Face untuk auto-download model |
| `LLAMACPP_ARGS` | *(kosong)* | Argumen tambahan llama-server |
| `SPEAKING_AI_ENABLED` | `true` | Aktifkan penilai Speaking via Whisper |
| `STT_DRIVER` | `whisper` | Driver STT: `whisper` / `mock` |
| `WHISPER_BIN` | *(kosong)* | Path ke `whisper-server.exe` |
| `WHISPER_MODEL_PATH` | *(kosong)* | Path ke model Whisper `.bin` |
| `AI_JOB_TIMEOUT_SEC` | `300` | Timeout penilaian AI (detik) |
| `EXAM_MODULE` | `GENERAL_TRAINING` | Jenis ujian: `GENERAL_TRAINING` / `ACADEMIC` |
| `AI_DAILY_LIMIT_PER_USER` | `10` | Batas penilaian AI per profil per hari |

> [!CAUTION]
> Server **hanya melayani loopback** (`127.0.0.1`). Jangan membuka port ke jaringan publik.  
> Jika ingin berbagi ke jaringan lokal, gunakan tunnel yang aman (di luar scope setup ini).

---

## Ringkasan Cepat

```
# Jalur A — Platform saja (5 menit)
git clone https://github.com/FIrmansyxh/IELTS-Learning-Platform.git
cd IELTS-Learning-Platform/codes
npm ci
npm run start:local
# → Buka http://127.0.0.1:3005/pilih-profil

# Jalur B — Tambahkan AI (setelah Jalur A berjalan)
# 1. Install llama-server: winget install ggml.llamacpp
# 2. Edit .env: AI_ENABLED=true, LLAMACPP_MODEL_PATH=<path-model.gguf>
# 3. npm run start:local  (llama-server dijalankan otomatis)
# 4. npm run doctor       (verifikasi semua komponen aktif)
```
