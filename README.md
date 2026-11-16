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

## 🚀 Memulai (Quick Start)

Tersedia **2 opsi setup** sesuai spesifikasi perangkat Anda:
- **Jalur A — Platform Saja (RAM $\ge$ 2 GB):** Berjalan sangat ringan tanpa model LLM lokal. Penilaian Writing/Speaking menggunakan mode *Self-Assessment*.
- **Jalur B — Platform + AI (RAM $\ge$ 16 GB, GPU disarankan):** Mengaktifkan penilaian esai dan suara otomatis menggunakan `llama.cpp` + `whisper.cpp`.

👉 **[BACA PANDUAN LENGKAP: SETUP.md](./SETUP.md)** untuk petunjuk instalasi langkah demi langkah.

### Ringkasan Menjalankan Jalur A (Paling Cepat):

1. **Clone repository:**
   ```bash
   git clone https://github.com/FIrmansyxh/IELTS-Learning-Platform.git
   cd IELTS-Learning-Platform/codes
   ```

2. **Pasang dependensi:**
   ```bash
   npm ci
   ```

3. **Jalankan aplikasi:**
   - **Windows:** Cukup klik ganda file **`start-local.cmd`** di dalam folder `codes/`.
   - **Terminal (Semua OS):**
     ```bash
     npm run start:local
     ```

Aplikasi otomatis melakukan migrasi database, menyemai (*seed*) modul belajar, dan membuka peramban di **http://127.0.0.1:3005/pilih-profil**.

---

## 📁 Struktur Direktori Repository

```text
IELTS-Learning-Platform/
├── SETUP.md                  # 📘 Panduan lengkap setup (Platform Saja vs Platform + AI)
├── README.md                 # 📄 Dokumentasi proyek ini
├── codes/                    # 💻 Kode aplikasi utama (Next.js fullstack)
│   ├── start-local.cmd       # Skrip sekali klik untuk pengguna Windows
│   ├── content/              # Bank soal, materi General Training & audio
│   ├── data/                 # Penyimpanan SQLite lokal (di-gitignore)
│   │   ├── ielts.db          # Database utama aplikasi
│   │   └── backups/          # File backup otomatis
│   ├── src/                  # Sumber kode Next.js (App Router, components, server)
│   ├── scripts/              # Skrip CLI pemeliharaan, backup, & AI helper
│   └── tests/                # Suite pengujian Unit, Integration, & E2E
├── specifications/           # 📐 Spesifikasi teknis (SPEC-000 hingga SPEC-027)
├── state/                    # 🧠 Knowledge base arsitektur, data model, & context
└── agent/                    # 🤖 Definisi alur kerja AI agent VasVibe
```

---

## 🔧 Perintah CLI Bawaan

Aplikasi menyediakan berbagai perkakas CLI yang dapat dijalankan dari dalam folder `codes/`:

```bash
# Pemeriksaan kesiapan sistem & model AI
npm run doctor

# Manajemen Profil Pengguna Lokal
npm run profile:list
npm run profile:create -- "Nama Pengguna"
npm run progress:unlock -- "Nama Pengguna" 3.3.2

# Cadangan & Pemulihan Database
npm run db:backup
npm run db:restore -- latest --yes

# Validasi Bank Soal & Materi
npm run bank:validate -- content/gt-bank
npm run content:validate -- content/gt-modules/3.3.3
```

---

## 🛡️ Keamanan & Privasi Data

- **Loopback Exclusive:** Server hanya melayani host `127.0.0.1` / `localhost`.
- **Privasi 100%:** Rekaman suara, riwayat teks esai, dan progres belajar tersimpan di komputer Anda tanpa diunggah ke pihak ketiga mana pun.
- **Bukan Pengganti Tes Resmi:** Hasil estimasi skor band AI ditujukan sebagai panduan latihan dan refleksi belajar mandiri, bukan pengganti sertifikasi resmi IDP/British Council.

---

## 🤝 Pengembangan & Alur Kerja

Platform ini dikembangkan menggunakan metodologi **VasVibe AI-Assisted Workflow** (berbasis 4-fase: Perencanaan $\to$ Pengerjaan $\to$ Testing $\to$ Hardening).  
Untuk informasi mengenai bagaimana agen AI bekerja di repo ini, baca panduan [QUICK-START.md](./QUICK-START.md) dan [AGENTS.md](./AGENTS.md).
