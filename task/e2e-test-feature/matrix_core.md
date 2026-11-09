# MATRIKS AC -> E2E: Domain A "Inti Belajar" (SPEC-003 s.d. SPEC-009)

Tanggal: 2026-11-09 | Penguji: Tester E2E (Playwright) | Aplikasi: lokal satu perangkat (SPEC-025), SQLite, tanpa login/admin.

Legenda kolom **Jalur**:
- **E2E** = diuji di browser (berkas `codes/tests/e2e/core-*.spec.ts`); sebagian AC ditunjang pemanggilan API publik oleh tes (konten tetap diuji lewat UI + API nyata).
- **ITEG** = hanya lapisan API/layanan; sudah ada di `codes/tests/integration/*.itest.ts` (tidak diulang di browser).
- **UNIT** = tes unit/komponen Vitest (`codes/src/**/*.test.tsx`, `codes/tests/unit`).
- **N/A** = tidak relevan lagi (digantikan SPEC-025: login, admin, Postgres) atau di luar domain.

Aturan konten uji: runner `tests/e2e/helpers/run-e2e.mjs` mengimpor `content/gt-listening`, `content/gt-bank`, `content/gt-modules/3.3.3`. Kebutuhan lebih (banyak sub-modul, set Skip, Boss, video/slide/lampiran) dipenuhi paket SINTETIS `codes/tests/fixtures/e2e-content/core/` yang diimpor lewat CLI `content-import.ts` oleh `tests/e2e/helpers/core.ts`.

## SPEC-003 Skill Tree & Gatekeeping

| # | AC / Edge case | Jalur | Berkas / tes | Catatan |
|---|---|---|---|---|
| 003-1 | Pengguna baru: Tier 1 UNLOCKED, sub pertama UNLOCKED (DEFAULT), berikutnya LOCKED `PREVIOUS_INCOMPLETE`, Tier 2-4 `TIER_LOCKED` | E2E + ITEG | core-tree "profil baru..." (API), "peta belajar..." (UI popover); `gatekeeping.itest.ts` | Pesan `lock_reason` diperiksa persis |
| 003-2 | Lulus drill 75 -> COMPLETED, berikutnya UNLOCKED, best_score, attempts | E2E + ITEG | core-tree "lulus drill...", core-drill; `gatekeeping.itest.ts`, `attempts.itest.ts` | `applyDrillResult` murni (74.99, 80->60, idempoten, 10 paralel) hanya ITEG |
| 003-3 | 74.99 tetap IN_PROGRESS; best 80 lalu 60; panggilan ganda; paralel 10x | ITEG | `gatekeeping.itest.ts` | Tidak dapat dipicu murni dari UI (skor datang dari soal) |
| 003-4 | Rantai melewati sub-modul DRAFT (COMING_SOON) | E2E + ITEG | core-tree "rantai melewati..." (Tier 4: 4.2.2 belum terbit) | |
| 003-5 | `assertSubModuleAccessible`: LOCKED 403 `LOCKED_CONTENT`, DRAFT/ARCHIVED/tak dikenal 404 | E2E + ITEG | core-tree "akses langsung..." | ARCHIVED hanya ITEG |
| 003-6 | Boss tersedia saat semua modul selesai; `applyBossResult` lulus/gagal | E2E (tersedia) + ITEG | core-tree "...Boss Stage terbuka..." ; core-band (hasil Boss); `gatekeeping.itest.ts` | Efek lulus Boss Tier 2 UNLOCKED: domain Ujian + ITEG |
| 003-7 | Skip Modul/Tier lulus -> SKIPPED, level berikutnya terbuka | E2E + ITEG | core-skip | |
| 003-8 | Modul dengan sub IN_PROGRESS: `skip_test.available=false` | E2E + ITEG | core-skip "skip tidak tersedia setelah dimulai" | |
| 003-9 | `applyPlacementResult` | N/A domain A | domain Ujian (SPEC-015) + `gatekeeping.itest.ts` | |
| 003-10 | Sub-modul baru terbit setelah pengguna terdaftar: baris dibuat otomatis | ITEG | `gatekeeping.itest.ts` | Praktis tercakup E2E: semua profil dibuat sebelum/sesudah impor tanpa galat |
| 003-11 | COMPLETED/SKIPPED sticky saat modul dapat sub baru | ITEG | `gatekeeping.itest.ts` | |
| 003-12 | Dua `applyDrillResult` serentak tanpa deadlock | ITEG | `gatekeeping.itest.ts` | |
| 003-13 | `POST /admin/users/{id}/progress/unlock` (admin API) | N/A | digantikan CLI `progress unlock` (dipakai semua spec lewat `unlockCode`) | SPEC-025 D6/D7 |
| 003-14 | Kinerja tree p95 < 300 ms, <= 8 query | ITEG | `gatekeeping.itest.ts` | |
| 003-15 | Lint impor tabel progres | N/A (statis) | ESLint | |
| 003-16 | E2E peta: ketuk node terkunci -> Popover alasan Indonesia; 375x812 tanpa scroll horizontal | E2E | core-tree "peta belajar..." desktop + mobile | |
| 003-17 | UI: Boss Stage nonaktif + alasan (Tooltip/sr-only), Uji Kompetensi hanya bila tersedia, modul `aria-expanded`, "Segera hadir" tidak dapat diklik | E2E | core-tree | |
| 003-E1 | Tier tanpa sub-modul AVAILABLE: progress 0, `MODULES_INCOMPLETE` | ITEG | `gatekeeping.itest.ts` | |
| 003-E2 | `mini_task_json {}` -> `has_mini_task=false` | ITEG | `gatekeeping.itest.ts` | |
| 003-E3 | Akun DISABLED -> 401 | N/A | tidak ada akun/peran lagi (SPEC-025) | Tanpa sesi: 401 diuji `home.spec.ts` |

## SPEC-004 Content Foundation (sisi UI/CLI)

| # | AC | Jalur | Berkas | Catatan |
|---|---|---|---|---|
| 004-1 | Seed 4 tier/13 modul/31(33) sub-modul, status DRAFT, idempoten | ITEG | `baseline.itest.ts`, `cli.itest.ts` | Konstanta ADR-004 menjadi 33 sub-modul |
| 004-2 | Nilai Tier (gate, ambang skip 85) | ITEG | `gatekeeping.itest.ts` | Tampil di UI: header Tier (Target Band), ambang Skip pada dialog |
| 004-3 | `content:validate` Golden Sample + hitungan | ITEG | `content.itest.ts` | |
| 004-4 | `content:import` pertama DRAFT, kedua NOOP; audit | E2E (tak langsung) + ITEG | `helpers/core.ts` `ensureCoreContent()` mengimpor paket sintetis lewat CLI dua kali (draf lalu `--publish`) dan memuatnya di peta/pemutar | |
| 004-5 | `--publish` dengan video UNVERIFIED -> exit 2 `ASSET_UNVERIFIED` | E2E (temuan) + ITEG | `ensureCoreContent()` menemui exit 2 nyata; lihat laporan: **tidak ada perintah CLI untuk memverifikasi video** | Bug/celah alat |
| 004-6 | Semua aset terverifikasi -> `--publish` sukses; tampil di `/peta` | E2E | seluruh core-*.spec | |
| 004-7 | Validasi galat (answer_not_in_options, duplicate_question_id, `__proto__`, path_traversal, mime_mismatch, unsafe_link_scheme, ...) | ITEG/UNIT | `content.itest.ts`, `src/server/content/*.test.ts` | Skema `javascript:` ditolak impor (terlihat saat menyusun fixture) |
| 004-8 | UPDATE set PUBLISHED: version +1 + revisi | ITEG | `content.itest.ts` | |
| 004-9 | Placement 24 soal -> PLACEMENT_BANK_TOO_SMALL; Boss butuh L+R | ITEG | `content.itest.ts` | |
| 004-10 | Struktur 33 sub-modul tag `exam` (ACADEMIC tersembunyi di GT) | E2E tak langsung | core-tree (3.3.1/4.1.1 tidak tampil) | Tidak ada asersi khusus |

## SPEC-005 Pemutar Materi Multimodal

| # | AC / Edge case | Jalur | Berkas / tes |
|---|---|---|---|
| 005-1 | GET sub UNLOCKED -> 200, IN_PROGRESS, artikel, `LEARN_NOT_COMPLETED` | E2E + ITEG | core-player "alur belajar nyata", "Latihan terkunci..." |
| 005-2 | LOCKED -> 403 tanpa data materi; DRAFT/ARCHIVED 404; `9.9.9` 404; `abc` 400 | E2E + ITEG | core-tree "akses langsung" |
| 005-3 | Payload tanpa `ai_rubric_criteria`, `storage_key`, `sha256`, `external_url` | E2E + ITEG | core-player "artikel..." |
| 005-4 | Clamp elapsed (10 detik -> <=10); ping pertama 5; salvo | E2E (ping pertama, salvo) + ITEG | core-player "Latihan terkunci..." ; ITEG untuk elapsed 10 s |
| 005-5 | `learn-complete`: subtab_not_visited, insufficient_active_time, sukses, idempoten | E2E (409 awal + sukses 60 s nyata + idempoten) + ITEG | core-player |
| 005-6 | Tanpa video/slide + 60 s -> 200; VIDEO tanpa konten 400 `subtab_unavailable` | E2E + ITEG | core-player |
| 005-7 | 31 ping/menit -> 429 | ITEG | `player.itest.ts` |
| 005-8 | Mini-Task SELF_CHECK (200/409 LEARN_NOT_COMPLETED/AI 409) | E2E (SELF_CHECK) + ITEG | core-player "Mini-Task SELF_CHECK" |
| 005-9 | Aset slide 200 + nosniff + ETag + 304; DOCUMENT attachment; AUDIO/terkunci 404/403 | E2E (slide, dokumen, 404) + ITEG | core-player "aset" |
| 005-10 | Render aman: `<script>`, `javascript:`, gambar Markdown | E2E (gambar dibuang, tanpa javascript:) + UNIT | core-player "artikel"; `markdown-article.test.tsx` (`<script>` dan `javascript:` ditolak validator impor, jadi tidak dapat disuntik lewat fixture) |
| 005-11 | Callout `:::tips-examiner` | E2E + UNIT | core-player "artikel" |
| 005-12 | `video_id` korup tidak membuat player | UNIT + ITEG | `video-card.test.tsx`, `player.itest.ts` (data korup dibuang server) |
| 005-13 | E2E: baca artikel, buka Video & Slide, >= 60 detik aktif, Selesai Belajar -> Latihan aktif; 375x812 tanpa scroll horizontal | E2E (jam nyata, bukan jam dipercepat: server memotong dengan jam nyata) | core-player "alur belajar nyata" desktop + mobile |
| 005-14 | CSP: tanpa pelanggaran untuk youtube-nocookie / skrip IFrame API | E2E (parsial) | core-player "video": konsol browser diperiksa saat IFrame API (di-stub) dimuat; hosting nyata YouTube tidak dijangkau (luring) |
| 005-E | Tab tersembunyi / tanpa interaksi tidak menambah detik | UNIT | `use-active-learn-timer` (tidak ada hook E2E untuk `visibilityState` sungguhan) |
| 005-E | `end_sec <= start_sec`: tanpa `end` | UNIT | `youtube.ts` tes |
| 005-E | `If-None-Match` tak cocok -> 200; file hilang -> 404 | E2E (If-None-Match) + ITEG | core-player "aset" |
| 005-UI | Carousel slide (indikator n/total, Prev/Next, panah keyboard, alt, region carousel) | E2E | core-player "Slide" |
| 005-UI | Video: label bagian, nocookie, playerVars, rasio 16:9, gagal -> pesan + Buka di YouTube + Coba lagi, offline | E2E (YouTube di-stub lewat `page.route`) | core-player "video" |

## SPEC-006 Mesin Soal & Active Drill

| # | AC | Jalur | Berkas / tes |
|---|---|---|---|
| 006-1 | `POST /attempts` 201 PRACTICE, `current_index 0`, `LEARN_NOT_COMPLETED` 409 | E2E + ITEG | core-drill, core-player |
| 006-2 | Resume `resumed=true`, urutan & `option_id` identik | E2E (refresh) + ITEG | core-drill "refresh di tengah drill" |
| 006-3 | `ASSESSMENT_TYPE_NOT_ENABLED`/`SECTION_NOT_STARTABLE` | ITEG | `attempts.itest.ts` (kini semua tipe punya handler) |
| 006-4 | Payload tanpa kunci terlarang sebelum dijawab | E2E (jaringan diamati) + ITEG | core-drill "payload" |
| 006-5 | Dua attempt: urutan berbeda (statistik 20) | ITEG | `attempts.itest.ts` |
| 006-6 | Umpan balik per soal (Benar!/Kurang tepat, jawaban benar, pembahasan) | E2E | core-drill |
| 006-7 | Kunci tak dikenal 400; time_spent_ms 400 | ITEG | `attempts.itest.ts` |
| 006-8 | Normalisasi FILL ("  Are   Sorted. "), > max_words salah | E2E (batas kata + penghitung) + ITEG | core-drill "10 tipe soal" |
| 006-9 | MATCHING parsial (3 dari 4), MCQ_MULTI himpunan persis, REORDER, ERROR_RECOGNITION, TFNG/YNNG | E2E + ITEG | core-drill "10 tipe soal" |
| 006-10 | WRITING_TASK 409 `QUESTION_REQUIRES_SUBMISSION`; soal AI dikecualikan | ITEG | `attempts.itest.ts` |
| 006-11 | Jawaban terkunci PRACTICE (409 `QUESTION_ALREADY_ANSWERED`) | ITEG | `attempts.itest.ts` |
| 006-12 | Submit: 8/10 -> 80.0 lulus COMPLETED; 7/10 -> 70.0 gagal; 3/4 = 75.00 persis lulus | E2E + ITEG | core-drill (3/4 = 75% lulus; 2/4 gagal; 10 tipe 11/14 lulus) |
| 006-13 | Submit ganda / hook sekali | ITEG | `attempts.itest.ts` |
| 006-14 | EXAM: deadline, feedback null, review tanpa kunci; `ATTEMPT_EXPIRED` (jam + 301 s) | E2E (Skip, kedaluwarsa nyata 30 s) + ITEG | core-skip |
| 006-15 | Rate limit 61 PUT/min, 30 start/jam | ITEG | `attempts.itest.ts` |
| 006-16 | E2E negatif: set drill LOCKED -> 403 | E2E | core-drill "gerbang" |
| 006-17 | E2E drill: panel umpan balik tiap soal, hasil Lulus, "Sub-Modul Berikutnya", refresh melanjutkan, 375x812 tanpa overflow | E2E | core-drill desktop + mobile |
| 006-18 | Keyboard saja: MCQ, MATCHING dropdown, REORDER (Naik/Turun) | E2E | core-drill "keyboard" |
| 006-UI | Pintasan 1-4/A-D + Enter, hasil: ambang garis, mahkota/poin, "Ulangi Latihan"/"Tinjau Materi", akordeon tinjauan | E2E | core-drill |
| 006-UI | Seret-lepas MATCHING (desktop), dropdown (mobile < 768px) | E2E | core-drill |
| 006-E | Dua set drill PUBLISHED; set 1 soal; PRACTICE > 24 jam ABANDONED | ITEG | `attempts.itest.ts`, `player.itest.ts` |

## SPEC-007 Resume / Lanjutkan Belajar

| # | AC | Jalur | Berkas / tes |
|---|---|---|---|
| 007-1 | PUT video 222 -> GET `RESUME` "Video 03:42" + `resume_path` | E2E (YouTube di-stub, detik nyata) + ITEG | core-resume "video" |
| 007-2 | DRILL soal 4 dari 10 + `q=3&attempt=` | E2E + ITEG | core-resume "drill" |
| 007-3 | Attempt GRADED: tanpa q/attempt; attempt user lain NULL; normalisasi; video bukan milik 400; LOCKED 403; PUT ke-31 429 | ITEG | `resume.itest.ts` |
| 007-4 | Pengguna baru: `FALLBACK_NEXT`, tab LEARN, path `?tab=pelajari` | E2E + ITEG | core-resume "profil baru" |
| 007-5 | Tersimpan COMPLETED -> fallback ke UNLOCKED berikutnya; ARCHIVED -> fallback; semua selesai -> `data null` | E2E (COMPLETED, semua selesai) + ITEG | core-resume |
| 007-6 | E2E: tonton video >= 20 detik, tutup tab, `/`, Lanjutkan -> video di posisi (<= 3 detik) dan < 10 detik | E2E (stub IFrame API; waktu klik->player siap diukur) | core-resume |
| 007-7 | E2E: keluar di soal 4, Lanjutkan -> soal 4, jawaban 1-3 tersimpan | E2E | core-resume |
| 007-8 | Empty state: hanya satu tombol primary "Mulai dari Tier 1"; Placement tersembunyi bila tak tersedia | E2E (semua sub-modul selesai) + E2E (respons API dimock untuk "pengguna baru") | core-resume |
| 007-9 | Aksesibilitas ResumeCard: nama tombol "Lanjutkan Belajar: {judul}", `aria-valuenow`; kontras 4.5:1 | E2E (nama + valuenow); kontras = UNIT/manual | core-resume |
| 007-10 | p95 < 150 ms, 1 round trip | ITEG | `resume.itest.ts` |
| 007-11 | Posisi ujian tidak muncul di kartu | E2E | core-skip |
| 007-E | Dua perangkat, offline, 401 saat sesi habis, DISABLED | N/A / UNIT | (login dihapus SPEC-025); offline pada `use-position-recorder` UNIT |

## SPEC-008 Skip Test (Uji Kompetensi)

| # | AC | Jalur | Berkas / tes |
|---|---|---|---|
| 008-1 | Intro: `available`, ambang 85, scope, jumlah soal; layar pra-ujian | E2E + ITEG | core-skip "intro" |
| 008-2 | Sub-modul IN_PROGRESS -> 409 `SKIP_NOT_AVAILABLE`, intro tidak tersedia | E2E + ITEG | core-skip "tidak tersedia setelah dimulai" |
| 008-3 | 201 EXAM, deadline tepat, soal tanpa kunci, PUT feedback null | E2E (jaringan diamati) + ITEG | core-skip |
| 008-4 | Lulus 6/6 -> SKIPPED (SKIP_TEST), modul SKIPPED, sub pertama modul berikutnya UNLOCKED, peta "Dilewati" | E2E + ITEG | core-skip "lulus modul" |
| 008-5 | 85.00 lulus / 84.99 gagal (batas) | ITEG (E2E: 5/6 = 83,33 gagal, 6/6 lulus) | `skip.itest.ts` |
| 008-6 | Gagal: `skip.passed=false`, next_allowed_at +60 menit, sisa 2; intro Mulai disabled; 429 `COOLDOWN_ACTIVE` + Retry-After | E2E + ITEG | core-skip "gagal + cooldown" |
| 008-7 | Batas harian ke-4 -> 429 `DAILY_ATTEMPT_LIMIT`; cooldown 0 (setting) mengizinkan langsung | E2E (setting via CLI) + ITEG | core-skip "batas harian" |
| 008-8 | Attempt IN_PROGRESS -> resume tanpa hitungan; "Lanjutkan Ujian" | E2E + ITEG | core-skip "lanjutkan ujian" |
| 008-9 | Kedaluwarsa: PUT -> 409 `ATTEMPT_EXPIRED`, dinilai dari jawaban tersimpan; 0 jawaban = 0.00 gagal | E2E (30 detik nyata) + ITEG | core-skip "kedaluwarsa" |
| 008-10 | Submit serentak sekali; kunci terlarang `passed`/`score` 400; attempt orang lain 404; set DRAFT 404 | ITEG | `skip.itest.ts` |
| 008-11 | Skip Tier lulus: Tier SKIPPED, isi SKIPPED, Tier berikutnya UNLOCKED | E2E + ITEG | core-skip "tier" |
| 008-12 | Hasil EXAM tanpa kunci/benar-salah per soal (`review: null`, amandemen F-08-01) | E2E (jaringan + UI) + ITEG | core-skip |
| 008-13 | E2E: lulus -> peta semua sub "Dilewati"; gagal -> jam coba lagi + Mulai disabled | E2E | core-skip |

## SPEC-009 Band Converter

| # | AC | Jalur | Berkas / tes |
|---|---|---|---|
| 009-1 | Seed: 1 tabel aktif per skill, 17 baris menutup 0..40; konversi 25/26/29/30/0/40 dan 14/15/18/19/26/27 | ITEG | `band.itest.ts` (tabel Academic dan General) |
| 009-2 | Vektor `overallBand`, `bossBand`, `scaleToForty`, `roundToHalfBand`, error `(41,40)` | UNIT | `src/server/band/*.test.ts` |
| 009-3 | `GET /band-tables/active` untuk learner 200, disclaimer | E2E (API) + ITEG | core-band |
| 009-4 | Admin: `POST/GET/DELETE /admin/band-tables`, activate, 403 learner | N/A | digantikan CLI `band list|activate|import` (SPEC-025 D6/D7); ITEG `band.itest.ts`, `cli.itest.ts` |
| 009-5 | Hasil lama tidak berubah saat tabel diaktifkan | ITEG | `band.itest.ts` |
| 009-6 | UI hasil: `EstimasiNotice` selalu terlihat pada layar yang memuat band; skor mentah -> Band; Boss band | E2E | core-band (hasil Boss Tier 4: Listening/Reading 4 soal -> skala 40 -> band) |
| 009-7 | E2E admin: simpan versi dengan celah disabled | N/A | admin UI dihapus |
| 009-E | Hasil 0 benar = band 0.0 | E2E | core-band |
