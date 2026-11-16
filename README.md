# 🎓 IELTS Learning Platform

Platform pembelajaran Bahasa Inggris End-to-End (A1 hingga C1) dan akselerator IELTS (General Training & Academic, target Band 5.0–7.0) yang berjalan **100% lokal di satu perangkat** (*single-device app*). 

Dirancang bebas biaya langganan, tanpa API berbayar, dan tanpa ketergantungan cloud — lengkap dengan kurikulum terstruktur, simulasi ujian nyata, dan penilaian AI lokal opsional (Writing & Speaking).

---

## 🌟 Fitur Utama

### 1. 🗺️ Kurikulum & Skill Tree Berjenjang (4 Tier)
- **Struktur 4 Tier:** Bergerak dari dasar (A1/A2) hingga tingkat mahir IELTS Academic/General Training (B2/C1).
- **Strict Sequential Gatekeeping:** Sub-modul berikutnya hanya terbuka bila materi telah dipelajari dan Active Drill mencapai nilai $\ge 75\%$.
- **Fast-Track Skip Test:** Jalur pintas untuk pembelajar yang sudah kompeten; skor $\ge 85\%$ langsung membuka level berikutnya tanpa harus membuka materi satu per satu.
- **Kartu "Lanjutkan Belajar":** Otomatis mengingat posisi terakhir belajar (`active_sub_module`, tab materi, progres audio/video, hingga indeks soal drill).

### 2. 📖 Pemutar Multimodal ("Learn – Drill – Apply")
- **Learn:** Artikel format Markdown komprehensif, slide carousel ringkas, dan integrasi video penjelasan via YouTube IFrame.
- **Drill:** Latihan interaktif berwaktu (10 soal) dengan umpan balik instan berbahasa Indonesia.
- **Apply:** Mini-task aplikatif untuk menguji pemahaman kontekstual sebelum lanjut ke materi berikutnya.
- **Glodok Kosakata (Glossary):** Kamus referensi >1.000 kosakata tematik IELTS lengkap dengan definisi dan contoh kalimat.

### 3. 📝 Mesin Ujian & Split-Screen Reader
- **7 Tipe Soal Komprehensif:** 
  1. Multiple Choice Questions (Single / Multi)
  2. True / False / Not Given & Yes / No / Not Given
  3. Sentence / Note Completion (dengan batas kata ketat)
  4. Matching Headings / Features (Drag-and-Drop)
  5. Reorder & Error Recognition
  6. Writing Task 1 & 2 Editor (dengan live word counter & timer)
  7. Speaking Task Recorder (1 menit persiapan + 2 menit rekaman)
- **Split-Screen Reading:** Teks bacaan dengan fitur *highlighter* di sisi kiri, lembar soal di sisi kanan.
- **Exam Mode Listening:** Pemutar audio yang mengunci fungsi *rewind/forward* demi mensimulasikan kondisi tes IELTS sesungguhnya.

### 4. 🤖 Penilaian AI Lokal (Writing & Speaking)
- **100% Offline via llama.cpp:** Menilai esai dan surat berdasarkan 4 kriteria resmi IELTS (*Task Achievement/Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy*).
- **Speech-to-Text Lokal (Whisper):** Transkripsi audio rekaman suara berbicara secara lokal menggunakan `whisper.cpp` CPU sebelum dievaluasi oleh LLM.
- **Mode Tanpa AI (Self-Assessment):** Untuk PC/laptop dengan spesifikasi terbatas, tersedia rubrik penilaian mandiri serta tombol salin *prompt* untuk asisten suara eksternal.
- **Transparan & Indikatif:** Dilengkapi catatan perbaikan menuju Band 7.0 dan disclaimer bahwa hasil bersifat estimasi latihan.

### 5. 📊 Analitik & Retensi Belajar
- **Radar 6 Sumbu:** Memetakan kekuatan di aspek *Listening, Reading, Writing, Speaking, Grammar,* dan *Vocabulary*.
- **Spaced Repetition Review (FSRS):** Penjadwalan review soal-soal yang salah secara berkala agar materi tidak terlupakan.
- **Gamifikasi Ringan:** Mahkota *Silver* (75–89%) dan *Gold* (90–100%), akumulasi poin, serta pelacak konsistensi belajar.

---

## 🛠️ Tech Stack & Arsitektur

Platform ini dibangun dengan prinsip *Zero Cloud Dependency, Zero Subscription, Lightweight*:

- **Frontend & Fullstack Framework:** [Next.js 15](https://nextjs.org/) (App Router, React 19, Server Components & Server Actions)
- **Bahasa:** [TypeScript 5](https://www.typescriptlang.org/)
- **Styling & UI:** [Tailwind CSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) (Radix UI primitives), Lucide React
- **Database:** **SQLite lokal** (menggunakan modul bawaan `node:sqlite`, tanpa instalasi server database eksternal)
- **ORM & Migrasi:** [Drizzle ORM](https://orm.drizzle.team/)
- **Data & Backup:** Satu file database di `codes/data/ielts.db` dengan pencadangan otomatis harian (7 hari terakhir tersimpan di `codes/data/backups/`)
- **Mesin AI Lokal (Opsional):**
  - **LLM:** [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server`) dengan model `gpt-oss-20b-mxfp4` GGUF
  - **STT (Speech-to-Text):** [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (`whisper-server`, model `small.en`)
- **Testing:** [Vitest](https://vitest.dev/) (Unit & Integration) dan [Playwright](https://playwright.dev/) (End-to-End)

---

## 🚀 Panduan Setup & Menjalankan

Tersedia **dua jalur setup** sesuai kebutuhan dan spesifikasi perangkat Anda:

| Jalur | Cocok untuk | Yang aktif | Kebutuhan Minimum |
|---|---|---|---|
| **A. Platform Saja** | Belajar IELTS tanpa AI grader lokal | Semua fitur materi, latihan, split-screen, radar, & mode penilaian mandiri (*Self-Assessment*) | RAM $\ge$ 2 GB, Disk $\ge$ 1 GB |
| **B. Platform + AI** | Penilaian Writing & Speaking otomatis (lokal) | Semua fitur di atas + evaluasi otomatis via `llama.cpp` dan `whisper.cpp` | RAM $\ge$ 16 GB, Disk $\ge$ 15 GB, GPU disarankan |

> [!IMPORTANT]
> Platform ini **berjalan 100% lokal** — tidak butuh internet setelah setup awal (kecuali video YouTube embed) dan tidak ada biaya API berbayar.

---

### Prasyarat Sistem

| Kebutuhan | Versi Minimum | Cara Periksa |
|---|---|---|
| **Node.js** | 22.20.0 (disarankan 24 LTS) | `node -v` |
| **Git** | Versi terbaru | `git --version` |

> [!NOTE]
> Node.js dapat diunduh gratis dari [nodejs.org](https://nodejs.org/) — pilih versi **LTS**.  
> Pada Windows, pastikan opsi *"Add to PATH"* dicentang saat instalasi.

---

### Langkah 1 — Clone Repository

```bash
git clone https://github.com/FIrmansyxh/IELTS-Learning-Platform.git
cd IELTS-Learning-Platform/codes
```

Seluruh kode aplikasi berada di dalam folder `codes/`.  
**Semua perintah selanjutnya dijalankan dari dalam folder `codes/` ini.**

---

### 🅐 Jalur A — Platform Saja (Tanpa AI Grader)

Ini adalah jalur tercepat dan paling ringan. Tidak memerlukan GPU atau model LLM. Penilaian Writing & Speaking menggunakan mode **"Nilai Sendiri"** (self-assessment).

#### A1. Pasang Dependensi
```bash
npm ci
```
*(Direkomendasikan menggunakan `npm ci` agar versi dependensi terkunci persis sesuai `package-lock.json`)*.

#### A2. Jalankan Aplikasi

**Windows (Cara Termudah — Klik Ganda):**
- Buka folder `codes/` di File Explorer, lalu klik ganda file **`start-local.cmd`**.

**Terminal (Semua OS):**
```bash
npm run start:local
```

Skrip `start:local` akan otomatis:
1. Menyiapkan `.env` dari `.env.example` dengan secret acak (tidak menimpa `.env` yang sudah ada).
2. Menjalankan migrasi database SQLite (`data/ielts.db`) dan seed data konfigurasi.
3. Mengimpor modul pembelajaran bawaan.
4. Melakukan build aplikasi (hanya jika ada perubahan kode).
5. Membuka peramban ke **http://127.0.0.1:3005/pilih-profil**.

#### A3. Akses & Mulai Belajar
Buka peramban di **http://127.0.0.1:3005/pilih-profil**:
- Buat profil baru (tanpa password, maksimal 10 profil per perangkat).
- Mulai belajar dan latihan!

#### A4. Opsi Tambahan
```bash
npm run start:local -- --port 3010     # gunakan port lain (bawaan: 3005)
npm run start:local -- --no-open       # jangan buka browser otomatis
npm run start:local -- --rebuild       # paksa build ulang jika diperlukan
```
*Untuk menghentikan aplikasi: Tekan **Ctrl+C** di terminal.*

---

### 🅑 Jalur B — Platform + AI (Penilaian Otomatis Lokal)

Jalur ini mengaktifkan evaluasi otomatis esai (Writing) dan suara (Speaking) di perangkat lokal Anda.

> [!WARNING]
> Kebutuhan sistem Jalur B:
> - **RAM:** $\ge$ 16 GB (terukur: ~10–11 GB untuk model + ~2 GB untuk web)
> - **GPU:** VRAM $\ge$ 6 GB (sangat disarankan; Vulkan/CUDA)
> - **Penyimpanan:** ~15 GB (model GGUF 12,1 GB + model whisper 466 MB)

#### B1. Pasang Dependensi Platform
```bash
npm ci
```

#### B2. Pasang llama-server (llama.cpp)

**Windows (via winget):**
```powershell
winget install ggml.llamacpp
```
*Atau unduh binary manual dari [rilis llama.cpp](https://github.com/ggml-org/llama.cpp/releases).*

Verifikasi instalasi:
```powershell
llama-server --version
```

#### B3. Unduh Model AI Writing (`gpt-oss-20b MXFP4`)
Model terkalibrasi resmi yang digunakan adalah **gpt-oss-20b MXFP4** (~12,1 GB).

- **Opsi Otomatis (via llama-server):**
  ```powershell
  $env:LLAMA_CACHE = 'G:\llm-models'
  llama-server -hf ggml-org/gpt-oss-20b-GGUF:MXFP4 --host 127.0.0.1 --port 8080
  ```
- **Opsi Manual:** Unduh berkas `gpt-oss-20b-MXFP4.gguf` langsung dari [Hugging Face ggml-org](https://huggingface.co/ggml-org/gpt-oss-20b-GGUF).

#### B4. (Opsional) Pasang Whisper untuk Speaking
1. Unduh **whisper binary** (build CPU agar tidak berebut VRAM): [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases) (`whisper-bin-x64.zip`), ekstrak ke folder (misal: `%LOCALAPPDATA%\ielts-stt\bin`).
2. Unduh **model Whisper** (`ggml-small.en.bin`, 466 MB) dari [Hugging Face whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp).

#### B5. Konfigurasi File `.env`
Jalankan `npm run start:local -- --no-open` sekali lalu hentikan (Ctrl+C) agar `.env` terbuat. Buka file `.env` di text editor dan sesuaikan:

```env
# Aktifkan AI
AI_ENABLED=true
LLM_DRIVER=llamacpp
LLAMACPP_BASE_URL=http://127.0.0.1:8080

# Path model GGUF Anda (atau gunakan LLAMACPP_HF_REPO)
LLAMACPP_MODEL_PATH=G:\llm-models\gpt-oss-20b-MXFP4.gguf
LLAMACPP_ARGS=--device Vulkan0 -ngl 99 --n-cpu-moe 20 -c 6144
AI_JOB_TIMEOUT_SEC=300

# Speaking AI via Whisper (jika dipasang)
SPEAKING_AI_ENABLED=true
STT_DRIVER=whisper
STT_BASE_URL=http://127.0.0.1:8081
WHISPER_BIN=C:\Users\<username>\AppData\Local\ielts-stt\bin\Release\whisper-server.exe
WHISPER_MODEL_PATH=C:\Users\<username>\AppData\Local\ielts-stt\models\ggml-small.en.bin
```

#### B6. Jalankan & Verifikasi
```bash
npm run start:local
```
Periksa status integrasi melalui doctor CLI:
```bash
npm run doctor
```
Jika berhasil, terminal akan menampilkan centang hijau pada database, seed, band table, LLM, dan STT.

---

## 🔧 Perkakas CLI Bawaan

Aplikasi menyediakan berbagai perkakas CLI yang dapat dijalankan dari folder `codes/`:

```bash
# Diagnostik kesiapan sistem
npm run doctor

# Manajemen Profil Pengguna
npm run profile:list                              # daftar semua profil
npm run profile:create -- "Nama Pengguna"         # buat profil baru
npm run profile:rename -- "Lama" "Baru"           # ganti nama profil
npm run profile:delete -- "Nama" --yes            # hapus profil

# Kontrol Progres Belajar
npm run progress:unlock -- "Nama" 3.3.2           # buka kunci level
npm run progress:reset  -- "Nama" --all --yes     # reset progres

# Backup & Pemulihan Database
npm run db:backup                                 # backup manual ke data/backups/
npm run db:restore -- latest --yes                # pulihkan dari backup terbaru

# Validasi Konten & Bank Soal
npm run bank:validate    -- content/gt-bank
npm run content:validate -- content/gt-modules/3.3.3
npm run content:import:all
```

---

## 📁 Struktur Direktori Repository

```text
IELTS-Learning-Platform/
├── README.md                 # 📄 Dokumentasi utama & panduan setup lengkap
├── codes/                    # 💻 Kode aplikasi utama (Next.js fullstack)
│   ├── start-local.cmd       # Skrip sekali klik untuk pengguna Windows
│   ├── content/              # Bank soal, naskah audio, & modul pembelajaran
│   ├── data/                 # Data SQLite lokal & backup (di-gitignore)
│   │   ├── ielts.db          # Database utama aplikasi
│   │   ├── backups/          # Backup otomatis harian (7 hari terakhir)
│   │   └── logs/             # Log server AI (llama & whisper)
│   ├── src/                  # Komponen, halaman App Router, & server logic
│   ├── scripts/              # Perkakas CLI migrasi, backup, & AI helper
│   └── tests/                # Suite pengujian Unit, Integration, & Playwright E2E
├── specifications/           # 📐 Spesifikasi teknis (SPEC-000 hingga SPEC-027)
├── state/                    # 🧠 Knowledge base arsitektur, data model, & context
└── agent/                    # 🤖 Definisi alur kerja AI agent VasVibe
```

---

## ❓ Troubleshooting & Solusi

- **Port 3005 sudah digunakan program lain:**  
  Jalankan dengan flag port berbeda: `npm run start:local -- --port 3010`.
- **Aplikasi sudah berjalan di latar belakang:**  
  Skrip `start:local` akan mendeteksi instance yang berjalan dan otomatis membuka peramban tanpa me-restart server.
- **Font Google tidak termuat dengan baik:**  
  Pastikan koneksi internet aktif saat menjalankan build pertama kali agar font *Inter* dan *Plus Jakarta Sans* dapat diunduh.
- **Evaluasi AI Timeout:**  
  Model `gpt-oss-20b` membutuhkan waktu ~70–250 detik pada evaluasi pertama. Pastikan nilai `AI_JOB_TIMEOUT_SEC=300` atau lebih tinggi di `.env`.

---

## 🛡️ Keamanan & Privasi Data

- **Loopback Exclusive:** Server hanya melayani host `127.0.0.1` / `localhost`.
- **Privasi 100%:** Rekaman suara, riwayat teks esai, dan progres belajar tersimpan di komputer Anda tanpa diunggah ke pihak ketiga mana pun.
- **Bukan Pengganti Tes Resmi:** Hasil estimasi skor band AI ditujukan sebagai panduan latihan dan refleksi belajar mandiri, bukan pengganti sertifikasi resmi IDP/British Council.

---

## 🤝 Pengembangan & Alur Kerja

Platform ini dikembangkan menggunakan metodologi **VasVibe AI-Assisted Workflow** (berbasis 4-fase: Perencanaan $\to$ Pengerjaan $\to$ Testing $\to$ Hardening).  
Untuk informasi mengenai bagaimana agen AI bekerja di repo ini, baca panduan [QUICK-START.md](./QUICK-START.md) dan [AGENTS.md](./AGENTS.md).
