# QA & Security Report: TASK-022 / SPEC-022 Bank Soal + Mix Builder

**Date:** 2026-11-08
**Target Branch:** claude/platform-e2e-learning-3b7c17 (perubahan BELUM di-commit; dibandingkan terhadap 4803c95 + berkas untracked)
**Reviewer:** QA (static review + security, OWASP). Work depth: standard, dengan cakupan tambahan atas permintaan (migrasi, AC-per-AC, OWASP endpoint baru).

**Verdik: PASS-WITH-FIXES.** Tidak ada temuan CRITICAL/HIGH. Aman diteruskan ke Tester setelah 5 temuan MEDIUM ditindaklanjuti atau diterima human secara tertulis. Satu AC (AC-15, bagian E2E Playwright) memang belum terbukti dan menjadi tugas Tester.

Ringkasan temuan: CRITICAL 0, HIGH 0, MEDIUM 5, LOW 9, INFO 3.

## Bukti eksekusi (dijalankan QA, tanpa mengubah kode)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | bersih |
| `npx vitest run` | 61 berkas, 782 tes lulus |
| `npx vitest run -c vitest.integration.config.ts` | 18 berkas, 264 tes lulus (termasuk `mix.itest` 15, `migration-0002.itest` 3, `bank-cli.itest` 3) |
| `npx eslint --max-warnings=0` pada seluruh berkas diubah + berkas baru | 0 galat, 0 peringatan (`schema.ts` hanya "file ignored" bawaan konfigurasi) |
| `npx next build` | OK. `/latihan/campur` (static) dan `/latihan/campur/[attempt_id]` (dynamic) terdaftar; `useSearchParams` aman karena `AuthenticatedLayout` membungkus `Suspense`. Peringatan lint di build hanya pada berkas yang TIDAK diubah (`speaking-pipeline.ts`, `db.ts`, `gatekeeping/service.ts`). |
| `drizzle-kit generate` pada salinan folder `drizzle/` (konfigurasi sementara, sudah dihapus) | "No schema changes, nothing to migrate": snapshot `0002` dan jurnal konsisten dengan `schema.ts`; `generate` berikutnya tidak menghasilkan diff aneh. |
| `vitest run --coverage` | lines 32,47% (< ambang 70%). `vitest.config.ts` TIDAK berubah (exclude tidak melebar). Lihat M-4. |

## 1. Code Quality & Standards
- [x] Pass (dengan catatan MEDIUM/LOW di bawah)
- Penamaan, komentar Indonesia, pola `withApi`, Zod strict, dan struktur modul konsisten dengan konvensi repo. Fungsi seleksi murni (`select.ts`) terpisah dari I/O (`service.ts`); bagus untuk pengujian.
- `vitest.config.ts` tidak disentuh; tidak ada `eslint-disable` baru selain di `db-migrate.ts` (alasan tertulis, path dari konfigurasi lokal) dan komentar yang sudah ada.
- Catatan: tabel "Status Implementasi" dan kotak centang AC di `specifications/022_...md` masih `not_started`/`[ ]` (LOW L-9).

## 2. Security Assessment
- [x] Pass (tidak ada secret hardcoded, tidak ada injeksi, tidak ada IDOR, tidak ada kebocoran kunci)
- Secret: tidak ada literal rahasia pada berkas diubah/baru.
- AuthN/AuthZ: ketiga rute baru `withApi({ auth: 'user' })`; `POST /mix-sessions` memakai `z.strictObject`, batas `count` 5-40, `skills` maks 5, `bank_kinds` maks 12, `question_types` maks 13, `seed` regex `^[A-Za-z0-9_-]{1,64}$`, difficulty 1-5 dengan cek rentang, elemen unik. Tidak ada `user_id` dari klien. CSRF/origin ditangani `withApi` (sudah ada).
- IDOR: `loadLocked` memfilter `attempts.user_id`, `createWritingSubmission` dan `recordExternalSpeakingEvaluation` memeriksa `attempt.userId !== userId -> 404`, `buildMixResult` memfilter `submissions.user_id`, `getActiveMixSession` memfilter `user_id`. Attempt milik profil lain terbukti 404 (`mix.itest` AC-13).
- Kebocoran kunci: DTO publik memakai `toPublicQuestion`; `state` (berisi kunci dan `rng_seed`) tidak pernah diserialisasi; tes negatif pada teks JSON `GET /banks` dan `GET /attempts/{id}` lulus. `explanation_id` baru muncul setelah `PUT .../answers`. `passages[].markdown` tidak berisi kunci.
- SQL mentah: dua pernyataan mentah di `mix/service.ts` (UPDATE ABANDON) memakai parameter terikat (`${userId}`, `${now}`); SQL mentah di `bank-import.ts` statis (tanpa interpolasi masukan).
- Atomisitas ABANDON: UPDATE ABANDON, pembacaan pool, `selectMix`, dan INSERT attempt berada dalam satu `db.transaction` (mutex proses + `BEGIN IMMEDIATE`); bila 422 transaksi di-rollback sehingga sesi lama tidak ter-ABANDON (terbukti `mix.itest`). Balapan dua POST serentak diserialkan mutex; lintas proses (CLI + server) indeks `attempts_one_active_mix_uq` menolak yang kedua (lihat L-3 untuk bentuk galatnya).
- XSS: teks bacaan dan prompt dirender sebagai teks React (`<p>{p.text}</p>`, `whitespace-pre-line`), bukan `dangerouslySetInnerHTML` atau parser Markdown; `?bank=` hanya dicari di daftar bank dari server dan di-`encodeURIComponent` saat dibuat. Aman.
- OWASP (ringkas): A01 Access Control OK; A03 Injection OK; A04 Insecure Design OK (state sisi-server, tak dipercaya klien); A05 Misconfiguration OK; A08 Data Integrity: migrasi tervalidasi `foreign_key_check` dan cadangan; A09 Logging: `logger.error` tanpa data sensitif. Tidak ada dependensi baru (tanpa perubahan `package.json`), jadi pemindaian dependensi tidak relevan.

## 3. Architecture Alignment
- [x] Pass
- Struktur sesuai: `src/server/mix/*`, `src/contracts/mix.ts`, `src/lib/api/mix.ts`, `src/components/mix/*`, rute `(app)/latihan/campur`. Handler dipilih dari `attempts.assessment_type` (spec Technical Flow 4); `STATE_ONLY_TYPES` memusatkan tipe tanpa set. `attempt_answers.assessment_set_id` = `bank_set_id` (FK nyata), bukan id maya.
- Jalur lama (drill, skip, boss, placement) aman: perubahan di `boss.ts`/`placement.ts`/`audio/route.ts` hanya penjaga null; `startAttempt` mengisi `assessmentType` dari set; seluruh 264 tes integrasi lama (attempts, band, skip, boss, placement, resume) tetap hijau; attempt `QUESTION_BANK` yang dimulai lewat `POST /attempts` ditolak `ASSESSMENT_TYPE_NOT_ENABLED` sebelum ada efek tulis.
- Hook: `gamificationHook` dan `runActivityHooks` dilewati untuk MIX (poin 0, tanpa streak); `skillScoreHook` berjalan (radar GRAMMAR/VOCAB/READING terbarui, terbukti); `exam-history` memakai INNER JOIN set sehingga sesi campur tidak muncul di Riwayat (INFO I-1).
- Penyimpangan terdokumentasi dan wajar: runner memakai `ActiveDrill` + `MixPassageCard` (bukan `ReadingWorkspace` yang bermode ujian).

### 3a. Tinjauan migrasi `0002` + `db-migrate.ts` (permintaan #2)
| Aspek | Hasil |
|---|---|
| Kolom/baris | Seluruh kolom lama `assessment_sets` (24) dan `attempts` (20) disalin eksplisit; `attempt_sections` mendapat `id` baru dan 5 kolom baru. Tes membandingkan isi kolom lama sebelum/sesudah pada DB berisi data nyata: identik. |
| FK, indeks | Semua FK, CHECK (`scope_chk` diperluas, `band_chk` dipertahankan), dan 6+6+2 indeks dibuat ulang (dicocokkan dengan baseline `0000`). Tabel anak (`attempt_answers`, `submissions`, `user_last_learned_state`) tidak ikut terhapus; `foreign_key_check` kosong. |
| Trigger/view | Tidak ada trigger di skema. View `v_publish_blockers` di-DROP lalu dibuat ulang identik dengan `0001`. |
| Backfill | `attempts.assessment_type` dari `LEFT JOIN assessment_sets`; yatim akan gagal keras (NOT NULL) dan ter-rollback. Mencakup ACTIVE_DRILL, TIER_BOSS_EXAM (tes); tipe lain (SKIP_*, PLACEMENT, BOSS_SECTION) memakai jalur JOIN yang sama, tidak dipetakan khusus. |
| Cadangan | `VACUUM INTO` sebelum `BEGIN`, dilewati pada instalasi baru dan `:memory:`; nama unik (sufiks bila bentrok); isi cadangan terbukti pra-migrasi. |
| Urutan PRAGMA | `foreign_keys=OFF` sebelum `BEGIN`; `foreign_key_check` sebelum `COMMIT` (galat -> ROLLBACK, migrasi tak tercatat, terbukti tes); `foreign_keys` dipulihkan ke nilai semula di `finally`. |
| Proses mati di tengah | DDL SQLite transaksional: transaksi tak terkomit di-rollback saat dibuka ulang; `_migrations` belum terisi sehingga berjalan ulang dari awal; cadangan tetap ada. Aman. |
| Idempoten | `done.has(tag)` melewati migrasi terapan; instalasi baru menerapkan 0000-0002 tanpa cadangan (terbukti tes). |
| Jurnal/snapshot | Konsisten (lihat bukti `drizzle-kit generate`). |
Catatan kecil migrator: L-4, L-5.

## 4. Matriks 16 AC
| AC | Status | Bukti / catatan |
|---|---|---|
| AC-1 validator + 4 galat | LULUS | `bank-cli.itest` (proses terpisah): bank awal exit 0; fixture rusak memuat `duplicate_question_id`, `answer_not_in_options`, `passage_without_text`, `id_reads_as_variant_slot`. Lihat M-3 (berkas tanpa `bank_contract_version` terlewat diam-diam). |
| AC-2 hitungan bank awal | LULUS | `mix.itest` memeriksa jumlah per `bank_kind` (T1 3x3, T2 9, SPK 9/6/6, RD S1/S2 8, Grammar >= 16). |
| AC-3 MANUAL GRAMMAR 10 + seed | LULUS | `mix.itest`: 10 id unik, semua GRAMMAR, seed sama -> daftar identik. |
| AC-4 proporsi AUTO_WEAKNESS | LULUS | `mix-select.test` (seed 1..200; rentang [0,75;0,92] dan [0,45;0,55]); algoritma ditinjau manual: `W_skill`, rata-rata gap, lantai 0,5 sesuai D5.3. |
| AC-5 bobot T_q, jendela 30 hari | LULUS | `mix-select.test` (jam dikontrol, batas tepat 30 hari, 2x benar berturut-turut dibatalkan satu salah). |
| AC-6 batas AI + 422 | LULUS | unit (kapasitas efektif) + integrasi (`max_available:1` dan pesan tepat; sesi lama tidak ter-ABANDON saat 422). |
| AC-7 gatekeeping tak berubah | LULUS, BUKTI LEMAH | Lihat M-2: snapshot dibandingkan pada pengguna baru tanpa baris progres, sehingga hampir tautologis. Poin 0/`passed` NULL/radar terbarui terbukti nyata. |
| AC-8 tanpa kunci/rng_seed | LULUS | tes negatif teks JSON pada `GET /banks` dan `GET /attempts/{id}`; `explanation_id` muncul hanya setelah dijawab. |
| AC-9 bank 8 soal, count 5 | LULUS DENGAN PENYIMPANGAN | Dibuktikan dengan bank fixture satu teks (bank asli S1 terpecah 3/3/2 paket, S2 4/4). Penyimpangan jujur didokumentasikan; mohon konfirmasi human (M-5). |
| AC-10 DRAFT/Listening | LULUS | DRAFT tak tampil/terpilih; Listening tampil `selectable_in_mix=false` dan tidak pernah dipilih (count 30 semua skill). |
| AC-11 Listening | LULUS | (a),(b),(d) via CLI, (c) via `mix.itest` (`pending_audio` + `--publish` -> DRAFT, `listening_asset_id` NULL). |
| AC-12 idempoten | LULUS | run kedua semua NOOP; perubahan satu soal -> UPDATE dan `version + 1`. |
| AC-13 ABANDON | LULUS | satu IN_PROGRESS tersisa, indeks unik menolak sisipan paksa, `/active` mengikuti, profil lain 404. Tanpa tes balapan serentak (L-6). |
| AC-14 migrasi data nyata | LULUS | `migration-0002.itest`: hitungan dan isi kolom lama identik, `foreign_key_check` kosong, cadangan ada dan berisi pra-migrasi, backfill benar, indeks lengkap. |
| AC-15 guards + unit + integrasi + E2E | TIDAK TERBUKTI PENUH | Guard (rute baru terdeteksi otomatis oleh `endpoint-guards.test`; 401 diuji di `mix.itest`), unit dan integrasi MANUAL/AUTO lulus. E2E Playwright MANUAL + AUTO belum ada (tidak ada berkas `tests/e2e/*mix*`); menjadi tugas Tester. |
| AC-16 Writing/Speaking di sesi | LULUS | 202 + `ai_items.submission_id` terisi, `QUESTION_TYPE_MISMATCH` 409, `QUESTION_REQUIRES_SUBMISSION` 409, `ATTEMPT_NOT_ACTIVE` 409 setelah submit untuk Writing dan Speaking-eksternal. Memakai LLM mock (Ollama nyata belum). |

## 5. Temuan

### CRITICAL
Tidak ada.

### HIGH
Tidak ada.

### MEDIUM
- **M-1. `POST /mix-sessions` berbagi bucket rate limit `attempt_start` (30/jam) dengan pemulaian drill/ujian.** `src/app/api/v1/mix-sessions/route.ts:11`. Bukti: `rateLimit: [{ bucket: 'attempt_start', key: 'user' }]`; bucket didefinisikan `rate-limit.ts:15`. Dampak: belajar campur yang sering (dan POST yang gagal 422 ikut dihitung) dapat menghabiskan kuota yang sama dengan memulai Active Drill/Boss, dan sebaliknya; learner dapat terkunci 429 di luar niat. Saran: bucket tersendiri (mis. `mix_start`, 30/jam) atau hitung hanya POST sukses.
- **M-2. Bukti AC-7 lemah (hampir tautologis).** `tests/integration/mix.itest.ts` (describe "alur attempt MIX_PRACTICE", fungsi `snapshot` dan tes MANUAL). `makeUser` (`tests/integration/helpers.ts:59`) hanya menyisipkan baris `users`, sehingga `user_tier/module/sub_module_progress` kosong sebelum dan sesudah; `before === after` lulus walau kode mengubah progres yang sudah ada. Spec meminta "profil dengan status gatekeeping tertentu". Saran: sebelum sesi, isi progres nyata (mis. selesaikan satu drill atau sisipkan baris `user_sub_module_progress` berstatus tertentu + `user_tier_progress`), lalu bandingkan isi baris, bukan hanya kosong=kosong; tambah cek `user_stats`/`point_ledger` dengan nilai awal non-nol.
- **M-3. Berkas bank tanpa `bank_contract_version` dilewati diam-diam oleh `bank:validate` dan `content:import` (regresi dibanding perilaku lama).** `src/server/content/bank-import.ts:70` (`if (typeof raw === 'object' && raw !== null && 'bank_contract_version' in raw) files.push(...)`). Sebelum perubahan, setiap `*.json` divalidasi dan salah ketik kunci menghasilkan galat skema; kini berkas itu tidak dilaporkan sama sekali dan CLI bisa mengeluarkan "OK" untuk sisanya (atau "Tidak ada berkas bank" bila hanya itu). Dampak: bank yang salah ketik kunci (mis. `bank_contract_versoin`) tidak pernah diimpor tanpa pesan. Saran: laporkan sebagai galat/peringatan `not_a_bank_file` untuk setiap `*.json` (selain `content.json`/`assets.manifest.json`) yang tidak ber-`bank_contract_version` pada folder bank, dan tambahkan tes.
- **M-4. Ambang coverage 70% gagal (32,47%); tes baru memperburuk sedikit.** `npx vitest run --coverage` -> "Coverage for lines (32.47%) does not meet global threshold (70%)". Perkiraan sebelum tugas ini ~33,4% (kegagalan sudah ada sebelumnya akibat migrasi SQLite SPEC-025), jadi bukan regresi baru; namun 853 baris baru (`mix/service.ts` 19/278, `bank-import.ts` 0/336, `mix/state.ts` 15/70) hanya dicakup tes integrasi. Positif: `vitest.config.ts` tidak berubah, exclude tidak melebar (jujur). Saran: putuskan di tingkat proyek (menambah tes unit berbasis SQLite `:memory:` untuk `mix/service` dan `bank-import`, atau menyesuaikan ambang secara eksplisit dan tercatat). Jangan dipecahkan dengan melebarkan `coverage.exclude`.
- **M-5. AC-9 literal tidak dibuktikan pada bank nyata.** Bank awal `READING_GT_S1` (8 soal) terpecah menjadi 3 paket (3/3/2) dan `S2` 2 paket (4/4), sehingga "bank Reading 8 soal, count=5 -> passage_count=1" hanya terbukti dengan bank fixture (`mix.itest` AC-9). Penyimpangan sudah jujur ditulis di dev_log. Saran: minta human mengonfirmasi bahwa D4 (paket per `passage_no`) mengalahkan kalimat AC-9, lalu perbarui teks AC-9 di spec agar tidak membingungkan Tester.

### LOW
- **L-1. Query riwayat AUTO_WEAKNESS tanpa batas.** `src/server/mix/service.ts:117-130` (`loadHistory`) memuat SELURUH `attempt_answers` profil (tanpa batas 30 hari/limit); `correctTwiceInRow` butuh riwayat per soal, tetapi bisa dibatasi ke `question_id` kandidat. Aman untuk skala lokal; makin lambat seiring waktu. Saran: batasi ke id kandidat atau `answered_at >= now - 30d` untuk bagian rasio dan query terpisah dengan `LIMIT 2` per soal.
- **L-2. State attempt besar dibaca dan divalidasi ulang tiap permintaan.** `mix/state.ts:36-44` (`mixQuestions` parse Zod 40 soal + kunci) dan `virtualSetFor` setiap `loadLocked`. Tidak berbahaya; catat untuk performa jika bank membesar.
- **L-3. Pelanggaran indeks unik lintas proses menjadi 500, bukan galat terkendali.** `createMixSession` tidak menangkap `isUniqueViolation` (`db.ts`). Hanya mungkin bila CLI/proses lain menulis `MIX_PRACTICE` IN_PROGRESS bersamaan; dalam proses server mutex mencegahnya. Saran: tangkap dan ulangi sekali atau petakan ke 409.
- **L-4. Deteksi "instalasi baru" hanya dari `_migrations` kosong.** `src/server/db-migrate.ts:62` (`freshInstall = done.size === 0`). DB berisi tabel/data tetapi `_migrations` kosong (mis. hasil pemulihan manual) melewati cadangan padahal `0002` destruktif. Saran: anggap "baru" hanya bila tidak ada tabel pengguna (`sqlite_master`).
- **L-5. `ROLLBACK` dapat menutupi galat asal.** `db-migrate.ts:90-92`: bila SQLite sudah membatalkan transaksi sendiri, `db.exec('ROLLBACK')` melempar "no transaction is active" dan menggantikan pesan asli. Saran: bungkus ROLLBACK dalam try/catch.
- **L-6. Tidak ada tes balapan dua `POST /mix-sessions` serentak** dan tidak ada tes IDOR mix untuk `PUT answers`/`submit`/`result`/`submissions/*` oleh profil lain (hanya `GET attempts/{id}` 404). Kode benar menurut tinjauan (semua memfilter `user_id`); tambahkan tes agar tidak regresi.
- **L-7. `content:import` pada folder gabungan tidak atomik dan peka berkas JSON non-bank.** `import-service.ts` (`runImport`): paket konten dikomit lebih dulu, impor bank di transaksi terpisah; kegagalan bank meninggalkan impor sebagian. `findBankFiles` juga mem-parse setiap `*.json` di folder (JSON rusak non-bank -> exit 1 setelah konten terkomit). Saran: validasi kedua jalur dulu, baru tulis; atau dokumentasikan.
- **L-8. Bank PUBLISHED yang diperbarui tanpa `--publish` tetap PUBLISHED tanpa pemeriksaan penghalang ulang** (`bank-import.ts`, cabang UPDATE). Untuk bank Listening yang aset-nya diganti ke aset manifest berstatus hak `UNVERIFIED`, `v_publish_blockers` tidak dievaluasi ulang. Dampak kecil (Listening tak dapat dipilih di mix). Saran: bila hash berubah pada bank PUBLISHED, jalankan `changeStatus` penghalang atau turunkan ke DRAFT.
- **L-9. Dokumen belum disinkronkan.** Tabel "Status Implementasi" dan kotak centang 16 AC di `specifications/022_spec_question_bank_mix_builder.md` masih `not_started`/`[ ]`; log status task `frontend ready 17:20` bertanggal lebih awal dari log Backend 18:30 dan menyatakan FE "ready for QA" sebelum uji FE-BE nyata. Perbarui oleh PM/Analyst setelah QA.
- **L-10. Dialog "waktu habis" menyesatkan bila sesi ter-ABANDON dari tab lain.** `components/quiz/active-drill.tsx:168,195` memetakan `ATTEMPT_NOT_ACTIVE` ke dialog "waktu habis" (`id.quiz.expiredTitle`), padahal pada sesi campur tanpa batas waktu penyebabnya ABANDON. Saran: pesan khusus bila `time_limit_seconds === 0`.
- **L-11. UX cakupan filter manual.** `mix-builder.tsx`: bila pengguna memilih bank hanya dari skill A tetapi skill B juga aktif, server (filter AND `bank_kinds`) tidak mengambil soal skill B tanpa pemberitahuan; kapasitas klien memang dihitung dari bank terpilih saja, jadi tidak ada galat, hanya kartu skill B "aktif" tanpa efek. Saran: otomatis matikan skill tanpa bank terpilih atau beri keterangan.
- **L-12. Tombol sticky menimpa dasar form skor Speaking di 375px** (diakui FE di dev_log; perilaku `ActiveDrill` yang sudah ada, konten masih dapat digulir). Tidak diverifikasi ulang QA secara visual. Saran: beri `padding-bottom` pada kartu AI atau pindahkan CTA di mode AI.

### INFO
- **I-1.** Sesi campur tidak tampil di `/riwayat` (INNER JOIN set di `skills/service.ts:457`); sesuai spec (tak ada kebutuhan), hanya catatan produk.
- **I-2.** Tanpa `seed`, RNG penarikan berasal dari hash 32 bit atas 16 byte CSPRNG (sesuai D5.6); urutan opsi memakai `newRngSeed()` terpisah dan tidak dikirim ke klien. Benar.
- **I-3.** Writing nyata lewat Ollama dan E2E browser (Playwright) belum diuji; AI memakai LLM mock pada tes integrasi.

## 6. Recommendations (urutan prioritas, untuk Fullstack/Backend/Frontend)
1. M-3: `src/server/content/bank-import.ts:70` (`findBankFiles`): kembalikan isu untuk `*.json` tanpa `bank_contract_version` (kecuali `content.json`, `assets.manifest.json`); tambah tes di `bank-cli.itest.ts`.
2. M-2: `tests/integration/mix.itest.ts` (tes "MANUAL: jawab benar/salah..."): sisipkan progres gatekeeping nyata dan `user_stats` non-nol sebelum sesi; assert baris tak berubah.
3. M-1: `src/app/api/v1/mix-sessions/route.ts:11` dan `src/server/http/rate-limit.ts:15`: bucket tersendiri.
4. M-4/M-5: keputusan human (ambang coverage dan teks AC-9); jangan melebarkan `coverage.exclude`.
5. L-3, L-4, L-5, L-8, L-10: perbaikan kecil opsional sebelum rilis; L-1/L-2 dicatat sebagai utang performa.

## 7. Update Task Status
- Tidak ada blocker keamanan. Kode DAPAT diteruskan ke Tester untuk E2E (AC-15: satu alur MANUAL + satu alur AUTO, termasuk 375px dan sesi dengan Writing/Speaking) setelah Orchestrator/Human memutuskan M-1..M-5 (perbaiki atau terima dengan catatan tertulis). Bila M-2/M-3 tidak diperbaiki, status akhir sebaiknya tetap PASS-WITH-FIXES (bukan PASS).
- QA tidak mengubah kode, tidak men-stage/commit, dan tidak meninggalkan server hidup (`next build` selesai; berkas sementara `drizzle-kit`/coverage sudah dihapus atau berada di folder yang di-ignore git).
