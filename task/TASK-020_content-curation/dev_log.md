# Dev Log TASK-020 Admin Kurasi Konten

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W8)
Dikerjakan terhadap `specifications/020_spec_content_curation.md` dan `_api-contract.md` (FINAL). Request/response yang sudah ada di `src/contracts/curation.ts` (curriculum, quality, change status, daftar revisi, SetRef, Blocker) dipakai langsung; respons lain belum ada di berkas bersama sehingga didefinisikan di `src/lib/api/curation-contract.ts` (lihat catatan Backend). Integrasi nyata belum diuji.

### Yang dibuat (semua di `codes/`)
- **API klien** `src/lib/api/curation.ts` (curriculum, sub-module detail, PATCH modul/sub-modul/material/set/soal, status, sets, quality, revisions).
- **`/admin/konten/kurikulum`** `admin/curation/curriculum-panel.tsx`: pohon Tier > Modul > Sub-Modul, Badge status ikon + teks ("Draf", "Direviu", "Disetujui", "Terpublikasi", "Arsip"), Badge merah "{n} penghalang" (membuka sheet), baris set Drill/Uji Kompetensi/Boss/Placement dengan status, jumlah soal, versi, "Ubah status" dan "Buka set". Tab Kurikulum | Soal | Revisi (`curation-tabs.tsx`).
- **Ubah status** `status-dialog.tsx`: pilihan hanya perpindahan yang diizinkan K1; untuk `AI_GENERATED_REVIEWED` Checkbox wajib "Saya telah meninjau konten buatan AI ini" (body memuat `confirm_reviewed`); 409 `PUBLISH_BLOCKED` menampilkan daftar penghalang bertaut (aset/set/sub-modul); 409 `REVIEW_CONFIRMATION_REQUIRED` memunculkan kotak centang untuk set yang origin-nya tidak ada di daftar; `INVALID_STATUS_TRANSITION` dkk. berpesan Indonesia.
- **Sheet sub-modul** `sub-module-sheet.tsx`: judul, urutan, ambang lulus 1-100, artikel Markdown + pratinjau memakai `MarkdownArticle` (renderer aman SPEC-005), atribusi, editor Mini-Task (tipe/perintah/rubrik, hapus), daftar penghalang, aset video/slide/lampiran baca-saja dengan `RightsBadge` + tautan ke aset, set Drill, tautan Riwayat revisi. Hanya field yang berubah dikirim (PATCH sub-modul dan material terpisah); sub-modul `PUBLISHED` meminta konfirmasi "Perubahan langsung terlihat oleh Learner"; galat per field (`aria-describedby`, `aria-invalid`) dari `details[]` (`raw_html_not_allowed`, `unsafe_link`, `ORDER_INDEX_TAKEN`); konfirmasi buang perubahan saat menutup (`use-discard-guard.tsx`). Sheet modul (`module-sheet.tsx`): judul + urutan.
- **`/admin/konten/soal`** (`sets-panel.tsx`): tabel set + filter jenis/status/tier/cari judul, paginasi, kartu di mobile. **`/admin/konten/soal/[set_id]`** (`set-detail.tsx`): pengaturan set (judul, batas waktu, ambang, teks bacaan hanya bila ada), daftar soal dengan Badge kualitas `TOO_HARD`/`TOO_EASY` (ikon + teks + "% benar dari n jawaban") dari `GET .../quality` (gagal dimuat tidak menghalangi), banner terkunci K3 ("Set ini memiliki attempt berjalan; penyuntingan dinonaktifkan.") setelah 409 `SET_HAS_ACTIVE_ATTEMPTS` (kontrol dinonaktifkan; "Coba lagi" membuka kembali), ubah status set, tautan revisi.
- **Sheet soal** `question-sheet.tsx` (+ `question-model.ts`): field sesuai tipe (MCQ dengan penanda jawaban benar per baris opsi, TF/NG & YN/NG select, isian/jawaban singkat, matching, reorder, error recognition; Writing/Speaking hanya prompt + penjelasan), `question_type`/`skill`/`question_id` tidak pernah dikirim, hanya field berubah, null untuk nilai opsional yang dikosongkan, pratinjau baca-saja dengan `QuestionRenderer` (`inert`), galat server (`answer_not_in_options`, `field_not_allowed_for_type`, dll.) dipetakan ke field.
- **`/admin/konten/revisi`** (`revisions-panel.tsx`): pilih jenis entitas + ID (atau `?tipe=&id=`), tabel Versi/Oleh/Waktu/Batch impor, Sheet snapshot JSON baca-saja.
- **Tautan "Dipakai oleh" (TASK-018)**: `asset-detail-sheet.tsx` kini menaut sub-modul ke `/admin/konten/kurikulum?sub_modul=<id>` (menyorot baris + membuka sheet sunting) dan set ke `/admin/konten/soal/<id>`; `assets-panel.tsx` menerima `?buka=<asset_id>` dan `?belum=1`. Blocker bertaut: penghalang aset -> aset (id dari `detail` "asset <uuid>") atau daftar belum diverifikasi; set -> halaman set; sub-modul -> kurikulum.
- Navigasi admin: "Kurasi Kurikulum" dan "Kurasi Soal" ditambahkan; halaman Revisi dijangkau dari tab dan tautan.
- Komponen bersama baru `admin/curation/fields.tsx` (`NativeSelect`, `Textarea`, `Field` dengan hint/galat ber-ARIA); `<select>` native dipilih agar nyaman di mobile dan mudah diuji.

### Uji (Frontend)
`admin/curation/curation.test.tsx` (37 tes): util K1/penghalang/parser, pohon kurikulum (status, penghalang, set, galat, kosong, drift status tak dikenal), ubah status (konfirmasi AI, `PUBLISH_BLOCKED`, `REVIEW_CONFIRMATION_REQUIRED`, `INVALID_STATUS_TRANSITION`), sheet sub-modul (hanya field berubah, konfirmasi terpublikasi, validasi klien, `ORDER_INDEX_TAKEN`, buang perubahan, tutup langsung, deep link, badge penghalang), sheet modul, SetsPanel (filter/kosong), SetDetail (kualitas, simpan set, teks bacaan 4 bagian, edit soal MCQ + pratinjau, `answer_not_in_options`, validasi klien, Writing, `SET_HAS_ACTIVE_ATTEMPTS`, status AI, 404, kualitas gagal), Revisi (URL, UUID tidak valid, kosong, snapshot), tautan "Dipakai oleh", AssetsPanel `?belum=1`.

### Verifikasi (di `codes/`, 2026-11-03)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus (exit 0) |
| `npx eslint src tests --max-warnings=0` | 3 peringatan, SEMUA di berkas Backend di luar lingkup FE: `src/server/skills/service.ts:16` (`PredictionDTO` tak terpakai), `tests/integration/skills.itest.ts:5` (`afterEach`) dan `:26` (`subId`). `eslint` atas direktori FE (`src/components src/app src/lib src/i18n src/hooks src/contracts tests/unit tests/security`) bersih |
| `npx vitest run` | 65 berkas, 1051 tes lulus |
| `npm run test:integration` | TIDAK dijalankan (di luar lingkup FE) |

### Catatan untuk Backend (tidak ditambal di klien)
1. `src/contracts/curation.ts` belum memuat skema respons untuk: `GET /admin/sub-modules/{id}`, `GET /admin/assessment-sets` & `/{id}`, `PATCH` modul/sub-modul/material/set/soal, `GET /admin/content-revisions/{id}`. Klien mendefinisikannya sementara di `src/lib/api/curation-contract.ts` (nama sama); mohon ditambah ke kontrak bersama agar bisa di-re-export.
2. `GET /admin/assessment-sets/{id}` tidak memberi tahu apakah set punya attempt `IN_PROGRESS`; UI baru terkunci SETELAH 409 `SET_HAS_ACTIVE_ATTEMPTS`. Usul aditif: `has_active_attempts: boolean`.
3. `SetRef` pada `GET /admin/curriculum` tidak memuat `origin`; konfirmasi reviu AI (K2) untuk set pada kurikulum baru muncul setelah 409 `REVIEW_CONFIRMATION_REQUIRED`. Usul aditif: `origin` pada `SetRef`.
4. Penghalang `PUBLISH_BLOCKED`/`blockers[]`: `entity_type` adalah pemilik (MODULE/SUB_MODULE/ASSESSMENT_SET), id aset hanya ada di teks `detail` ("asset <uuid> (kode)"). Klien mengurai `detail` dengan regex; usul: field terstruktur `asset_id` pada penghalang `ASSET_UNVERIFIED`.
5. Soal TFNG/YNNG: klien mengasumsikan nilai `correct_answers` `True/False/Not Given` dan `Yes/No/Not Given` (sama dengan `validate.ts` dan `toPublicQuestion`).

### Belum diverifikasi
E2E Playwright (admin menyunting prompt, memublikasikan set AI, Learner melihat prompt baru; Sheet layar penuh 375x812), tampilan nyata (tidak ada screenshot) terang/gelap/375 px, sunting set Reading dengan `===PASSAGE===` terhadap server nyata, alur dua-admin serentak (`CONFLICT_RETRY` hanya dipetakan ke pesan Indonesia), integrasi dengan server nyata.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 16:00 | Frontend W8: kurasi kurikulum, soal, revisi; tautan Dipakai oleh |

## [BACKEND] 2026-11-03 18:00 (Backend Engineer, wave W8)
Target: `specifications/020_spec_content_curation.md`. Status: selesai (Postgres 16 lokal). Audit dulu: `PublishService` (`computeBlockers`, `v_publish_blockers`), `content_revisions` (UQ entity+version) dan pola `ensureRevision` impor, validator soal/teks bacaan SPEC-004 (`QuestionSchema`, `checkQuestion`, `checkMarkdown`, `checkPassageText`), pola admin `withApi({auth:'admin'})`, `writeAudit`. Dipakai ulang; tanpa migrasi.

### Yang dibuat
- **`src/server/curation/rules.ts`** (murni): matriks K1 `canTransition`, `allowedFields` per tipe soal, `mergeQuestionEdit` (gabung -> validasi soal utuh SPEC-004 + aturan silang + Placement `difficulty_required` + `passage_out_of_range`), K5 `correctRate`/`qualityFlag` (pecahan tepat), `escapeLike`.
- **`src/server/curation/service.ts`** (`CurationService`): `getCurriculum` (satu pass, `blocker_count` sama dengan `computeBlockers`), `getSubModuleDetail`, `updateModule`, `updateSubModule`, `updateMaterial`, `listSets`, `getSetDetail`, `updateSet`, `updateQuestion`, `changeStatus`, `getQuality`, `listRevisions`, `getRevision`. Semua mutasi: satu transaksi, baris entitas `FOR UPDATE` (penyuntingan serentak berurutan), revisi = snapshot SEBELUM perubahan pada versi sebelumnya (`onConflictDoNothing` selaras impor), audit `CONTENT_EDITED` (nama field saja) / `CONTENT_STATUS_CHANGED`; bentrok revisi dicoba ulang sekali lalu `CONFLICT_RETRY`.
- **11 route** di `src/app/api/v1/admin/` (`curriculum`, `sub-modules/{id}` GET+PATCH, `.../material`, `modules/{id}`, `assessment-sets` GET, `{id}` GET+PATCH, `.../questions/{qid}`, `.../quality`, `[entity]/[id]/status`, `content-revisions`, `content-revisions/{id}`); `src/contracts/curation.ts` (+ skema respons); kode galat 409 baru terdaftar.
- **K3 (pagar set berjalan)** `hasActiveAttempts`: attempt "hidup" pada set itu, induknya, atau anak-anaknya (Boss); juga dipakai saat memindahkan set PUBLISHED ke DRAFT/ARCHIVED. Placement ikut terjaga (**menutup F-15-07 untuk jalur admin**). Penafsiran: hidup = EXAM sebelum deadline + 5 dtk atau PRACTICE aktif <= 24 jam (ADR-003 #33(b)).
- Aditif untuk Frontend: `has_active_attempts` (detail set), `origin` pada `SetRef`, `asset_id` pada penghalang `ASSET_UNVERIFIED` (`Blocker` di `content/publish.ts`).

### Uji
`tests/unit/curation-rules.test.ts` (12), `tests/integration/curation.itest.ts` (35), memetakan setiap AC SPEC-020: publish set + audit + reviewed_by/at; K2 (set dan sub-modul); `PUBLISH_BLOCKED` `ASSET_UNVERIFIED`/`DRILL_NOT_PUBLISHED` lalu 200 setelah aset diverifikasi; K1 (semua jalur, 409 termasuk status sama); arsip menyembunyikan dari `/curriculum/tree` tanpa menghapus progres; `tiers` -> 404; PATCH sub-modul versi+1 dan revisi snapshot lama (0/101 -> 400); `ORDER_INDEX_TAKEN` (modul dan sub-modul); materi `raw_html_not_allowed`/`unsafe_link`; soal `answer_not_in_options`, `unrecognized_key`, `field_not_allowed_for_type`, versi+1/hash/revisi; K3 (409, selesai -> 200, attempt basi, Placement, Boss anak); teks bacaan `too_many_passages`/`passage_out_of_range`; kualitas 46 jawaban/8 benar -> 0,17 `TOO_HARD` dan 19 jawaban tanpa flag; akses learner 403 / anonim 401 / CSRF; revisi DESC + snapshot; dua admin serentak (versi N+1, N+2); Learner melihat prompt baru; semua respons divalidasi skema Zod.

### Verifikasi (di `codes/`, dijalankan Backend)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src tests scripts --max-warnings=0` | exit 0 |
| `npx vitest run` | 66 berkas, 1063 tes lulus (sebelum W8: 59 berkas, 905 tes lulus pada catatan Backend W7; angka FE ikut tercakup) |
| `npm run test:integration` | 22 berkas, 576 tes lulus (baseline sebelum pekerjaan ini: 19 berkas, 484 tes; ditambah `gamification` 29, `skills` 28, `curation` 35) |
| `npm run build:worker` dan `next build` (NODE_ENV=production) | lulus (artefak `dist/` dan `.next/` dihapus lagi) |

### Catatan untuk Frontend (kontrak)
- Semua skema respons kini di `src/contracts/curation.ts` (`SubModuleDetailResponseSchema`, `ModuleUpdatedResponseSchema`, `SubModuleUpdatedResponseSchema`, `MaterialUpdatedResponseSchema`, `SetListResponseSchema`, `SetDetailResponseSchema`, `SetUpdatedResponseSchema`, `QuestionUpdatedResponseSchema`, `RevisionDetailResponseSchema`); `lib/api/curation-contract.ts` dapat re-export seluruhnya.
- Kode detail 400: `empty_update`, `unrecognized_key`, `field_not_allowed_for_type`, `answer_not_in_options` (dan kode SPEC-004 lain), `raw_html_not_allowed`, `unsafe_link`, `too_many_passages`, `duplicate_paragraph_label`, `passage_out_of_range`. 409: `SET_HAS_ACTIVE_ATTEMPTS`, `INVALID_STATUS_TRANSITION`, `PUBLISH_BLOCKED` (`details[].path` = `<ENTITY_TYPE>:<id>`), `REVIEW_CONFIRMATION_REQUIRED`, `ORDER_INDEX_TAKEN`, `CONFLICT_RETRY`.
- Snapshot revisi: set/materi = baris DB dengan kunci camelCase (`questionsJson`, `articleMarkdown`), sub-modul = bentuk impor (`title`, `passing_score_percent`, `materials{...}`); tampilkan sebagai JSON baca-saja.
- `GET .../quality`: `correct_rate` 0 bila belum ada jawaban (flag null).

### Belum diverifikasi
E2E Playwright (admin menyunting, publikasi set AI dengan konfirmasi, Learner melihat prompt baru; Sheet 375x812), K3 untuk jalur impor SPEC-019 (tidak dijaga; residual F-15-07 bila impor memperbarui set Placement yang sedang dikerjakan), penyuntingan serentak lintas proses, kinerja `GET /admin/curriculum` pada konten penuh (bukan dataset Golden Sample).

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 18:00 | Backend W8: kurasi konten admin (status, sunting, revisi, kualitas) |

---
## [FRONTEND] Perbaikan QA W8 (2026-11-03 19:00)
- **F-20-13 (LOW)**: `src/lib/api/curation-contract.ts` diganti: `export * from '@/contracts/curation'` (seluruh skema respons dari satu sumber dengan server; 12 skema duplikat dihapus) ditambah alias tipe (`SetRef`, `Blocker`, `SetDetail`, `AdminQuestion`, `UpdateXRequest`, dst.). `AssessmentSetType` dan `RevisionEntityType` diturunkan dari skema server.
  - `has_active_attempts` (GET set) mengunci penyuntingan sejak muat (`set-detail.tsx`: `locked = has_active_attempts || kunci409`); tombol "Coba lagi" menarik ulang data. 409 `SET_HAS_ACTIVE_ATTEMPTS` tetap mengunci sebagai pengaman.
  - `SetRef.origin` dipakai untuk `needsAiConfirm` pada set di `curriculum-panel.tsx` (skip/boss/placement/drill) dan `set-detail.tsx` (dari `origin` detail), jadi kotak reviu AI muncul sebelum 409.
  - `blocker.asset_id` terstruktur dipakai di `blockers-list.tsx`; regex pada `detail` dihapus. Catatan drift: `details[]` galat 409 `PUBLISH_BLOCKED` bersifat strict (path/code/message) dan tidak membawa `asset_id`, sehingga tautan aset dari dialog status jatuh ke daftar "aset belum diverifikasi"; tautan langsung ke aset hanya ada pada penghalang dari `GET` (sub-modul/set). Usulan Backend (opsional): sertakan `asset_id` di `details[]`.
- **F-20-03 sisi UI (MEDIUM, SPEC-019)**: `step-publish.tsx` menampilkan kotak "Saya telah meninjau konten buatan AI dalam batch ini" bila target PUBLISHED dan server menjawab `REVIEW_CONFIRMATION_REQUIRED` (sinkron di POST, atau `summary.last_error.code` setelah muat ulang); tombol Publikasikan dinonaktifkan sampai dicentang, dan permintaan ulang mengirim `confirm_reviewed: true` (`PublishBatchInput` di `lib/api/imports.ts`). Catatan: `ItemDTO` tidak membawa `origin`, jadi klien tidak bisa mendeteksi konten AI sebelum jawaban server; usulan Backend (opsional): `summary.has_ai_generated` agar kotak muncul di muka.
- Tes: `curation.test.tsx` (has_active_attempts terkunci sejak muat, SetRef.origin AI di set kurikulum, tautan penghalang dengan/tanpa `asset_id`), `content-admin.test.tsx` (alur konfirmasi reviu pada publikasi impor).
- **Ditunda (LOW)**: F-20-05..F-20-12, F-20-14 (server), F-20-15/16 (INFO).
- **Verifikasi (di `codes/`)**: `tsc --noEmit` bersih; `eslint src tests --max-warnings=0` bersih; `vitest run` 66 berkas / 1086 tes lulus. `test:integration`, E2E tidak dijalankan.

---
## [BACKEND] Perbaikan QA W8 (2026-11-03 20:00)
Diputuskan Orchestrator (ADR-003 #34-#38, perlu tinjauan human); spec 016/017/019/020 diamandemen (Revision History). Tanpa migrasi.
- **F-20-01 (MEDIUM) ditutup.** (a) K3 kini juga untuk `modules`/`sub-modules` pada transisi ke DRAFT/ARCHIVED: 409 `SET_HAS_ACTIVE_ATTEMPTS` bila set di bawahnya punya attempt hidup (`curation/service.ts` `entityHasActiveAttempts`); (b) `applyDrillResult`/`applySkipResult` (modul) no-op bila entitas tidak ada di snapshot (skor attempt tetap tersimpan, submit 200, `progress: null`); `skip.ts onFinish` memakai target sintetis bila modul hilang; (c) semua `throw new Error` di `gatekeeping/service.ts` diganti `ApiError('INTERNAL_ERROR')` (kesalahan pemrograman) atau no-op berlog. Tes: `qa-w8-fixes.itest.ts` (mulai Drill -> arsip via DB -> submit 200 GRADED; K3 modul/sub-modul 409 lalu 200 setelah submit; galat ApiError).
- **F-20-02 (MEDIUM) ditutup.** `attempts/service.ts` `abandonIfStale`: PRACTICE `IN_PROGRESS` > 24 jam atau `assessment_version != set.version` -> `ABANDONED`; PUT answers/submit/GET membalas 409 `ATTEMPT_NOT_ACTIVE` setelah commit; `POST /attempts` mengabandon yang beda versi lalu membuat attempt baru. EXAM tidak diubah. Tes: 4 kasus di `qa-w8-fixes.itest.ts`.
- **F-20-04 (MEDIUM) ditutup.** `content/active-attempts.ts` (`hasActiveAttempts`, `activeAttemptSetIds`, `lockSets`) menjadi definisi tunggal: kurasi K3, evaluasi impor JSON dan CSV, dan pemeriksaan ulang di transaksi publikasi setelah apply dengan `FOR UPDATE` pada set (menutup jendela evaluasi -> commit). Induk/anak Boss kini ikut; PRACTICE basi tidak memblokir lagi. Dokumentasi residual F-15-07 dikoreksi (spec 019/020, ADR #37(c)). Tes: `activeAttemptSetIds` (Boss induk/anak, basi, kedaluwarsa) dan impor (PRACTICE basi tidak memblokir, segar memblokir).
- **F-20-03 (MEDIUM) ditutup (sisi server).** `PublishBatchBodySchema` + `confirm_reviewed` (boolean, default false); wajib `true` untuk target PUBLISHED bila batch memuat konten `AI_GENERATED_REVIEWED` yang berubah, jika tidak 409 `REVIEW_CONFIRMATION_REQUIRED` (`details[0].path = confirm_reviewed`). Job publikasi memeriksa ulang origin di DB (termasuk item NOOP dan set yang hanya disentuh CSV) dan membatalkan transaksi: batch kembali `PREVIEW_READY`, `summary.last_error.code = REVIEW_CONFIRMATION_REQUIRED`. `confirmed_by` di audit `IMPORT_PUBLISH_REQUESTED` dan `IMPORT_PUBLISHED`. Aditif: `summary.has_ai_generated` (menjawab usulan FE). Tes: `import.itest.ts` (4 kasus).
- **F-20-13** diverifikasi: `SetDetailResponseSchema.has_active_attempts`, `SetRefSchema.origin`, `BlockerSchema.asset_id` sudah di `src/contracts/curation.ts` (FE sudah re-export).
- **Ditunda (LOW/INFO, ADR-003 #38):** F-20-05 (peringatan Drill terakhir diturunkan; butuh keputusan produk), F-20-06 (TOCTOU `startAttempt`; kini ditutup sebagian oleh pembandingan `assessment_version` F-20-02 dan `FOR UPDATE` pada publikasi impor), F-20-07, F-20-08, F-20-09, F-20-10, F-20-11, F-20-12 (proyeksi kolom `getCurriculum`), F-20-14 (FE), F-20-15/16. `publish.ts:changeStatus` (jalur impor) belum diselaraskan penuh dengan matriks K1; K2 sekarang ditegakkan di jalur impor lewat `confirm_reviewed`.

### Verifikasi (di `codes/`)
Lihat tabel akhir pada bagian [BACKEND] TASK-016 di bawah (satu putaran verifikasi untuk ketiga task).

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 20:00 | Backend QA W8: F-20-01, F-20-02, F-20-03 (server), F-20-04; F-20-13 diverifikasi |
