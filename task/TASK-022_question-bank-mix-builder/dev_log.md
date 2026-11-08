# Dev Log TASK-022: Bank Soal Modular dan Mix Builder

Spec: `specifications/022_spec_question_bank_mix_builder.md`

## 0. Kontrak untuk Frontend (ditulis paling awal, 2026-11-08 17:00, Backend Engineer)

Berkas kontrak Zod yang dapat langsung diimpor FE (`codes/src/contracts/`):
- `mix.ts` (BARU): `MixRequestSchema`/`MixRequest` (body `POST /api/v1/mix-sessions`), `MixSessionSchema`/`MixSessionResponseSchema`, `MixResultSchema`/`MixResult` (`data.mix` pada hasil), konstanta `MIX_SKILLS`, `MIX_QUESTION_TYPES`, `MIX_COUNT_MIN/MAX`.
- `question-bank.ts` (DIPERLUAS): `BANK_KINDS` + `LISTENING_GT_S1..S4`, `BankListItemSchema`/`BanksResponseSchema` (`GET /api/v1/banks`), `MIX_BANK_KINDS`, `isListeningBankKind`.
- `attempts.ts` (DIPERLUAS, aditif): `assessment_set_id` kini NULLABLE (attempt `MIX_PRACTICE`), `passages[]` (`{ passage_no, bank_set_id, markdown }`) pada `Attempt`, `bank_code` pada `QuestionPublic`, `mix` pada `AttemptResult`.
- `common.ts`: `AssessmentType` += `QUESTION_BANK`, `MIX_PRACTICE`, `MOCK_TEST`, `TRACK_CHECKPOINT`.

Kode `details[].code` validasi mix: `unrecognized_key`, `too_small`, `too_big`, `invalid_value`, `invalid_type`, `difficulty_range_invalid` (sesuai spec; token ditambahkan ke `src/server/http/zod-errors.ts`). `422 MIX_NOT_ENOUGH_QUESTIONS` membawa `details[0].code = "max_available:<n>"`.

Tambahan atas pertanyaan Frontend (nama field AKHIR): `QuestionPublic.passage_index` (int 0-based ke `Attempt.passages[]`, null bila bukan Reading; urutan `passages[]` = kemunculan pertama pada `questions[]`), `GET /api/v1/mix-sessions/active` (`ActiveMixSessionResponseSchema`: `data` = `{ attempt_id, mode, question_count, answered_count, started_at }` atau `null`), `Attempt.title` MIX_PRACTICE = "Latihan campur: N soal (Skill, ...)" / "Latihan campur otomatis: N soal", `time_limit_seconds` MIX_PRACTICE = 0. Serah-terima FE: pasangkan soal Reading ke paket lewat `passages[question.passage_index]` (bukan menebak urutan); `mixApi.active()` baru dapat menggantikan penanda `localStorage`. Kontrak tercatat di `_api-contract.md` 0b dan Revision History spec 022.

Rincian Backend ada di bagian "Backend" di bawah.

## Frontend (2026-11-08, Frontend Engineer)

### Ringkasan
UI Latihan Campur selesai terhadap kontrak Backend (`src/contracts/mix.ts`, `question-bank.ts`, `attempts.ts`); tidak ada tipe lokal tersisa (tidak ada utang sambungan kontrak).

### Berkas
- BARU `codes/src/app/(app)/latihan/campur/page.tsx` (Mix Builder) dan `.../[attempt_id]/page.tsx` (sesi + hasil satu rute).
- BARU `codes/src/components/mix/`: `mix-builder.tsx`, `mix-session.tsx` (sesi, kartu teks bacaan, pemuat hasil), `mix-result.tsx`, `mix-utils.ts` (kapasitas, pembentuk body, pemetaan paket Reading, penanda sesi aktif) + tes `mix-utils.test.ts`, `mix-builder.test.tsx`, `mix-session.test.tsx` (33 tes).
- BARU `codes/src/lib/api/mix.ts` (`mixApi.banks/start`, `parseMaxAvailable`); jawab/submit/hasil memakai `attemptsApi` apa adanya.
- UBAH `codes/src/components/quiz/active-drill.tsx`: prop opsional `contextSlot` (konten di atas kartu soal) dan timer total disembunyikan bila `time_limit_seconds = 0`. Perilaku drill lain tidak berubah (tes lama lulus).
- UBAH `codes/src/app/nav.config.ts` (item "Latihan campur", ikon Shuffle, `matchPrefix: '/latihan'`), `codes/src/i18n/id.ts` (blok `mix`, `nav.mix`, galat `MIX_NOT_ENOUGH_QUESTIONS`), `codes/src/components/shell/shell.test.tsx` (asersi tautan baru).

### Keputusan UI
- Rute: `/latihan/campur` (builder) dan `/latihan/campur/[attempt_id]` (sesi berjalan; attempt selesai menampilkan hasil dari `/result`). Berada di grup `(app)` (kerangka sidebar/bottom-nav), bukan mode ujian, karena ini Active Drill dengan umpan balik instan.
- Runner: memakai ulang `ActiveDrill` (umpan balik instan; kartu Writing/Speaking lewat `QuestionRenderer` yang sudah mengirim `attempt_id`/`question_id`). SIMPANGAN dari spec UI: `ReadingWorkspace` tidak dipakai karena bersifat mode ujian (tanpa umpan balik per soal, redirect ke `/ujian/.../hasil`); teks bacaan ditampilkan dengan `MixPassageCard` (bisa dilipat, panel gulir sendiri) di atas soal Reading.
- Default Analyst: sesi baru -> dialog konfirmasi bila ada sesi aktif; tanpa poin (teks "tidak menambah poin atau streak"); bank Listening tampil terkunci (`selectable_in_mix=false`) dan tanpa kartu skill; kondisi kosong, galat memuat (Coba lagi), 422 (`Hanya N soal tersedia untuk pilihan ini.`, penggeser dikunci ke N), galat server (Toast + Coba lagi).
- Pilihan bank manual -> `bank_kinds` (API menyaring per `bank_kind`, bukan `bank_code`); memilih bank ikut membatasi tipe dan batas jumlah. Melepas skill melepas bank skill itu (filter AND di server). `?bank=<bank_code>` pada builder memilih bank itu (dipakai tombol "Latih bank ini" di saran hasil).
- Campur otomatis mengirim `{ count, mode: 'AUTO_WEAKNESS' }` saja (semua skill).
- Deteksi sesi aktif: penanda `localStorage` `mix.active-attempt` (hanya ID attempt, bukan data sensitif) diverifikasi lewat `GET /attempts/{id}` (`MIX_PRACTICE` + `IN_PROGRESS`); dibersihkan saat selesai/tidak valid. Server tetap sumber kebenaran (POST mem-ABANDON sesi lama).
- A11y: kartu skill dan chip `aria-pressed` (ikon centang + teks, bukan warna saja), slider native berlabel + `aria-valuetext`, `role="alert"` untuk galat 422/kapasitas, `role="status"` untuk skeleton/banner/hasil kosong, fokus ke `<h1>` hasil, tombol lipat teks `aria-expanded`/`aria-controls`.

### Pertanyaan / catatan untuk Backend (tidak mengubah kontrak)
1. Pemetaan teks Reading: `passages[]` berkunci `bank_set_id` tetapi soal publik hanya membawa `bank_code` + `passage_no`. FE memasangkan kelompok soal Reading berurutan (bank_code, passage_no) dengan `passages[k]` menurut urutan; jika jumlah kelompok tidak sama, jatuh ke `passage_no`. Aman bila `passages[]` diurutkan menurut urutan pertama muncul di `questions[]`. Usul: tambah `bank_set_id` (atau `passage_index`) pada soal publik agar tidak bergantung pada urutan. WAJIB: urutan `passages[]` = urutan paket pada `questions[]`.
2. Tidak ada endpoint "sesi campur aktif"; FE memakai penanda peramban. Bila profil dipakai di peramban lain banner tidak muncul (konfirmasi tidak ditampilkan, tetapi server tetap meng-ABANDON sesi lama). Opsional: `GET /mix-sessions/active`.
3. `attempt.title` untuk MIX_PRACTICE dipakai sebagai `aria-label` sesi; mohon isi bermakna (mis. "Latihan campur").
4. `time_limit_seconds` MIX_PRACTICE diasumsikan 0 (tanpa batas); FE menyembunyikan timer total untuk 0.

### Verifikasi
- `tsc --noEmit` bersih; eslint berkas FE yang diubah tanpa temuan; `npx vitest run` 781 lulus (61 berkas; 33 tes baru FE); `next build` OK (rute `/latihan/campur` dan `/latihan/campur/[attempt_id]` terdaftar).
- Visual (dev server port 3025, DB sementara; sudah dihentikan): builder desktop (sidebar tidak menutup konten) dan 375px (tanpa overflow horizontal, `scrollWidth = clientWidth`), sesi dengan teks bacaan di 375px, umpan balik, hasil. Karena endpoint Backend belum ada saat itu, respons `GET /banks`, `POST /mix-sessions`, dan attempt dipalsukan lewat `window.fetch` di peramban; belum diuji ke endpoint Backend nyata (endpoint kini ada; perlu uji integrasi/E2E QA).
- AC FE terbukti oleh tes komponen: kartu skill/chip tipe/slider/otomatis (body request), 422 `max_available`, kosong/galat/loading, bank Listening terkunci, konfirmasi sesi aktif, runner dengan teks bacaan per paket, hasil per skill/tipe + item AI + saran bank + disclaimer, tanpa lulus/poin.
- Belum terverifikasi: alur nyata FE-BE (E2E), soal Writing/Speaking di dalam sesi terhadap endpoint submission nyata, layar tablet.


## Backend (2026-11-08, Backend Engineer)

### Ringkasan
Seluruh subtask BE selesai: migrasi `0002` + migrator diperluas, kontrak Zod, validator + impor bank CLI, `selectMix`, layanan sesi campur, tiga endpoint, perluasan attempt/AI, kode galat, tes. Status task tetap `in_progress` karena E2E Playwright (AC-15) belum dijalankan (di luar area BE).

### Berkas
- BARU `codes/drizzle/0002_spec_022_question_banks.sql` (+ `meta/0002_snapshot.json`, jurnal): hasil `drizzle-kit generate --name spec_022_question_banks` lalu DITINJAU dan diedit tangan (lihat Keputusan).
- UBAH `src/db/schema.ts`: `assessmentType` += 4 nilai; `assessment_sets` (+`bank_code`, `bank_kind`, `exam_module`, `tags`, indeks, CHECK scope bank); `attempts` (set nullable, `assessment_type`, CHECK `attempts_set_required_chk`, tiga indeks unik aktif per tipe); `attempt_sections` (`id`, set nullable, kolom waktu, dua indeks unik).
- UBAH `src/server/db-migrate.ts`: penanda `-- migrator: foreign_keys=off` (cadangan `VACUUM INTO` ke `<folder DB>/backups/pre-<tag>-<epoch>.db`, `PRAGMA foreign_keys=OFF` sebelum `BEGIN`, `foreign_key_check` sebelum `COMMIT`, pemulihan `foreign_keys` di `finally`).
- BARU `src/server/mix/`: `select.ts` (selectMix murni), `service.ts` (listBanks, createMixSession, getActiveMixSession, buildMixResult), `state.ts` (state `mix.v1`, set maya, judul), `handler.ts` (handler `MIX_PRACTICE`).
- UBAH `src/server/attempts/{service,dto,handlers,engine}.ts` (attempt tanpa set, handler dari `attempts.assessment_type`, `data.mix`, `passages`, `bank_code`, `passage_index`; `serveQuestion` diekspor), `src/server/gamification/service.ts` (lewati tipe state-only), `src/server/ai/service.ts` + BARU `src/server/ai/attempt-questions.ts` (soal dari `attempts.state` bila tanpa set; pengiriman ke attempt campur non-IN_PROGRESS = 409), `src/server/exams/{boss,placement}.ts` dan `attempts/[id]/audio/route.ts` (null-guard `assessmentSetId`), `src/server/http/{errors,zod-errors}.ts`.
- UBAH `src/contracts/{common,attempts,question-bank}.ts`, BARU `src/contracts/mix.ts`.
- BARU `src/server/content/bank-import.ts`, UBAH `bank-validate.ts`, `import-service.ts` (`runImport` kini menerima folder bank), `scripts/bank-validate.ts`, `scripts/content-import.ts` (`validate` untuk folder bank).
- BARU rute: `api/v1/banks`, `api/v1/mix-sessions`, `api/v1/mix-sessions/active`.
- Tes BARU: `tests/unit/mix-select.test.ts` (19), `tests/integration/{mix,migration-0002,bank-cli}.itest.ts` (15+3+3). UBAH: tiga INSERT mentah di `band.itest.ts`/`skip.itest.ts` (kolom `assessment_type` baru NOT NULL), `question-bank.test.ts` (kode baru).

### Keputusan dan DEFAULT Analyst yang dipakai
1. Mix tidak memberi poin/mahkota/streak (`gamificationHook` dan hook aktivitas dilewati untuk tipe state-only `MIX_PRACTICE`/`MOCK_TEST`/`TRACK_CHECKPOINT`).
2. Sesi baru meng-ABANDON sesi `IN_PROGRESS` lama dalam transaksi yang sama (rollback bila 422).
3. Bank Listening muncul di `GET /banks` dengan `selectable_in_mix=false`, tidak masuk pool, dan `LISTENING` ditolak 400 pada body.
4. `difficulty` kosong dianggap 3.
5. Migrasi `0002` disunting dari keluaran drizzle-kit: PRAGMA dibuang, qualifier tabel pada CHECK dibuang (aman untuk RENAME), `INSERT..SELECT` hanya kolom lama (`assessment_type` dari `LEFT JOIN` set sehingga yatim gagal keras), indeks `attempts_user_started_idx` diperbaiki (bug drizzle `"started_at" desc`), `DROP VIEW`/buat ulang `v_publish_blockers`.
6. Cadangan pra-migrasi dilewati pada instalasi baru (belum ada migrasi terpasang) dan DB `:memory:`; tidak dipangkas oleh retensi harian (nama tidak cocok pola).
7. Writing/Speaking tak punya `is_correct`: `T_q = 1`; `AUTO_WEAKNESS` tanpa radar = seragam; paket Reading = (bank, `passage_no`) dari pool TERFILTER, dimasukkan urut menurut bank (soal terpilih bisa tak ikut bila paket terpotong, sesuai D5.4).
8. State attempt memuat bidang `mix.v1` DAN bidang mesin soal (`v`, `order`, `served`, `last_resume_at`, `pass_percent`) agar layanan attempt lama berfungsi tanpa percabangan besar; `option_order` = ID opaque tersaji.
9. Kode validasi: token spec (`too_small`, `too_big`, `invalid_value`, `difficulty_range_invalid`) dipetakan lewat tambahan `CUSTOM_MESSAGES` di `zod-errors.ts` (tidak mengubah kode endpoint lain).
10. Validator: `variant_slot_id` diganti `id_reads_as_variant_slot`; `passage_without_text` ditambahkan.
11. `content:import` pada folder bank: berkas bank = `*.json` ber-`bank_contract_version`; folder tanpa `content.json` hanya mengimpor bank. `--publish` melewati `pending_audio`.

### Penyimpangan dari spec
- AC-9 literal ("bank Reading 8 soal, count=5 -> passage_count=1"): bank awal repo memecah 8 soal menjadi 3 paket teks (S1: 3/3/2) dan 2 paket (S2: 4/4), jadi AC-9 dibuktikan dengan bank fixture satu teks; pada bank nyata `passage_count` = jumlah paket yang terbawa.
- `POST /submissions/speaking-external` hanya mensyaratkan attempt `IN_PROGRESS` untuk attempt TANPA set (campur); attempt bersuku set tidak diubah demi menghindari regresi Boss/drill.
- `MIX_NOT_ENOUGH_QUESTIONS` memakai rate limit bucket `attempt_start` (30/jam) untuk `POST /mix-sessions`.
- Hook `skillScoreHook` tidak diubah: bekerja karena skill diambil dari `attempt_answers.skill`; `set` maya (`virtualSetFor`) dipakai hanya sebagai pembawa tipe/judul.

### Verifikasi (per AC)
Otomatis hijau: AC-1 (`bank-cli.itest`), AC-2 (`mix.itest` hitungan per kind + `question-bank.test`), AC-3, AC-6, AC-8, AC-9 (fixture), AC-10, AC-12, AC-13, AC-16 (`mix.itest`), AC-4, AC-5 (`mix-select.test`), AC-7 (gatekeeping/ledger/stat tak berubah, `user_skill_scores` terbarui), AC-11 (a,b,d via CLI; c via `mix.itest`), AC-14 (`migration-0002.itest`, data nyata), AC-15 sebagian (endpoint-guards otomatis menemukan 3 rute baru; unit + integrasi mix MANUAL dan AUTO lulus).
Angka: tsc bersih; `vitest run` 782 lulus (61 berkas, termasuk tes FE); integrasi 264 lulus (18 berkas; baseline 243); `next build` OK; eslint berkas yang diubah tanpa temuan.
Belum terbukti: E2E Playwright MANUAL + AUTO (AC-15, bagian E2E); uji asli ke Ollama untuk Writing campur (memakai LLM mock); dampak coverage `src/server` tidak diukur ulang (tes unit baru untuk logika murni `selectMix`, layanan DB tercakup di tes integrasi).

### Perbaikan pasca-QA (2026-11-08)
- M-1 diperbaiki: bucket `mix_start` (30/jam) di `rate-limit.ts`, dipakai `POST /mix-sessions`; tercatat di `_api-contract.md` bagian 3; tes 429 + kuota `attempt_start` utuh.
- M-2 diperbaiki: tes AC-7 kini memakai progres nyata (tier UNLOCKED, modul IN_PROGRESS, sub-modul COMPLETED/SILVER/80, `user_stats` 120 poin/streak 3, satu baris `point_ledger`), memastikan tidak tautologis, lalu membuktikan progres, `user_stats`, dan `point_ledger` identik sesudah sesi selesai.
- M-3 diperbaiki: `findBankFiles` melapor `bank_contract_version_missing` untuk setiap `*.json` tanpa kunci itu (exit 1 di `bank:validate`, `content:validate`, `content:import`). Pengecualian: folder paket konten murni (ada `content.json`, tanpa satu pun berkas bank) boleh memuat JSON lain. Tes salah-ketik di `bank-cli.itest`.
- M-5: AC-9 mengikuti D4 (paket utuh per `passage_no`). Tes AC-9 memakai bank fixture + satu tes pada bank asli S1 (paket 3/3/2: paket non-terakhir utuh, terakhir terpotong, tidak ada paket ganda/terpecah, `passage_count` = jumlah paket); komentar tes diperbarui.
- L-4 diperbaiki: "instalasi baru" = tak ada migrasi tercatat DAN tak ada tabel aplikasi; DB pemulihan dengan `_migrations` kosong tetap dicadangkan (tes).
- L-5 diperbaiki: `ROLLBACK` dibungkus try/catch; pesan memuat galat asal + catatan bila ROLLBACK gagal (tes).
- L-6 sebagian: tes IDOR profil lain untuk `submit`, `result`, `PUT answers` (404). Tes balapan serentak belum.
- L-7: `content:import` folder gabungan TETAP tidak atomik (dua transaksi), didokumentasikan di kode; dikurangi risikonya dengan dry-run validasi bank SEBELUM paket konten ditulis.
- Artefak tes: `codes/.local-pg/assets` berisi 13 berkas fixture kecil (PNG/PDF 18-78 byte) dari tes integrasi karena `setup-env.ts` memakai `ASSETS_DIR ??=` sehingga nilai `codes/.env` menang. Sumber diperbaiki (`setup-env.ts` kini selalu folder temp), folder lama dihapus; tidak ada berkas baru tertulis setelah perbaikan.
- Utang (ditunda): M-4 (ambang coverage; keputusan proyek, `coverage.exclude` tidak diubah), L-1 (riwayat AUTO tanpa batas), L-2 (parse state tiap permintaan), L-3 (pelanggaran indeks unik lintas proses menjadi 500), L-8 (bank PUBLISHED yang diperbarui tidak mengevaluasi ulang penghalang), L-9 (sinkronisasi dokumen spec: PM/Analyst), L-10..L-12 (UI, milik Frontend), tes balapan serentak.
- Verifikasi ulang: tsc bersih; eslint berkas diubah 0 temuan; `vitest run` 782 lulus; integrasi 269 lulus (18 berkas); `next build` OK.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-08 | Implementasi Backend SPEC-022 (migrasi 0002, bank, mix, endpoint, tes) |
| 2026-11-08 | Perbaikan QA: M-1, M-2, M-3, M-5, L-4, L-5, bucket `mix_start`, ASSETS_DIR tes |

### Frontend, putaran 2 (serah-terima Backend + uji NYATA end-to-end)
- Disambungkan: teks Reading memakai `passages[question.passage_index]` (`passageForQuestion`; pemasangan berbasis urutan dihapus); banner "Lanjutkan sesi" dan dialog konfirmasi memakai `mixApi.active()` (`GET /mix-sessions/active`); ketergantungan localStorage dihapus. Tes diperbarui (termasuk paket Reading + Grammar campur) dan ditambah kasus ABANDONED dan "tanpa sesi aktif".
- Perbaikan FE dari uji nyata: (1) membuka attempt ABANDONED menampilkan galat hasil menyesatkan -> kini pesan "Sesi ini dihentikan karena Anda memulai sesi baru." dengan tautan kembali; (2) kartu teks bacaan berjudul "Teks 1" dari parser -> judul tetap "Teks bacaan", judul `# ...` asli ditampilkan di badan teks.
- Uji nyata (dev server port 3025, DB temp, `db:migrate` + `db:seed` + `content:import content/gt-bank --publish` = 10 bank, profil dibuat lewat UI; server dihentikan, DB temp di folder scratchpad): builder memuat 5 skill/tipe/bank nyata (Reading 16, Writing 18, Speaking 21 soal); MANUAL Grammar+Reading 12 soal dijawab sampai selesai (tipe isian, cari kesalahan, TFNG, jawaban singkat, teks bacaan tampil) -> hasil per skill/tipe + saran bank, tanpa poin; muat ulang halaman hasil OK; AUTO_WEAKNESS 10 soal sampai selesai di 375px (tanpa overflow, `scrollWidth = clientWidth`) dengan item Writing/Speaking "Belum dikirim" + disclaimer; banner sesi aktif dari server; "Mulai latihan" saat aktif -> dialog -> sesi lama jadi ABANDONED dan hanya satu sesi aktif; kartu Speaking nyata + form skor -> `POST /submissions/speaking-external` 201 dan item menjadi "Sudah dinilai". Desktop (sidebar tidak menutup konten) dan 375px dicek.
- Tidak ditemukan bug BE. Catatan: sticky tombol "Lanjut" menimpa bagian bawah form skor Speaking di 375px (perilaku Active Drill yang sudah ada, konten tetap bisa digulir). Writing nyata (butuh AI) tidak diuji; AI_ENABLED=false.
- Verifikasi akhir: tsc bersih; eslint berkas FE tanpa temuan; vitest 782 lulus; next build OK.
