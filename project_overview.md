# PROJECT OVERVIEW

> Sumber: `state/knowledge_base/requirements/requirements.md` (Approved, 2026-11-03) + PRD draf Gemini v1.0 (skema SQL 7.2, kontrak JSON 7.3, katalog sumber 3). Jika konflik, requirements.md menang atas PRD. Item bertanda **[ASUMSI]** adalah rekomendasi Initiator yang belum dikonfirmasi human.

## 1. Project Summary
**Nama proyek:** `ielts-learning-platform`

Platform pembelajaran bahasa Inggris End-to-End (A1 hingga C1) dan akselerator IELTS Academic (target Band 5.0–7.0), berbentuk aplikasi web berbahasa Indonesia yang berjalan **sepenuhnya lokal** (tanpa API berbayar, tanpa hosting cloud). Berbeda dari aplikasi drill repetitif seperti Duolingo, platform ini menawarkan jalur kurikulum berjenjang 4 Tier (Tier → Modul → Sub-Modul) dengan gatekeeping berbasis kompetensi, jalan pintas lewat Skip Test (>=85%), simulasi ujian (Boss Stage) yang dikalibrasi ke skor band IELTS, penilaian AI lokal untuk Writing dan Speaking, serta pelacakan posisi belajar yang presisi ("Lanjutkan Belajar").

Tujuan bisnis/produk: (1) pemilik dapat belajar sendiri sambil membangun platform; (2) <50 pengguna awal (pemilik dan kenalan); (3) metrik sukses: jalur Tier 1–4 berfungsi dengan gerbang level, >=80% sesi lanjut lewat "Lanjutkan Belajar" dalam <10 detik, kenaikan estimasi band +0.5 s.d. +1.0 per Tier, dan Skip Test berfungsi tanpa membuka materi.

Pendekatan eksekusi (dari PRD, disesuaikan): Vertical Slice, yaitu Golden Sample Content, lalu core platform, lalu bulk importer, lalu populasi konten massal. **Seluruh Tier 1–4 tersedia pada rilis pertama** (keputusan human; lihat Risiko R1), dengan konten dipublikasikan bertahap.

## 2. Target Audience
| Persona | Deskripsi | Kebutuhan utama |
|---|---|---|
| **Learner** | Pembelajar Indonesia (pemilik dan kenalan, <50 user) dari level dasar sampai target IELTS 5.0–7.0; bosan dengan drill ala Duolingo | Jalur berjenjang, penjelasan berbahasa Indonesia, Skip Test, skor/band realistis, tahu posisi terakhir |
| **Admin / Kurator Konten** | Pemilik, dibantu AI; mengelola konten dari banyak sumber | Impor massal JSON/CSV, preview, edit modul/soal, kelola sumber dan lisensi aset |

## 3. Key Features
**Utama (Must-have):**
- **Skill Tree Kurikulum 4 Tier** (Tier → Modul → Sub-Modul) dengan status Terkunci / Sedang / Selesai (CUR-01).
- **Strict Sequential Gatekeeping**: sub-modul N+1 terbuka bila materi N selesai dan Active Drill >=75%; Tier T+1 terbuka bila semua modul selesai dan lulus Boss Stage sesuai band target (CUR-02).
- **Fast-Track Test Out (Skip Test)**: >=85% dalam batas waktu menandai modul/Tier `SKIPPED` dan membuka level berikutnya (CUR-03).
- **Pemutar Multimodal "Learn - Drill - Apply"**: artikel Markdown + unduhan PDF/DOCX, video YouTube dengan `start_sec`/`end_sec`, carousel slide (WebP/PNG), Active Drill berwaktu (10 soal, umpan balik instan berbahasa Indonesia), Mini-Task (MAT-01..05).
- **Mesin Soal 7 Tipe**: MCQ (single/multi), T/F/NG dan Y/N/NG, isian dengan batas kata, matching (drag/dropdown), reorder/error recognition, editor Writing (word counter + timer), perekam Speaking (1 menit persiapan + 2 menit rekam) (ASM-01).
- **Split-Screen Reading** (teks + highlighter di kiri, soal di kanan) dan **Listening** dengan pemutar audio yang rewind-nya dikunci pada mode ujian (ASM-02).
- **Konverter Band IELTS**: skor mentah Listening/Reading (0–40) ke band 1.0–9.0 dan rumus Overall Band; **tabel konversi disimpan sebagai data yang dapat diubah** (ASM-03, asumsi A3).
- **Penilaian AI Writing dan Speaking** (Ollama lokal + STT lokal) berbasis rubrik band descriptors resmi (Task Response/Achievement, Coherence, Lexical Resource, Grammar), output JSON terstruktur, koreksi menuju Band 7, disertai disclaimer "perkiraan, bukan skor resmi" (ASM-04).
- **Resume Last Learned**: menyimpan `active_sub_module_id`, `active_tab`, `video_progress_sec`, `last_question_index`; kartu teratas dashboard dengan satu tombol "Lanjutkan Belajar" (TRK-01).
- **Radar 6 Sumbu + Prediksi Band** (Listening, Reading, Writing, Speaking, Grammar, Vocabulary) (TRK-02).
- **Gamifikasi**: mahkota Silver (75–89%) / Gold (90–100%), poin, streak kecepatan (TRK-03).
- **Placement Test Adaptif** (25 soal berwaktu) untuk membuka Tier yang sesuai (CUR-04).
- **Admin: Bulk Importer JSON/CSV** (validasi, preview, publikasi) mengikuti kontrak data PRD 7.3, plus edit modul/soal dan pencatatan sumber/lisensi aset.

**Pendukung / Implisit** (konsisten dengan scope; **[ASUMSI]** perlu konfirmasi):
- Autentikasi email/password sederhana (daftar, masuk, keluar) dengan peran `learner` dan `admin`.
- Dashboard pengguna (kartu Lanjutkan Belajar, ringkasan progres, riwayat mock test).
- Antrean job asinkron untuk penilaian AI/STT dengan indikator progres (10–60 dtk) dan fallback self-assessment bila STT/LLM gagal.
- Seed data konfigurasi: 4 Tier, tabel konversi band, Golden Sample content.
- Halaman riwayat hasil dan detail umpan balik AI per submission.

**Nice-to-have (di luar MVP):** Spaced repetition kosakata (ts-fsrs), PWA offline, leaderboard/sosial, analitik lanjutan, video tutor Indonesia buatan sendiri, dukungan General Training.

**Out of scope (eksplisit):** hosting ulang buku/soal berhak cipta (Cambridge IELTS 10–19, Murphy, Azar, Oxford lists, tes resmi IDP/BC; hanya dirujuk/ditautkan); mengunduh dan mengunggah ulang video pihak ketiga; pembayaran/monetisasi; hosting cloud produksi; aplikasi native mobile; penilaian bersertifikat resmi.

## 4. Tech Stack & Infrastructure
Prinsip: **full lokal, biaya nol, tanpa API berbayar** (requirements 5 & 6). Skema SQL PRD 7.2 dipertahankan agar mudah dipindah ke Supabase kelak.

- **Language/Runtime:** TypeScript 5.x di Node.js 22 LTS **[ASUMSI: versi LTS]**
- **Framework:** Next.js (App Router, fullstack: Server Components, Route Handlers, Server Actions) + React 19
- **Database:** PostgreSQL 16 via Docker (skema DDL PRD 7.2: `tiers`, `modules`, `sub_modules`, `learning_materials`, `assessment_sets`, `user_last_learned_state`, `user_sub_module_progress`; kolom `JSONB` untuk soal dan materi). **ORM/migrasi [DISETUJUI 2026-11-03]:** Drizzle ORM + drizzle-kit (ringan, SQL-first, cocok dengan skema yang sudah ada). Ekstensi `pgcrypto`/`gen_random_uuid()` bawaan PG16.
- **Authentication:** Email/password sederhana, self-hosted di Next.js **[DISETUJUI 2026-11-03: Auth.js (NextAuth) Credentials, sesi cookie httpOnly, hash `argon2`/`bcrypt`]**; peran `learner`/`admin`; tidak memakai Supabase Auth (skema `user_id` tetap kompatibel).
- **AI Grading (LLM lokal):** **llama.cpp `llama-server`** (OpenAI-compatible, `http://127.0.0.1:8080`, keluaran terstruktur lewat `json_schema`; Ollama dicopot dari jalur default, ADR-004). Model penilai Writing **[DITETAPKAN 2026-11-11, ADR-004 addendum]**: **gpt-oss-20b MXFP4** (12,1 GB; sekitar 3,4 GB VRAM + 10-11 GB RAM; median sekitar 70 dtk per evaluasi di RTX 3060 6 GB). Skor LLM lokal bersifat **indikatif**, bukan setara penguji IELTS (benchmark kasus baru: 18/24 dalam rentang acuan, MAE band 0,66). Model dapat diganti lewat env tanpa ubah kode.
- **Speech-to-Text lokal:** **whisper.cpp** (atau `faster-whisper`) sebagai service lokal terpisah **[ASUMSI]**; model `small`/`base` terkuantisasi; dipanggil dari worker via HTTP/CLI. Web Speech API dapat menjadi fallback browser.
- **Media & Object Storage:** Filesystem lokal (volume Docker) untuk slide, dokumen, audio listening, dan rekaman Speaking; **MinIO** (S3-compatible, opsional) bila perlu pemisahan. Video pembelajaran lewat **YouTube IFrame Player API** (embed, tanpa unduh).
- **Job/Antrean:** Worker Node terpisah dengan tabel job di Postgres **[DISETUJUI 2026-11-03: pg-boss]** untuk penilaian AI/STT asinkron; satu job AI aktif pada satu waktu.
- **State Management:** Server state via React Server Components + **TanStack Query** untuk data interaktif; state UI lokal via React hooks/**Zustand** seperlunya (timer ujian, state pemutar); form via **React Hook Form + Zod** (validasi sama untuk client dan server, termasuk validator kontrak JSON importer).
- **Testing Framework:** **Vitest** (unit/komponen, React Testing Library) dan **Playwright** (E2E, termasuk alur gatekeeping, Skip Test, Resume). Testcontainers/Postgres Docker untuk integration test **[ASUMSI]**.
- **CI/CD:** **GitHub Actions** (lint, typecheck, unit, build, E2E) mengikuti `schemas/product-ci.template.yml`; tanpa deployment otomatis ke cloud (lokal). **[ASUMSI]**
- **Infrastructure:** Docker & Docker Compose (Default). Servis: `web` (Next.js), `worker`, `db` (Postgres), `ollama`, `stt` (whisper), dan opsional `minio`. Dukungan GPU opsional untuk Ollama/STT bila tersedia.
- **Hosting/Platform:** **Lokal di satu mesin** (localhost / jaringan lokal). Tidak ada hosting cloud produksi; akses kenalan via jaringan lokal atau tunnel kelak (Open Question 2, di luar scope saat ini).
- **Bahasa & Lokalisasi:** UI dan pembahasan berbahasa Indonesia; materi/soal berbahasa Inggris. i18n sederhana (kamus string `id`) **[ASUMSI]**.

## 5. UI/UX Guidelines & Design System
Seluruh item di bagian ini adalah **rekomendasi Initiator [ASUMSI]**; requirements hanya menetapkan Tailwind + shadcn/ui. Detail final menjadi tugas UX Designer (`style_guide`/`design-system`).

- **CSS Framework / Library:** Tailwind CSS 4 dengan design tokens (CSS variables) agar tema mudah disesuaikan.
- **Component Library:** shadcn/ui (Radix primitives); tambahan: Recharts (radar 6 sumbu), `react-markdown` + `remark-gfm` (render artikel), `@dnd-kit` (drag and drop matching), Embla Carousel (slide).
- **Visual Vibe:** **Clean, fokus, dan memotivasi** (Academic-Modern dengan sentuhan playful ringan pada gamifikasi). Hierarki jelas untuk waktu belajar panjang dan simulasi ujian bebas gangguan; mode ujian (Boss Stage) lebih minimalis dan tenang. Bukan gaya kartun ala Duolingo.
- **Color Palette:**
  - **Primary:** Biru indigo `#4F46E5` (kepercayaan, akademik); status **Sedang Dipelajari** = biru.
  - **Secondary:** Teal `#14B8A6` / amber `#F59E0B` untuk aksen (amber dipakai untuk Gold crown, abu perak untuk Silver).
  - **Semantik status:** Hijau `#16A34A` = Selesai (+skor), Biru = Sedang, Abu-abu + ikon gembok = Terkunci (sesuai CUR-01); Merah `#DC2626` untuk error/koreksi.
  - **Background:** Light-first dengan dukungan Dark mode (toggle + `prefers-color-scheme`); permukaan netral slate (`#F8FAFC` light, `#0F172A` dark). Kontras minimal WCAG AA.
- **Typography:**
  - **Font Family:** **Inter** (UI/body) dan **Plus Jakarta Sans** (heading, nuansa lokal); monospace **JetBrains Mono** untuk rumus/kode. Artikel panjang memakai line-height 1.7 untuk keterbacaan.
- **Iconography:** Lucide React.
- **Styling Details:**
  - **Radius:** `0.75rem` (md/lg), kartu besar `1rem`.
  - **Shadows:** Lembut dan berlapis tipis (soft elevation), minim shadow keras; fokus ring jelas untuk aksesibilitas.
- **Komponen/Pola Khusus:** Skill tree visual (peta Tier/Modul/Sub-Modul), kartu "Lanjutkan Belajar" di posisi teratas dashboard, split-screen Reading, audio player terkunci, editor Writing dengan word counter dan timer, perekam Speaking dengan level meter, radar chart skill, badge mahkota Silver/Gold, callout "Tips Examiner" dan "Kesalahan Umum".
- **Aksesibilitas:** Navigasi keyboard penuh, label ARIA pada kontrol ujian, tidak mengandalkan warna saja untuk status (ikon + teks).
- **Responsive Strategy:** Mobile-First (PWA offline termasuk nice-to-have, bukan MVP). Split-screen Reading menjadi tab/stacked pada layar sempit.

## 6. Constraints & Compliance
- **Skala dan beban:** <50 pengguna, 1 mesin lokal; satu penilaian AI aktif per waktu. Tidak ada target uptime.
- **Performa:** Halaman materi terbuka <2 dtk di lokal; penilaian AI 10–60 dtk dengan indikator progres.
- **Budget:** Biaya nol; semua komponen lokal, tanpa API berbayar.
- **Security (Standard Web Security Practices):** hash password (argon2/bcrypt), validasi input (Zod) termasuk file importer dan unggahan audio, kontrol akses admin (RBAC) di sisi server, sesi cookie httpOnly/SameSite, proteksi CSRF dan rate-limit dasar, pembatasan tipe/ukuran file unggahan.
- **Data sensitif:** email dan hash password, progres belajar, teks Writing, rekaman audio Speaking (disimpan lokal). Tinjau UU PDP bila platform dibuka publik; sementara belum ada kewajiban formal.
- **Lisensi konten (kritis):** hanya rujukan/tautan untuk materi berhak cipta; setiap aset mencatat sumber dan lisensi di metadata. Sumber yang dipakai: NGSL/NAWL (CC BY-SA), Tatoeba (CC BY), ts-fsrs (MIT), Common Voice (CC0), band descriptors resmi (rubrik). Sumber berklausul NC (OpenLearn, English Profile) hanya selama non-komersial (asumsi A7).
- **Disclaimer produk:** Skor AI dan perkiraan band adalah estimasi latihan, bukan penilaian resmi bersertifikat.
- **Timeline dan tim:** ±10 minggu mengikuti roadmap PRD (Minggu 1–2 golden sample + DB; 3–5 core engine + gatekeeping; 6–7 simulator, AI grader, bulk importer; 8–10 Tier 3–4, radar, placement); solo + agen AI.

### Risiko Utama (ringkas, detail di requirements.md)
R1 cakupan MVP semua Tier vs jadwal, R2 kualitas penilaian Ollama, R3 akurasi/kecepatan STT lokal, R4 konten berhak cipta, R5 perubahan tabel konversi band, R6 kapasitas hardware lokal.

## 7. Project Settings
- **WORK_DEPTH:** `standard`
- **Project Name:** `ielts-learning-platform`
- **Default Branch Strategy:** mengikuti `agent/workflows/_shared/git-branch-management.md`
- **Bahasa Antarmuka:** Indonesia (`id`); bahasa materi: Inggris
- **Mode Deployment:** Lokal (Docker Compose), tanpa cloud
- **Status Dokumen:** Draft untuk CHECKPOINT human (Fase 1)

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-03 | Initiator | Initial `project_overview.md` disintesis dari requirements.md (Approved) + PRD Gemini |
