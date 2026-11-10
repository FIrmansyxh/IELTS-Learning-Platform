# BACKLOG USER STORY: ielts-learning-platform

**Owner Agent:** Analyst
**Date:** 2026-11-03
**Status:** `Approved` (didelegasikan, ADR-003)
**WORK_DEPTH:** standard

> Satu spec = satu user story (atomic). Prioritas memakai label PRD (P0/P1) dan MoSCoW. Ukuran: S (1-2 hari kerja), M (3-5), L (6-8), XL (> 8), diasumsikan solo + agen AI. Urutan build memenuhi dependensi (setiap `Depends on` terbit lebih dulu). Kontrak API: `_api-contract.md`.

## 1. Daftar Story

| Spec | User story (ringkas) | Req PRD/PO | Prioritas | MoSCoW | Depends on | Ukuran |
|---|---|---|---|---|---|---|
| 000 | Developer menyalakan stack lokal terkunci versi + benchmark AI + CI | NFR 5-6, ADR-001/002 | P0 | Must | - | L |
| 001 | Learner daftar/masuk/keluar/ganti password/profil | Pendukung (auth) | P0 | Must | 000 | M |
| 002 | Admin kelola pengguna, undangan, pengaturan, audit, kesehatan | Pendukung (admin) | P0 | Must | 000, 001 | M |
| 003 | Learner lihat skill tree dan gatekeeping berurutan | CUR-01, CUR-02 | P0 | Must | 000, 001 | L |
| 004 | Admin punya struktur 4 Tier + Golden Sample + kontrak konten | Seed, PRD 7.3 | P0 | Must | 000 | L |
| 005 | Learner belajar lewat artikel, video, slide (Learn) | MAT-01, 02, 03 (+ kerangka MAT-05) | P0 | Must | 001, 003, 004 | L |
| 006 | Learner kerjakan Active Drill dengan 10 tipe soal objektif | ASM-01, MAT-04 | P0 | Must | 001, 003, 004, 005 | XL |
| 007 | Learner lanjut dari posisi terakhir lewat kartu dashboard | TRK-01 | P0 | Must | 001, 003, 005, 006 | M |
| 008 | Learner lompat Modul/Tier lewat Skip Test (>= 85%) | CUR-03 | P0 | Must | 003, 004, 006 | M |
| 009 | Admin kelola tabel band; Learner dapat konversi + Overall Band | ASM-03 | P0 | Must | 001, 002 | M |
| 018 | Admin kelola sumber dan aset berlisensi | R4, lisensi | P0 | Must | 001, 002, 004 | L |
| 019 | Admin impor JSON/CSV dengan validasi, pratinjau, rollback | Bulk Importer | P0 | Must | 000, 002, 004, 018 | XL |
| 010 | Learner kerjakan Reading Split-Screen dengan highlighter | ASM-02 (Reading) | P0 | Must | 004, 006 | M |
| 011 | Learner kerjakan Listening dengan audio terkunci pada ujian | ASM-02 (Listening) | P0 | Must | 004, 006 | M |
| 012 | Learner dapat penilaian AI Writing + Mini-Task Writing | ASM-04, MAT-05 | P1 | Must (keputusan human: semua fitur rilis pertama) | 000, 001, 002, 005, 006, 009 | XL |
| 013 | Learner dapat penilaian AI Speaking (rekam, STT) | ASM-04, MAT-05 | P1 | Must | 001, 005, 006, 012 | XL |
| 014 | Learner ikut Boss Stage untuk membuka Tier berikutnya | CUR-02 | P0 | Must | 003, 004, 006, 008, 009, 010, 011, 012, 013 | XL |
| 015 | Learner ikut Placement Test adaptif | CUR-04 | P1 | Must | 003, 004, 006, 007, 008 | L |
| 016 | Learner dapat mahkota, poin, speed streak, streak harian | TRK-03 | P1 | Should | 001, 003, 005, 006, 014 | M |
| 017 | Learner lihat radar 6 sumbu, prediksi band, riwayat ujian | TRK-02 | P0 | Must | 006, 007, 009, 012, 013, 014 | L |
| 020 | Admin kurasi status, sunting konten, revisi, kualitas soal | Review (OQ konten AI) | P1 | Should | 002, 004, 018, 019 | L |
| 021 | Learner pilih jalur belajar (susunan + gaya penyampaian berbeda) | ADR-004 (approved 2026-11-08) | P1 | Should | 003, 004, 005, 007 | L |
| 022 | Learner latihan dari banyak bank soal yang dicampur (manual/otomatis) | ADR-004 (approved 2026-11-08) | P1 | Should | 004, 006, 017, 019, 020 | L |
| 023 | Learner memilih section (L/R/W/S) untuk simulasi tes IELTS GT dengan band per section | ADR-004 (approved 2026-11-08) | P1 | Should | 006, 009, 011, 012, 014, 022, 024 | XL |
| 024 | Konten Listening GT: skrip, audio TTS lokal, aset audio | ADR-004 (approved 2026-11-08) | P1 | Should | 004, 011, 018, 022 | L |
| 025 | Aplikasi lokal satu perangkat: profil lokal tanpa login, CLI pengganti admin, SQLite | ADR-005 (approved 2026-11-08) | P1 | Must (arah human) | 003, 007 | XL |

Catatan prioritas: 014 berlabel P0 (gerbang Tier) tetapi bergantung pada 012/013 (P1) hanya untuk section Writing/Speaking; Boss tetap dapat dirilis dengan set yang berisi hanya Listening + Reading (SPEC-014 Edge Case). Bila jadwal terdesak, 012/013 dapat bergeser setelah 014 tanpa mengubah kontrak.

## 2. Urutan Build (rekomendasi, memenuhi dependensi)
| Gelombang | Minggu (roadmap PRD) | Spec | Alasan |
|---|---|---|---|
| W0 | 1 | 000 | Fondasi, CI, versi terkunci |
| W1 | 1-2 | 001, 002, 003, 004 | Akun, admin dasar, mesin gerbang, struktur + Golden Sample (bersama pekerjaan konten C-06) |
| W2 | 3-4 | 005, 006, 007 | Core learning engine: pemutar, mesin soal, Resume |
| W3 | 4-5 | 008, 009 | Skip Test dan konverter band |
| W4 | 5-6 | 018, 019 | Aset berlisensi dan importer SEBELUM populasi konten (vertical slice PRD) |
| W5 | 6-7 | 010, 011 | Reading split-screen dan Listening ujian |
| W6 | 7-8 | 012, 013 | AI Writing dan Speaking (setelah benchmark C-09) |
| W7 | 8-9 | 014, 015 | Boss Stage dan Placement |
| W8 | 9-10 | 016, 017, 020 | Gamifikasi, radar + prediksi, kurasi |
| W10 | pasca-MVP | 025 (Fase 1-4) | Disarankan SEBELUM 021-024 agar fitur baru langsung dibangun di atas SQLite dan tanpa admin; urutan boleh diubah human |
| W9 | pasca-MVP | 022 (kontrak + bank konten), 024, 023, 021 | Bank soal GT modular lebih dulu (konten dapat divalidasi tanpa DB), lalu Mix Builder dan jalur belajar. Keduanya draft sampai disetujui human (ADR-004) |
Urutan nomor spec = urutan penerbitan; urutan build memajukan 018 dan 019 (W4) tetapi tetap sesudah dependensinya (001, 002, 004). Konten Tier 1-4 massal (C-01..C-04) berjalan paralel mulai W4.

## 3. Pekerjaan Non-Kode (Konten dan Ops)
| ID | Pekerjaan | Pemilik | Prasyarat | Dibutuhkan oleh |
|---|---|---|---|---|
| C-01 | Penyusunan konten Tier 1 (8 sub-modul, drill, Skip Modul, Boss T1) dalam paket JSON | Pemilik + AI | 019 | Rilis Tier 1 |
| C-02 | Konten Tier 2 | Pemilik + AI | 019 | Rilis Tier 2 |
| C-03 | Konten Tier 3 (+ paket mock Listening/Reading orisinal) | Pemilik + AI | 019 | Rilis Tier 3 |
| C-04 | Konten Tier 4 | Pemilik + AI | 019 | Rilis Tier 4 |
| C-05 | Parafrase orisinal band descriptors (Writing 4 kriteria x band 4-8; Speaking 4 kriteria x band 4-8) untuk seed rubrik | Pemilik + AI | 012, 013 | Penilaian AI |
| C-06 | Golden Sample GS-1..GS-6 (SPEC-004), termasuk audio orisinal dan slide | Pemilik + AI | 004 | Uji semua fitur |
| C-07 | Perluasan bank Placement (>= 50 soal, >= 10 per tingkat) | Pemilik + AI | 004 | 015 kualitas adaptif |
| C-08 | Pilih dan verifikasi video YouTube Indonesia per sub-modul (status `UNVERIFIED` -> `EMBED_ONLY`) | Pemilik | 018 | Publikasi sub-modul berisi video |
| C-09 | Jalankan `bench:ai` di mesin pemilik dan kunci model (`OLLAMA_MODEL_*`, `STT_MODEL`) | Pemilik + DevOps | 000 | 012, 013 |
| C-10 | Ops: BitLocker aktif, lokasi `BACKUP_DIR`, instal Tailscale untuk kenalan, uji restore backup | Pemilik | 000 | Rilis ke kenalan |
| C-11 | Fixture sintetis CI (`tests/fixtures/content/`): sub-modul, drill, skip, boss, placement 150 soal, audio nada | Backend/Tester | 004 | Uji E2E semua fitur |
| C-12 | **Standar Materi Diperkaya** (permintaan human 2026-11-10): tiap sub-modul memakai 8 bagian (tujuan+ringkasan, konsep inti, rumus/pola lengkap, contoh bervariasi 3 level, kesalahan umum pelajar Indonesia, strategi IELTS, contoh model band 5/6/7+, ringkasan+cek diri); Grammar wajib memuat rumus lengkap (positif/negatif/tanya/WH/jawaban singkat, aturan ejaan) dan peta tense lengkap (16 bentuk termasuk Past Future, bukan patokan 12); artikel >= 1.500 kata; drill >= 12 soal dengan variasi tipe. Sumber penulisan: `codes/content/_src/` (`build.mjs` menghasilkan `content.json`). Urutan: Modul 1.1 dulu, lalu 3.3.3, lalu sisanya per Tier | Pemilik + AI | C-01..C-04 | Semua materi |
| C-13 | **Perubahan UI dan bank soal** (permintaan human 2026-11-10, setelah uji lokal): (1) artikel materi memakai lebar penuh dan tabel tanpa geser horizontal pada layar lebar; (2) sidebar kiri dapat diciutkan (seperti Claude) dan Daftar isi dapat disembunyikan, keduanya diingat per perangkat; (3) Simulasi tes: pilihan section berupa checkbox per section (minimal satu tercentang; semua tercentang = tes lengkap); (4) Latihan campur (latihan bebas tanpa timer: pilih skill/tipe/jumlah) dan Simulasi tes (ujian berwaktu 4 section dengan perkiraan band) dipertahankan sebagai dua fitur dengan deskripsi yang lebih jelas; (5) bank soal: `start:local` mengimpor `gt-listening` dan `gt-bank`; bank Reading S1-S3 (tepat 40 soal), Vocab, dan Grammar tambahan disiapkan agar Mix dan Simulasi bisa dicoba manual. Listening S2-S4 tetap menunggu audio (SPEC-024) | Pemilik + AI | C-12 | Uji manual E2E |
| C-14 | **Materi interaktif** (permintaan human 2026-11-10): renderer artikel mendukung blok interaktif aman (tanpa HTML mentah) lewat directive `:::flow`, `:::timeline`, `:::layers`, `:::compare`, `:::flip`, `:::quiz`, `:::checklist`; bagian "Cek diri" (pertanyaan + kunci) dan contoh Band 5/6/7 diubah otomatis menjadi komponen interaktif (tampilkan jawaban dengan skor mandiri; tab level band) sehingga 33 materi langsung ikut; diagram ditambahkan pada materi utama (tense, struktur esai/surat, DRE, ARE-C, TEEL, conditional, dst.). Format sumber tetap Markdown (kontrak konten tidak berubah) | Pemilik + AI | C-12 | Pengalaman belajar |
| C-15 | **Dashboard Bento Grid (Action-First)** (permintaan human 2026-11-10): Beranda ditata ulang sebagai bento grid: hero streak + target harian dan kartu Lanjutkan Belajar, Target Band (2 kondisi), radar 6 sumbu, progres 4 tier (badge Skip Test), rekomendasi area lemah, koleksi 4 mahkota berdasarkan akurasi (Belum <60, Perunggu 60-74, Perak 75-89, Emas >=90; turunan dari `best_score_percent`, tanpa perubahan skema), 3 ujian terakhir, skeleton + empty state, terang/gelap, responsif. Memakai token tema Samudra (bukan hex indigo pada spesifikasi). Tanpa API baru: data dari endpoint yang ada; data tiruan hanya untuk pratinjau/uji | Pemilik + AI | C-14 | Pengalaman belajar |

## 4. Cakupan Persyaratan
| Kode | Cakupan spec |
|---|---|
| CUR-01 | 003 |
| CUR-02 | 003 (sub-modul), 006 (Drill), 014 (Tier/Boss) |
| CUR-03 | 008 |
| CUR-04 | 015 |
| MAT-01, MAT-02, MAT-03 | 005 |
| MAT-04 | 006 |
| MAT-05 | 005 (SELF_CHECK + kerangka), 012, 013 |
| ASM-01 | 006 (10 tipe objektif), 012 (Writing), 013 (Speaking) |
| ASM-02 | 010, 011 |
| ASM-03 | 009 |
| ASM-04 | 012, 013 |
| TRK-01 | 007 |
| TRK-02 | 017 |
| TRK-03 | 016 |
| Bulk Importer | 004 (library), 019 (UI/API), 018 (aset), 020 (kurasi) |
| Auth + admin | 001, 002 |
| Lingkungan | 000 |

## 5. Keputusan Analyst yang Dikunci (butuh peninjauan human setelah Fase 3 sesuai ADR-003)
1. **Skema JSON API = `snake_case`** di semua batas HTTP (sesuai kolom DB dan kontrak impor PRD).
2. **Mini-Task tidak menjadi syarat `COMPLETED`** sub-modul (CUR-02 hanya materi + Drill >= 75%); hanya menambah progres 20% dan poin.
3. **Drill hanya dapat dimulai setelah materi selesai**, dengan bukti belajar server (waktu aktif minimal 60 detik + semua sub-tab tersedia dikunjungi; `learn.min_active_seconds`).
4. **Review pada mode ujian (Skip/Boss/Placement) tanpa kunci jawaban dan pembahasan** (hanya benar/salah per soal) agar percobaan ulang tidak menghafal kunci; lebih ketat daripada minimum `security-standards.md` 6.1. Kebalikannya: Active Drill menampilkan kunci dan pembahasan per soal.
5. **Skip Test hanya untuk Modul/Tier yang belum dimulai** (`LOCKED`/`UNLOCKED` tanpa sub-modul berjalan/selesai).
6. **Gerbang Boss:** Tier 1 persen Listening + Reading >= 80% (poin mentah); Tier 2-4 band `bossBand` = pembulatan resmi rata-rata band Listening dan Reading >= 5.0 / 6.0 / 7.0. Skor mentah bagian < 40 soal diskalakan ke 40 (`scaleToForty`).
7. **Tabel band Listening dan Reading berbeda** (tabel Academic umum), menggantikan placeholder dan menyatukan PRD 6.1; bertanda "perkiraan".
8. **Placement:** algoritma staircase (mulai kesulitan 3, +1/-1), rekomendasi `floor` rata-rata kesulitan 10 soal terakhir, safeguard < 32% benar -> Tier 1; Learner boleh memilih Tier <= rekomendasi, sekali saja; Tier di bawah pilihan ditandai Dilewati. Golden Sample Placement 30 soal (6 per tingkat) alih-alih 20 PRD, agar 25 soal adaptif layak.
9. **Kap skor AI di kode:** panjang tulisan (< 50% -> 3.5; < 80% -> 5.0; < 100% -> 6.0), bahasa non-Inggris (>= 15% kata stopword Indonesia -> 4.0), durasi Speaking Part 2 (< 30 dtk -> 4.0; < 60 dtk -> 5.5), band >= 8.0 -> 7.5; `overall_band` selalu dihitung ulang di kode.
10. **Pronunciation Speaking selalu "diperkirakan"** (dari transkrip + keyakinan STT).
11. **Transkrip Listening ditiadakan** (tidak ada kolom penyimpanan); dimasukkan ke nice-to-have.
12. **Penghapusan akun hanya oleh Admin** (soft delete + anonimisasi 30 hari); tidak ada hapus mandiri dan tidak ada ekspor data.
13. **CSV importer hanya untuk soal** (`QUESTIONS`) pada set yang sudah ada; materi dan set baru lewat JSON.
14. **Poin hanya naik bila hasil lebih baik** daripada total yang sudah diberikan untuk set itu (anti-farming); mahkota hanya bila lulus; streak harian memakai zona `Asia/Jakarta`.
15. **Versi paket** pada SPEC-000 (termasuk Next 15.5.9 dan `next-auth@5.0.0-beta.29`) adalah target; DevOps memverifikasi ketersediaan dan mencatat versi aktual di `codes/VERSIONS.md` (tanpa mengubah keputusan stack).
16. **Aplikasi berada di `codes/`** (selaras `schemas/product-ci.template.yml`), bukan subfolder.

## 6. Ketergantungan Eksternal yang Belum Terpecahkan (bukan blokir spec)
- OQ-1 (spesifikasi mesin) tetap tidak diketahui: ditangani lewat `AI_ENABLED`, konfigurasi model env, dan C-09. Spec AI tidak mengunci model atau target latensi final.
- Daftar video YouTube Indonesia per sub-modul (C-08) dan ID video Golden Sample dipilih pemilik; sampai terverifikasi, sub-modul berisi video tidak dapat dipublikasikan (penghalang `ASSET_UNVERIFIED`).

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-03 | Analyst | Backlog awal: 21 story (000-020), urutan build, pekerjaan konten, keputusan terkunci |
| 2026-11-10 | Orchestrator | Tambah C-12 Standar Materi Diperkaya (permintaan human setelah Wave W8; Fase 4 ditahan) |
| 2026-11-10 | Orchestrator | C-12 selesai: 33 sub-modul diperkaya (lihat state/context.json untuk catatan dan batasan) |
| 2026-11-10 | Orchestrator | Tambah C-13 (perubahan UI dan bank soal setelah uji lokal) |
| 2026-11-10 | Orchestrator | Tambah C-14 (materi interaktif: blok diagram dan komponen belajar) |
| 2026-11-10 | Orchestrator | Tambah C-15 (dashboard Bento Grid action-first) |
