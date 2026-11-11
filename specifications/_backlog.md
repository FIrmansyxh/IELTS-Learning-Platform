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
| C-16 | **Latihan campur lebih ramah + layout Profil** (permintaan human 2026-11-10): Latihan campur disederhanakan (revisi human): pengguna hanya memilih Skill dan Tipe soal, jumlah soal otomatis (10, dibatasi soal tersedia), kesulitan tetap dapat diatur (preset + slider), pilihan bank dihapus dari UI (bank hanya aktif bila datang dari saran hasil `?bank=` dan dapat dilepas); langkah bernomor, penjelasan tipe, panel Ringkasan sesi sticky, layout lebar penuh. Skrip `npm run seed:demo` membuat profil "Demo Tier 4" (Tier 1-3 selesai, Tier 4 berjalan, riwayat drill/boss/simulasi, poin, streak, radar) untuk melihat dashboard terisi; Profil memakai lebar penuh 2 kolom dengan header ringkas (inisial, target, poin, streak). Logika, kontrak API, label tombol dan ID uji tidak berubah | Pemilik + AI | C-15 | Pengalaman belajar |
| C-17 | **Diagram berwarna + bento sesuai isi** (permintaan human 2026-11-10): semua diagram (radar, tren band riwayat, progres tier, mahkota) memakai palet token `--chart-1..6` dengan varian terang dan gelap (perbaikan akar masalah: `hsl(var(--x))` pada token hex menghasilkan warna tidak valid); radar berwarna per skill + legenda; riwayat memakai area-chart dengan garis target; dashboard bento dua kolom yang tingginya mengikuti isi (tidak diregangkan) | Pemilik + AI | C-16 | Pengalaman belajar |
| C-18 | **Audit layout multi-perangkat dan relasi antar bagian** (permintaan human 2026-11-10): (1) Peta: kolom modul dan kartu jalur mengikuti lebar wadah (container query), bukan viewport, sehingga tidak terpotong pada 1024 px dengan sidebar + panel detail; pemilih jalur menjadi deretan geser pada layar sempit; (2) Beranda: bento 12 kolom, radar di kiri dan tumpukan progres tier/mahkota/ujian terakhir di kanan agar tinggi seimbang; (3) kerangka: label bottom nav satu baris (label ringkas, nama aksesibel tetap), baris chip tidak menyisakan ruang kosong di Simulasi, konten dipusatkan; (4) Simulasi dan Statistik lebih rapat; (5) daftar isi lipat untuk artikel di bawah lg; sel tabel tidak memenggal kata; (6) fungsi: data turunan (chip streak/poin, dashboard, radar, riwayat, peta, kartu lanjutkan) disegarkan otomatis setelah submit drill/ujian/simulasi, selesai belajar, atau ubah profil (sebelumnya basi sampai muat ulang); warna grafik radar dan riwayat band memakai token tema yang valid (sebelumnya `hsl(var(--x))` tidak valid sehingga grid/label tak terlihat); pengalihan ke pemilih profil tidak lagi berulang; judul tab ganda diperbaiki. Tanpa perubahan API atau skema | Pemilik + AI | C-17 | Pengalaman belajar |
| C-19 | **Menu Glosarium** (permintaan human 2026-11-10): menu baru `/glosarium` berisi (1) tabel Verb Forms 5 bentuk (V1 dasar, V2 past, V3 past participle, V-ing, V-s/es) untuk kata kerja umum (bukan akademik) dengan arti Indonesia, pencarian, filter beraturan/tak beraturan, dan mode hafalan (sembunyikan kolom, ketuk untuk membuka); (2) glosarium istilah grammar, kosakata, dan IELTS dengan penjelasan Indonesia dan contoh. Data statis di kode (tanpa API/DB baru); bentuk -ing dan -s/es diturunkan dengan aturan + pengecualian terbukti lewat uji | Pemilik + AI | C-18 | Pengalaman belajar |
| C-20 | **Pengantar Dasar Materi** (permintaan human 2026-11-10: materi sulit dipahami untuk belajar mandiri karena langsung masuk ke hal baru tanpa pengantar): (1) setiap artikel dibuka dengan bagian `## Mulai dari Sini` sebelum `## Tujuan Belajar`, berisi blok `:::pengantar` (tiga paragraf: **Apa yang kamu pelajari?** dengan bahasa sehari-hari dan perbandingan ke bahasa Indonesia/situasi nyata, **Kenapa ini penting?**, **Bekal sebelum mulai:**) dan sub-bagian `### Istilah yang Akan Kamu Temui` (tabel 4-8 istilah: arti sederhana + contoh); (2) setiap bagian bernomor (`## N. ...`) dibuka dengan paragraf pengantar biasa (>= 20 kata) sebelum tabel, diagram, atau sub-judul; (3) istilah baru dijelaskan saat pertama kali muncul; (4) renderer mendukung callout `:::pengantar` (label "Pengantar"). Isi lama tidak dihapus (hanya ditambah). Standar dijaga `content-articles.test.tsx`; alat bantu penulis: `content/_src/check-pengantar.mjs` | Pemilik + AI | C-12, C-14 | Belajar mandiri |
| C-21 | **Numerasi Materi dan Variasi Soal Drill** (permintaan human 2026-11-10: numerasi materi kurang rapi; mengulang latihan setelah materi 3 kali memunculkan banyak soal yang sama): (1) label contoh `Level N` menjadi sub-judul kecil (`####`) dan daftar di bawahnya mulai dari 1; sub-bagian tunggal (X.1 tanpa X.2) menjadi sub-judul kecil tanpa nomor; baris contoh `Level` yang menyatu jadi satu paragraf dijadikan daftar. (2) Bank soal Active Drill tiap sub-modul (kecuali 3.3.3 yang dikunci tes E2E) ditambah menjadi 30 soal, yaitu 3 kali `drill.question_count` bawaan (10). (3) Mesin soal: saat `limit` memotong pool, soal yang belum pernah muncul pada 6 attempt terakhir profil itu diutamakan, lalu yang paling lama tidak muncul (`SelectionOptions.recent`), sehingga tiga kali pengulangan berturut-turut tidak berbagi soal. | Pemilik + AI | C-12, C-14 | Belajar mandiri |
| C-22 | **Materi Grammar dari slide kursus (Basic + Intermediate)** (permintaan human 2026-11-11: 17 berkas slide kursus grammar di Google Drive dijadikan bahan modul; sub-modul, modul, atau jalur baru boleh langsung ditambahkan): (1) tujuh sub-modul baru untuk topik yang belum ada di kurikulum, mengikuti standar C-12, C-20, C-21 (artikel >= 1.500 kata, pengantar, bank drill 30 soal, mini-task): `1.1.5` Adjectives & Adverbs + suffix pembentuk kata, `1.1.6` Verbs (bentuk, transitive/intransitive, linking verb, auxiliary, kalimat verbal vs nominal), `1.1.7` Prepositions & Interjections, `1.1.8` Phrases (noun, adjective, adverbial, prepositional), `1.1.9` Simple Future (aktif, pasif, nominal), `2.1.5` Gerund & To Infinitive, `2.1.6` Meringkas Adjective Clause (reducing, omitting, appositive); struktur kurikulum menjadi 4 Tier, 13 Modul, 40 Sub-Modul (tanpa modul baru: semuanya masuk Modul 1.1 dan 2.1). (2) Jalur baru `GT-GRAMMAR` "Fondasi Grammar (Basic ke Intermediate)" (CURATED, LIST, LEARN_FIRST) yang mengurutkan materi grammar mengikuti urutan kursus dengan 3 Checkpoint. (3) Materi lama dilengkapi (hanya penambahan): `1.1.1` mendapat fungsi noun, pronoun demonstrative/indefinite/reciprocal, *other/another*, dan *a number of / the number of*; `2.1.1` mendapat correlative conjunctions. (4) Slide dipakai sebagai acuan cakupan dan urutan; penjelasan, contoh, dan soal ditulis ulang secara orisinal (soal latihan pada slide Day 18 tampak diambil dari buku teks berhak cipta, jadi tidak disalin). Topik slide yang sudah tercakup (Simple Past, Present Continuous, Present Perfect, peta 16 tense, Adjective Clause dasar) tidak dibuat ulang | Pemilik + AI | C-12, C-20, C-21 | Belajar mandiri |
| C-23 | **Persentase Tier/Modul menghitung sub-modul baru** (permintaan human 2026-11-11: setelah C-22, Tier 1, Tier 2, Modul 1.1, dan Modul 2.1 tetap tertulis "Selesai 100%" walau ada sub-modul baru yang belum dikerjakan): (1) `progress_percent` Modul dan Tier selalu dihitung dari sub-modul AVAILABLE (SPEC-003 D7), termasuk saat statusnya `COMPLETED`/`SKIPPED`; nilai 100 otomatis hanya bila tidak ada sub-modul AVAILABLE. (2) Status tersimpan tetap sticky (SPEC-003 D4-D6 tidak berubah): Tier berikutnya, Boss Stage yang sudah lulus, dan Skip Test tidak terpengaruh. (3) Peta menampilkan lencana "Ada materi baru" di samping lencana status bila Modul/Tier sudah selesai tetapi persentasenya di bawah 100, dan kartu Modul itu terbuka secara bawaan | Pemilik + AI | C-22 | Pengalaman belajar |
| C-24 | **Pemecahan Modul 1.1** (permintaan human 2026-11-11: Modul 1.1 terlalu panjang, 9 sub-modul): Modul 1.1 dipecah menjadi 3 modul grammar dan nomor modul Tier 1 digeser agar urutan belajar tetap logis (kelas kata, lalu kata kerja dan frasa, lalu tense). Struktur baru Tier 1: `1.1` Nouns & Modifiers (1.1.1 Nouns/Pronouns/Articles/Plurals, 1.1.2 Adjectives & Adverbs), `1.2` Verbs, Prepositions & Phrases (1.2.1 Verbs, 1.2.2 Prepositions & Interjections, 1.2.3 Phrases), `1.3` Tenses & Modals (1.3.1 Present Simple vs. Continuous, 1.3.2 Past Simple vs. Present Perfect, 1.3.3 Simple Future, 1.3.4 Modals), `1.4` Survival Vocabulary & Pronunciation (1.4.1, 1.4.2; semula 1.2.x), `1.5` Basic Comprehension (1.5.1, 1.5.2; semula 1.3.x). Pemetaan kode lama ke baru: 1.1.5→1.1.2, 1.1.6→1.2.1, 1.1.7→1.2.2, 1.1.8→1.2.3, 1.1.2→1.3.1, 1.1.3→1.3.2, 1.1.9→1.3.3, 1.1.4→1.3.4, 1.2.1→1.4.1, 1.2.2→1.4.2, 1.3.1→1.5.1, 1.3.2→1.5.2 (1.1.1 tetap). Struktur kurikulum menjadi 4 Tier, 15 Modul, 40 Sub-Modul. Dampak: (1) urutan rantai gerbang (SPEC-003 D2) Tier 1 menjadi 1.1.1, 1.1.2, 1.2.x, 1.3.x, 1.4.x, 1.5.x; (2) langkah seed `curriculum-renumber-c24` memigrasi database yang sudah ada dengan mengubah kode/modul pada baris yang sama (id sub-modul tetap, sehingga progres, mahkota, riwayat, dan jalur tetap utuh), idempoten, dan tidak berbuat apa pun pada database baru; (3) sumber materi, soal, jalur (`tracks.json`), rujukan antarmateri, dan tes ikut diubah; id soal (`Q-GR...`) tidak diubah agar riwayat jawaban aman | Pemilik + AI | C-22, C-23 | Pengalaman belajar |

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
| 2026-11-10 | Orchestrator | Tambah C-16 (Latihan campur ramah pengguna, layout Profil) |
| 2026-11-10 | Orchestrator | Tambah C-17 (diagram berwarna terang/gelap, bento sesuai isi) |
| 2026-11-10 | Orchestrator | Tambah C-18 (audit layout multi-perangkat dan penyegaran data turunan) |
| 2026-11-10 | Orchestrator | Tambah C-19 (menu Glosarium: verb forms 5 bentuk + istilah) |
| 2026-11-10 | Orchestrator | Tambah C-20 (pengantar dasar di setiap materi dan setiap bagian, callout `:::pengantar`) |
| 2026-11-10 | Orchestrator | Tambah C-21 (numerasi materi, bank soal drill 30 per sub-modul, soal belum muncul diutamakan) |
| 2026-11-11 | Orchestrator | Tambah C-22 (7 sub-modul grammar baru dari slide kursus, jalur GT-GRAMMAR, pelengkap 1.1.1 dan 2.1.1) |
| 2026-11-11 | Orchestrator | Tambah C-23 (persentase Tier/Modul yang sudah selesai ikut menghitung sub-modul baru; lencana "Ada materi baru") |
| 2026-11-11 | Orchestrator | Tambah C-24 (Modul 1.1 dipecah menjadi 3 modul; nomor modul Tier 1 digeser; migrasi database mempertahankan progres) |
