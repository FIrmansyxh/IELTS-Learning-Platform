# REQUIREMENTS — Platform Belajar Bahasa Inggris E2E & Akselerator IELTS (Band 5.0–7.0)

**Owner Agent:** Discovery
**Date:** 2026-11-03
**Phase:** Planning (hulu)
**Status:** `Approved` (sign-off human 2026-11-03)

> Hasil requirement gathering dengan human. Sumber awal: PRD draf Gemini (`gemini-code-1793645329179.md`, v1.0) + riset sumber materi (3 Nov 2026), lalu diklarifikasi lewat wawancara 3 ronde. Jika ada konflik, jawaban wawancara menang atas PRD draf.

---

## 1. Problem & Goals
- **Masalah:** Aplikasi seperti Duolingo bersifat repetitif dan lambat untuk target akademik. Pembelajar Indonesia yang mengincar IELTS 5.0–7.0 butuh jalur belajar E2E dari dasar sampai level ujian, dengan penjelasan berbahasa Indonesia, penilaian yang terkalibrasi ke band IELTS, dan jalan pintas bagi yang sudah menguasai materi.
- **Kenapa sekarang:** Pemilik ingin mulai belajar sendiri dan membangun platform sekaligus; materi sumber (resmi, CC, video) sudah terpetakan. IELTS kini sepenuhnya berbasis komputer, sehingga simulasi di layar relevan.
- **Definisi sukses (metrik):**
  - Pengguna dapat menyelesaikan jalur Tier 1 → Tier 4 dengan gerbang level yang berfungsi (terkunci sampai syarat nilai terpenuhi).
  - ≥80% sesi kembali berlanjut lewat "Lanjutkan Belajar" dalam <10 detik.
  - Mock test menunjukkan kenaikan perkiraan band +0.5 s.d. +1.0 per Tier yang lulus.
  - Pemakai dapat melompati modul yang dikuasai lewat Skip Test (≥85%) tanpa membuka materi.

## 2. Users & Personas
| Persona | Konteks / Pain | Kebutuhan utama |
|---------|----------------|-----------------|
| Learner (pemilik + kenalan, <50 user di awal) | Pembelajar Indonesia dari nol sampai target IELTS 5–7; bosan dengan drill berulang ala Duolingo | Jalur berjenjang, penjelasan ID, tes skip, skor/band yang realistis, tahu posisi terakhir |
| Admin/Kurator Konten (pemilik, dibantu AI) | Konten tersebar di banyak sumber; butuh cara cepat memasukkan modul dan soal | Impor massal JSON/CSV, preview, edit modul/soal, kelola sumber & lisensi |

## 3. Scope
- **Must-have (P0 + keputusan human):**
  - Hierarki Tier → Modul → Sub-Modul dengan skill tree visual dan status Terkunci/Sedang/Selesai.
  - Gatekeeping berurutan: sub-modul terbuka bila materi selesai dan Active Drill ≥75%; Tier terbuka bila semua modul selesai dan lulus Boss Stage sesuai band target.
  - Fast-Track Test Out (≥85%, berwaktu) untuk modul/Tier.
  - Pemutar multimodal per sub-modul: artikel Markdown + unduhan, video YouTube dengan start/end detik, carousel slide, Active Drill berwaktu, Mini-Task.
  - Mesin soal 7 tipe (MCQ, T/F/NG & Y/N/NG, isian dengan batas kata, matching, reorder/error recognition, editor Writing dengan timer, perekam Speaking) + Split-Screen Reading + Listening berpemutar audio terkunci pada mode ujian.
  - Konversi skor mentah Listening/Reading ke band + rumus overall band.
  - Penilaian AI untuk **Writing dan Speaking** berbasis rubrik band descriptors resmi, dengan koreksi menuju Band 7.
  - Pelacakan posisi terakhir ("Resume Last Learned"), radar 6 sumbu + prediksi band.
  - Gamifikasi: mahkota Silver/Gold, poin, streak kecepatan.
  - Placement test adaptif (25 soal) dan bulk importer JSON/CSV di admin.
  - **Seluruh Tier 1–4 tersedia pada rilis pertama** (keputusan human; lihat Risiko R1).
  - Antarmuka dan pembahasan berbahasa Indonesia; materi/soal berbahasa Inggris.
- **Nice-to-have:** Spaced repetition kosakata (FSRS/ts-fsrs), PWA offline, leaderboard/sosial, analitik lanjutan, video tutor Indonesia buatan sendiri, dukungan General Training.
- **Out of scope (eksplisit):**
  - Meng-host ulang buku/soal berhak cipta (Cambridge IELTS 10–19, Murphy, Azar, Oxford lists, tes resmi IDP/BC); hanya dirujuk atau ditautkan.
  - Mengunduh lalu mengunggah ulang video pihak ketiga.
  - Pembayaran/monetisasi, hosting cloud produksi, aplikasi native mobile.
  - Penilaian resmi bersertifikat (bukan pengganti tes IELTS asli).

## 4. Key Features & Flows
- Daftar/masuk → pilih mulai Tier 1 atau Placement Test → dashboard dengan kartu "Lanjutkan Belajar" → buka sub-modul → Learn (artikel/video/slide) → Drill → Mini-Task → sub-modul berikutnya terbuka.
- Pengguna melihat modul terkunci → "Uji Kompetensi" (Skip Test) → bila ≥85% modul menjadi SKIPPED dan level berikutnya terbuka.
- Akhir Tier → Boss Stage (mock berskor band) → lulus membuka Tier berikutnya.
- Writing/Speaking → kirim jawaban → AI menilai 4 kriteria → skor band + umpan balik.
- Admin → unggah JSON/CSV modul dan soal → validasi → preview → publikasi.

## 5. Non-Functional Requirements
- **Skala/Beban:** <50 pengguna, hanya 1 mesin lokal; satu pengguna aktif memakai AI pada satu waktu.
- **Performa:** Halaman materi terbuka <2 dtk di lokal; penilaian AI boleh 10–60 dtk dengan indikator progres (bergantung perangkat keras untuk Ollama/STT).
- **Security & Compliance:** Data pribadi ringan (email, progres, rekaman suara). Tidak ada kewajiban formal pada tahap pribadi; tetap terapkan praktik dasar (hash password, validasi input, kontrol akses admin). Tinjau UU PDP bila dibuka publik.
- **Availability:** Tidak ada target uptime (lokal).
- **Budget:** Prioritas biaya nol: semua lokal, tanpa API berbayar.

## 6. Constraints
- **Tech preferences:** Mengikuti saran PRD yang disesuaikan menjadi **full lokal**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui; PostgreSQL lokal via Docker + auth email/password sederhana (skema SQL PRD dipertahankan agar mudah pindah ke Supabase); **LLM lokal via Ollama** untuk penilaian; speech-to-text lokal (mis. whisper.cpp) untuk Speaking; penyimpanan aset di filesystem/MinIO lokal.
- **Sistem existing:** Tidak ada.
- **Timeline & tim:** ±10 minggu mengikuti roadmap PRD; solo + agen AI. **WORK_DEPTH: standard.**

## 7. Data & Integrations
- **Data sensitif:** Email dan hash password, progres belajar, rekaman audio Speaking (disimpan lokal), teks Writing.
- **Integrasi pihak ketiga:** YouTube IFrame Player API (embed video); Ollama dan STT lokal; tidak ada payment/notifikasi. Sumber konten dirujuk: NGSL/NAWL (CC BY-SA), Tatoeba (CC BY), ts-fsrs (MIT), Common Voice (CC0), band descriptors resmi (rubrik), tes IDP/BC (tautan).

## 8. Assumptions
- A1: Konten dibuat/diedit pemilik dibantu AI; soal ditulis orisinal berpedoman silabus (EGP, NGSL, NAWL), bukan salinan buku berhak cipta.
- A2: Penomoran Tier 1–4 pada PRD dipakai; Level 0–5 pada riset dipetakan ke Tier (Level 0→T1, 1–2→T2, 3→T3, 4–5→T4) dan perlu dikonfirmasi.
- A3: Tabel konversi band PRD (mis. 16–17 benar = 5.0) bersifat perkiraan dan bervariasi antar versi tes; tabel disimpan sebagai data yang bisa diubah.
- A4: Kosakata akademik memakai NAWL (+NGSL) sebagai tulang punggung dan AWL Coxhead sebagai pembanding; lisensi SA berlaku pada turunannya.
- A5: Skor model Ollama lokal cukup untuk umpan balik latihan (bukan skor resmi); disertai disclaimer dan rubrik terstruktur dalam output JSON.
- A6: Satu mesin pengguna memiliki RAM/GPU memadai untuk model LLM kecil-menengah dan STT.
- A7: Platform tidak dimonetisasi di tahap ini; sumber berklausul NC (OpenLearn, English Profile) boleh dipakai selama tidak komersial.

## 9. Open Questions
- [ ] Spesifikasi mesin (RAM/GPU) untuk menentukan model Ollama dan STT.
- [ ] Siapa kenalan yang dilayani dan apakah mereka mengakses via jaringan lokal atau perlu tunnel/hosting kelak?
- [ ] Daftar video YouTube Indonesia per sub-modul belum diverifikasi (hanya Titik Nol English yang tersebut di riset; kanal di PRD perlu dicek).
- [ ] Apakah General Training perlu didukung atau hanya Academic?
- [ ] Siapa yang memverifikasi kualitas soal buatan AI sebelum publikasi?

## 10. Risks
| Risiko | Dampak | Mitigasi awal |
|--------|--------|---------------|
| R1: Cakupan MVP semua Tier sekaligus, sementara konten dibuat sendiri + AI dan jadwal ±10 minggu | Jadwal molor, kualitas konten rendah | Platform dan bulk importer dikerjakan lebih dulu; konten dipublikasi bertahap per Tier tetapi struktur Tier 1–4 sudah lengkap; kurasi konten diparalelkan |
| R2: Kualitas penilaian Ollama untuk Writing/Speaking rendah atau tidak konsisten | Skor tidak dipercaya | Rubrik terstruktur + contoh few-shot, skor sebagai perkiraan, kalibrasi dengan esai Band bersampel, opsi ganti model/API nanti |
| R3: Speech-to-text lokal lambat/kurang akurat untuk aksen Indonesia | Umpan balik Speaking buruk | Model kecil terkuantisasi, antrean job, fallback self-assessment |
| R4: Konten berhak cipta terbawa ke platform | Masalah lisensi bila dipublikasikan | Hanya rujukan/tautan, catat lisensi tiap aset di metadata, review sebelum publik |
| R5: Tabel konversi band berubah | Gerbang level tidak akurat | Simpan sebagai konfigurasi data, tinjau berkala |
| R6: Hardware lokal tidak cukup untuk LLM + STT + Postgres | Aplikasi lambat | Ukur lebih dulu (Open Question 1), model ringan, job asinkron |

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-03 | Discovery | Initial requirements gathered (3 ronde wawancara + PRD Gemini + riset sumber) |
