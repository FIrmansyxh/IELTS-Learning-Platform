# Dev Log TASK-014 Boss Stage

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W7)
Dikerjakan terhadap `specifications/014_spec_boss_stage.md` dan `_api-contract.md` (FINAL). Backend paralel; integrasi nyata belum diuji.

### Yang dibuat (semua di `codes/`)
- **Skema klien** `src/lib/api/boss-contract.ts` memakai `SectionDTOSchema`, `BossResultSchema`, `BossGateSchema`, `ExamIntroFullSchema` dari `src/contracts/exams.ts` (ditambahkan Backend selama pekerjaan ini; klien dialihkan ke sana) dan hanya mendefinisikan blok yang belum ada di berkas bersama: intro `boss`, respons `start` dan `submit` section. `src/lib/api/boss.ts` (`bossApi.startSection/submitSection`), `src/lib/api/exams.ts` (`ExamIntroFullSchema` + `boss`/`placement`). Respons yang tidak cocok melempar `RESPONSE_INVALID`; tidak ada penambalan.
- **Intro** `exam/boss/boss-intro.tsx` (dipakai `ExamIntroView`): gerbang ("Lulus bila band ... >= 5,0" / "akurasi ... >= 80%"), urutan section dengan badge "Menentukan kelulusan"/"Masukan", total waktu, `advisory_note`, `last_result`, checklist audio+mikrofon (pra-cek audio SPEC-011 dipakai ulang), "Sudah lulus" tanpa tombol bila `BOSS_ALREADY_PASSED`; 409 `BOSS_NOT_AVAILABLE`/`BOSS_ALREADY_PASSED` dan 429 cooldown/batas harian tampil sebagai Dialog.
- **Alur bersegmen** `exam/boss/boss-runner.tsx` (dipilih oleh `ExamRunner` untuk `TIER_BOSS_EXAM`): layar transisi `SectionGate` ("Section n dari N", durasi, aturan, "Mulai Section") -> `POST .../sections/{id}/start` -> section berjalan -> `POST .../submit` -> `SectionDone` ("Section X selesai" + "Lanjut", tanpa tombol kembali) -> ... -> "Lihat Hasil" memanggil `POST /attempts/{id}/submit`. Section `ACTIVE` saat muat ulang dilanjutkan otomatis lewat `start` idempoten (jawaban tersimpan ikut kembali). `SECTION_ORDER_VIOLATION`/`SECTION_ALREADY_DONE` memuat ulang daftar section dari server; `ATTEMPT_EXPIRED`/`ATTEMPT_NOT_ACTIVE` mengirim attempt lalu membuka hasil; `SECTION_EXPIRED` pada simpan jawaban menutup section lewat submit idempoten dan menampilkan Dialog "Waktu section habis".
- **Listening/Reading** memakai `ExamSession` yang sama (ExamShell, Navigator, ReadingWorkspace, ListeningPlayer) lewat pengikat `section` baru: "Selesai Section" memanggil submit section (bukan submit attempt), timer dari `section.deadline_at`, soal/teks/audio/jawaban tersimpan dari payload `start`. `listening.audio_url` dipakai apa adanya (server menyertakan `?section=<id>`); uji memastikan atribut `src` audio memuat query itu.
- **Writing/Speaking** `exam/boss/ai-section.tsx`: `AiTaskSlot` (WritingTask/SpeakingTask SPEC-012/013) dengan `attempt_id` dan `question_id` section, timer section, "Selesai Section" (Dialog: tugas yang belum dikirim tidak dinilai), kirim otomatis saat waktu habis dengan percobaan ulang tiap 3 dtk.
- **Hasil** `exam/boss/boss-result.tsx` (dipilih oleh `ExamResultView` bila `result.boss` ada): `BandBadge` besar `boss_band`, Lulus/Belum lulus (ikon + teks), baris gerbang ("Target Band 5,0, hasil Anda 6,0" / "Target 80%, hasil Anda 57,50%"), kartu Listening/Reading ("Skor mentah 16/20 -> setara 32/40 -> Band 7,5", Badge "Menentukan kelulusan", `BandConversionTable` dari `GET /band-tables/active` hanya bila `table_id` sama dengan `band_table_ids`), kartu Writing/Speaking (spinner "Menunggu penilaian AI", atau band + Badge "Masukan (tidak menentukan kelulusan)" + tautan `/riwayat/penilaian/{id}`, atau "Tidak dikerjakan"), `overall_band_estimate` dengan `EstimasiNotice`, daftar "Terbuka" + "Buka Tier n+1", atau pesan suportif + keterampilan terlemah + jam coba lagi + "Kembali ke Peta". Tinggi kartu W/S dan blok Overall tetap (tanpa layout shift saat AI selesai).
- **Polling** di `ExamResult`: `refetchInterval` 10 dtk selama `pending_ai > 0`, berhenti setelah 10 menit sejak halaman dibuka lalu menawarkan "Periksa lagi" (memulai jendela 10 menit baru). Galat pengambilan ulang tidak membuang hasil yang sudah tampil.
- **Peta**: tombol "Boss Stage" sudah ada sejak TASK-003 (aktif hanya bila `boss.available`, tautan ke `/ujian/mulai/{set induk}`; terkunci/lulus dengan alasan); tidak diubah.
- Teks Indonesia di `src/i18n/id.ts` (namespace `boss`, `exam.intro.blocked`, `apiErrors` kode baru). `ExamShell` mendapat prop `labels` opsional; `GroupedFooter` mendapat `submitLabel`.

### Uji (Frontend)
`src/components/exam/boss/boss.test.tsx` (26 tes: intro, alur section, resume, Writing/Speaking, SECTION_EXPIRED, order violation, galat jaringan, hasil lulus/gagal/PERCENT/BAND, tabel band, polling dengan fake timer termasuk berhenti 10 menit), `src/lib/api/boss-placement-contract.test.ts` (contoh spec).

### Verifikasi (di `codes/`)
| Perintah | Hasil |
|---|---|
| `tsc --noEmit` | bersih |
| `eslint src tests --max-warnings=0` | bersih |
| `vitest run` | 59 berkas, 893 tes lulus (sebelum pekerjaan ini: 53 berkas, 786 tes) |
| `test:integration` | tidak dijalankan (di luar lingkup Frontend) |

### Catatan untuk Backend (drift/ketidakjelasan kontrak; TIDAK ditambal di klien)
1. Skema intro blok `boss` (`BossIntroSchema`), respons `start`/`submit` section (`StartSectionResponseSchema`, `SubmitSectionResponseSchema`), dan blok `placement` pada intro (`PlacementIntroSchema`) masih hanya di `src/lib/api/boss-contract.ts` / `placement-contract.ts` (klien). Mohon dipindahkan ke `src/contracts/exams.ts` bila server perlu memvalidasi keluaran dengan skema yang sama; klien cukup mengalihkan impor.
2. `GET /attempts/{id}` untuk Boss: klien selalu masuk section lewat `start` (idempoten) dan hanya membaca `sections` dari attempt; `questions` attempt Boss tidak dipakai.
3. `listening.audio_url` dipakai apa adanya; klien tidak menambahkan `?section=`. Pastikan selalu menyertakannya.
4. Kartu Writing/Speaking membedakan "menunggu AI" dari "tanpa band" hanya lewat `pending_ai > 0` (agregat) dan `submission_ids`. Bila ada dua submission dengan satu sudah dinilai, kartu yang belum bernilai tetap tampil menunggu sampai `pending_ai = 0`. Usul aditif: status per section (`ai_status`).
5. Link "Lihat umpan balik" memakai `submission_ids[0]` per section.
6. Cooldown 429 pada start Boss memakai kontrak SPEC-008 yang sudah ada (`details[0].message` berisi ISO waktu) seperti Skip.
7. `last_result.boss_band` dan `score_percent` diperlakukan tidak null sesuai contoh spec.

### Belum diverifikasi
- Integrasi dengan Backend nyata; audio Boss nyata (`?section=`, 206/Range) di peramban; perekaman mikrofon; E2E Playwright 375x812 (tanpa scroll horizontal) dan kontras terang/gelap secara visual (hanya token tema dipakai, tidak ada warna baru); pembaca layar nyata.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 14:50 | Frontend W7: intro Boss, alur section, hasil + polling AI |

## [BACKEND] 2026-11-03 15:00 (Backend Engineer, wave W7)
Target spec: `specifications/014_spec_boss_stage.md`. Status: selesai (mock LLM/STT; Postgres 16 lokal).

### Ringkasan implementasi
- **Handler `TIER_BOSS_EXAM`** (`codes/src/server/exams/boss.ts`, terdaftar di `attempts/handlers.ts`): `start` (D2 lewat `bossState` GatekeepingService, `BOSS_NOT_AVAILABLE` TIER_LOCKED/MODULES_INCOMPLETE, `BOSS_ALREADY_PASSED`, cooldown/batas harian memakai `exams/gate.ts` SPEC-008 dengan kunci = set induk), membekukan gerbang Tier di `attempts.state.boss`, membuat `state.sections` (PENDING), `section_order`, `question_section`, baris `attempt_sections` (hook `afterCreate`) dan `deadline_at` = mulai + jumlah time_limit + 1800 s (hook `deadlineSeconds`). `intro`, `score`, `onFinish` (lihat di bawah).
- **Section** (`attempts/sections.ts`): `POST /attempts/{id}/sections/{section}/start|submit` (route baru). Satu transaksi + `SELECT ... FOR UPDATE` pada attempt. `start` memeriksa 404 (bukan anak), `ATTEMPT_NOT_ACTIVE`, `ATTEMPT_EXPIRED` (setelah commit penilaian), menutup otomatis section ACTIVE yang kedaluwarsa, `SECTION_ALREADY_DONE`, `SECTION_ORDER_VIOLATION`; mengaktifkan section (soal diacak dengan seed attempt+section, pemetaan opsi opak; hanya soal section itu yang tersaji); `start` pada section ACTIVE = resume tanpa mengubah `started_at/deadline_at`, memuat jawaban tersimpan. `submit`: idempoten untuk section DONE, `SECTION_NOT_ACTIVE` untuk PENDING, EXPIRED bila lewat batas.
- **PUT answers** (`attempts/service.ts` memakai `bossAnswerGate`): soal dicari lewat `question_section`; `SECTION_NOT_ACTIVE` (PENDING/DONE), `SECTION_EXPIRED` (section ditutup EXPIRED dan state di-commit lebih dulu), jawaban disimpan dengan `assessment_set_id` = set anak.
- **Penilaian akhir** (`handler.score` -> `scoreBoss`, fungsi murni di `exams/boss-rules.ts`): section ACTIVE diselesaikan dari jawaban tersimpan, PENDING = skor 0 (EXPIRED); L/R: `scaleToForty` + `convertRawToBand` (tabel aktif LISTENING / READING_ACADEMIC saat submit); gerbang BAND `bossBand >= nilai` dan PERCENT `(L.raw+R.raw)*100 >= nilai*(L.max+R.max)` dalam bilangan bulat sentesimal; `attempts.band_score = boss_band`, `band_table_id` NULL, `result_json.boss.band_table_ids`. `onFinish`: `GatekeepingService.applyBossResult` (Tier COMPLETED + Tier berikutnya UNLOCKED `BOSS_PASS` lewat recompute), audit `BOSS_PASSED`/`BOSS_FAILED` (`tier_number`, `boss_band`, `percent`), retry/cooldown; `attemptCompletedHooks` dipanggil sekali oleh mesin generik. Mesin generik `finalize` kini memanggil `handler.score` bila ada.
- **Hasil** (`decorateBossResult`): `boss.sections[].band` W/S dan `overall_band_estimate` (D8: hanya `AI_LOCAL`, `overall_band` terisi, bukan `injection_suspected`) serta `pending_ai` dan `submission_ids` dihitung ulang pada setiap `submit`/`GET result`; tidak pernah mengubah `passed`. `review` selalu null, tanpa kunci jawaban/pembahasan.
- **DTO** `GET /attempts/{id}` dan `POST /attempts`: `sections` (SectionDTO), `questions`/`passage_markdown`/`listening` hanya milik section ACTIVE; `listening.audio_url` memuat `?section=<id>`.
- **Integrasi Writing/Speaking**: `ai/context.ts` (`resolveAttemptQuestion`) mengenali Boss (soal dari set anak, section harus ACTIVE: `SECTION_NOT_ACTIVE`/`SECTION_EXPIRED`); `ai/pipeline.ts` (`resolveMinWords`) memakai set anak.
- **Audio**: `attempts/audio.ts` (SPEC-011 sudah mendukung `?section=`) ditambah penolakan 409 `ATTEMPT_NOT_ACTIVE` bila section ACTIVE sudah lewat deadline + 5 s.
- **Kontrak**: `src/contracts/exams.ts` ditambah `ExamIntroFullSchema`, `SectionDTOSchema`, `SectionParamsSchema`, `BossResultSchema`; kode error baru di `http/errors.ts`; `exams/service.ts` memakai `overrides` intro.
- Refaktor kecil tanpa perubahan perilaku: `loadLocked`/`loadAnswers`/`loadAudio` dipindah ke `attempts/store.ts`, `isExpired`/`AnswerOutcome` ke `attempts/dto.ts` (menghindari impor melingkar).

### Berkas
Baru: `src/server/exams/boss.ts`, `boss-rules.ts`, `src/server/attempts/sections.ts`, `store.ts`, `src/app/api/v1/attempts/[attempt_id]/sections/[section_set_id]/{start,submit}/route.ts`, `tests/unit/boss-rules.test.ts` (21), `tests/integration/boss.itest.ts` (31).
Diubah: `attempts/{service,dto,engine,handlers,hooks,audio}.ts`, `exams/service.ts`, `ai/{context,pipeline}.ts`, `http/errors.ts`, `contracts/exams.ts`, `tests/integration/attempts.itest.ts` (tes "tipe tanpa handler" tidak lagi memakai PLACEMENT/Boss karena kini terdaftar).

### Catatan teknis
- Tanpa migrasi/skema baru. Semua perubahan kontrak aditif; keputusan interpretasi dicatat di Revision History spec 014 dan `_api-contract.md`.
- Untuk FE: `start` mengembalikan `ATTEMPT_EXPIRED` bila attempt sudah lewat; `GET /attempts/{id}` menutup section kedaluwarsa (phase DONE); `sections/submit` pada attempt yang sudah selesai -> 409 `ATTEMPT_NOT_ACTIVE`; polling `GET result` boleh dilakukan selama `pending_ai > 0`.
- Belum diverifikasi: E2E Playwright (Boss Tier 1 fixture), pemutaran audio peramban nyata, set Boss hasil impor `content:import` (hanya fixture DB), admin SPEC-020 (larangan menyunting set yang punya attempt IN_PROGRESS), `OllamaClient`/Whisper nyata.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 15:00 | Backend W7: Boss Stage (section, penilaian band, gerbang Tier, D8, audit) selesai; tsc/eslint bersih, vitest 59 berkas/893 tes, test:integration 19 berkas/461 tes lulus |

## [FRONTEND] Perbaikan QA W7 (2026-11-03 15:20)
- F-14-07 (selesai): `BossRunner` memasang `beforeunload` selama mounted (attempt IN_PROGRESS) sehingga merata di layar transisi, layar selesai, dan section Writing/Speaking; dilepas saat navigasi ke hasil (`allowLeave`) dan saat unmount. Tes: aktif di gate/selesai/Writing, dilepas setelah unmount.
- F-14-08 (selesai dengan fallback): field aditif backend (submission id evaluasi terbaru per section) BELUM ada di spec 014/`_api-contract.md` saat dikerjakan (diperiksa). Fallback: `feedbackSubmissionId()` di `boss-result.tsx` memakai elemen TERAKHIR `submission_ids` (kontrak mengurutkan `created_at` naik, jadi terbaru). Tes dengan dua id. Bila backend menerbitkan field/urutan baru, ubah hanya fungsi itu.
- F-14-09 (ditunda, bergantung backend): `ai_status` per section belum ada; kartu W/S masih memakai `pending_ai` agregat. Setelah field terbit di kontrak (`src/contracts/exams.ts` milik backend), bedakan "menunggu AI" vs "tanpa band" per section di `AdvisoryCard`.
- F-14-13 FE (selesai): tes waktu-habis Writing dan Speaking (kirim otomatis ke `sections/submit` tepat sekali lalu layar selesai) dan tes `beforeunload` Boss.
- Ditunda/bukan FE: F-14-01..06 (backend), F-14-10/11 (INFO, dokumentasi/backend), F-14-12 (INFO, memindah skema intro/start/submit ke `src/contracts/exams.ts` = area backend; koordinasi), F-14-13 butir 1-3 (integrasi/server).
- Verifikasi: tsc bersih; eslint src tests --max-warnings=0 bersih; vitest 59 berkas, 897 tes: 896 lulus, 1 gagal di `tests/unit/placement-rules.test.ts` ("Tier 4 dibatasi clamp", server/SPEC-015, bukan area FE, di luar perubahan ini; dilaporkan ke koordinator).

| 2026-11-03 15:20 | Frontend W7: perbaikan QA F-14-07/08(fallback)/13(FE); F-14-09 ditunda menunggu field backend |

## [BACKEND] Perbaikan QA W7 (2026-11-03 15:40, Backend Engineer)
Sumber: `qa_report.md` TASK-014. Perubahan kontrak/skema hanya aditif (migrasi 0009 = indeks unik parsial; field hasil baru opsional).
- F-14-01 (selesai): migrasi `drizzle/0009_qa_w7_boss_unique_published.sql` (arsipkan duplikat PUBLISHED lama lalu buat `assessment_sets_boss_child_skill_uq` dan `assessment_sets_boss_tier_published_uq`; juga di `src/db/schema.ts`); guard `assertBossIntegrity` di `bossHandler.start` (500 terlog) dan `intro` (404) untuk data lama; blocker publish `BOSS_DUPLICATE_PUBLISHED` (`content/publish.ts`).
- F-14-02 (selesai): `activateSection(..., attemptDeadline)` -> `deadline_at` section = `min(mulai + time_limit, attempts.deadline_at)`; spec 014 D4 diamandemen.
- F-14-03 (selesai): `rawMaxOfSection` dan `scoreObjectiveSection` menjepit raw <= max; submit tidak lagi 500 bila set berubah saat attempt berjalan.
- F-14-05 (selesai): bucket `section_action` (30/menit/user) pada `sections/start|submit` dan `exam_intro` (30/menit/user) pada `GET /exams/{id}/intro`.
- F-14-08/09 (selesai, aditif): `boss.sections[]` memperoleh `latest_submission_id`, `graded_submission_id`, `ai_status` (`NOT_SUBMITTED|PENDING|GRADED|NO_BAND`; null untuk Listening/Reading). `submission_ids` TETAP urut naik (tidak diubah agar fallback FE tidak patah). Terdokumentasi di spec 014 dan `_api-contract.md`; Zod `BossResultSchema` (nullable + optional).
- Tes baru: `tests/unit/boss-rules.test.ts` (jepit raw), `tests/integration/boss.itest.ts` blok "QA W7" (unique index, blocker, guard, deadline section, raw>max x2, rate limit, field hasil, NOT_SUBMITTED). `makeBoss` kini mengarsipkan Boss PUBLISHED sebelumnya pada Tier yang sama (indeks unik).
- Ditunda (dicatat): F-14-04 (oracle skor agregat; risiko diterima, ADR-003 #32), F-14-06 (hitung ulang D8 di `finalize()`; wajib sebelum SPEC-016), F-14-07 (FE, sudah ditutup FE), F-14-10/11/12 (INFO, dokumentasi/kontrak Zod), F-14-13 butir 1-2 (tes serentak/kepemilikan sections; sebagian ditutup tes baru).
- Verifikasi (di `codes/`): lihat Revision History.

### Revision History (perbaikan QA W7)
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 15:40 | Backend QA W7: F-14-01/02/03/05/08/09 diperbaiki; migrasi 0009; field hasil Boss aditif; hasil verifikasi: tsc bersih; eslint src tests scripts --max-warnings=0 bersih; vitest 59 berkas/905 tes lulus; test:integration 19 berkas/484 tes lulus (sebelumnya 461) |

## [FRONTEND] Perbaikan QA W7 lanjutan (2026-11-03 16:05)
- **F-14-08/09 ditutup di klien.** `exam/boss/boss-result.tsx`: `feedbackSubmissionId()` kini memakai `graded_submission_id ?? latest_submission_id` dari `AttemptResult.boss.sections[]` (field aditif Backend, `nullable().optional()` di `src/contracts/exams.ts`), dengan fallback ke elemen terakhir `submission_ids` bila kedua field tidak ada. `advisoryState()` memakai `ai_status` (`PENDING` = spinner "Menunggu penilaian AI"; `NO_BAND`/`GRADED` tanpa band = "Belum ada band dari AI untuk tugas ini."; `NOT_SUBMITTED` = "Tidak dikerjakan"); tanpa `ai_status` dipakai heuristik lama (`pending_ai`).
- Tes baru di `exam/boss/boss.test.tsx`: urutan prioritas tautan (graded > latest > submission_ids) dan pembeda PENDING/NO_BAND/NOT_SUBMITTED walau `pending_ai` sama.

