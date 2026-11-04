# SPEC-020: Admin Kurasi Konten (Status Review/Publish, Edit Metadata & Soal, Revisi, Kualitas Soal)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-002, SPEC-004, SPEC-018, SPEC-019
- **Prioritas:** P1
- **Cakupan:** Backend (alur status, penyuntingan terbatas, revisi, statistik) + Frontend (halaman kurasi admin)

## User Story
Sebagai Admin (reviewer tunggal), saya ingin meninjau dan mengubah status konten (Draf, Direviu, Disetujui, Terpublikasi, Arsip), menyunting judul/urutan/ambang serta teks artikel dan soal individual, melihat riwayat revisi, dan melihat soal yang bermasalah dari data jawaban, sehingga kualitas konten buatan AI terjaga sebelum sampai ke Learner.

## Non-Goals / Out of Scope
- Tidak membuat modul/sub-modul/set baru lewat UI (dilakukan lewat impor SPEC-004/019).
- Tidak menyunting video, slide, lampiran, atau aset (impor ulang atau SPEC-018).
- Tidak menyunting `reading_passage_markdown` panjang lewat editor kaya; hanya bidang teks biasa dengan validasi yang sama dengan SPEC-004.
- Tidak menyunting soal bertipe `WRITING_TASK`/`SPEAKING_TASK` selain `prompt` dan `explanation_id`.
- Tidak ada alur persetujuan multi-orang (Admin pemilik adalah reviewer tunggal; ADR-003 #3).
- Tidak ada penghapusan fisik konten (hanya arsip; FK `RESTRICT`).
- Tidak ada rollback revisi satuan lewat UI (hanya melihat snapshot; rollback batch di SPEC-019).
- Tidak ada penyuntingan massal lewat UI.
- Tidak menyunting set yang punya attempt `IN_PROGRESS`.

## Definisi Tetap
**K1. Transisi status** (`review_status`): `DRAFT -> IN_REVIEW -> APPROVED -> PUBLISHED`; pintasan diizinkan: `DRAFT|IN_REVIEW|APPROVED -> PUBLISHED`; `PUBLISHED -> ARCHIVED`; `APPROVED|IN_REVIEW|PUBLISHED -> DRAFT`; `ARCHIVED -> DRAFT`. Selain itu 409 `INVALID_STATUS_TRANSITION`. Target `PUBLISHED` menjalankan `PublishService.publish` (penghalang SPEC-004); gagal -> 409 `PUBLISH_BLOCKED`.
**K2. Konfirmasi reviu AI:** entitas dengan `origin = 'AI_GENERATED_REVIEWED'` (materi sub-modul atau set) hanya dapat menjadi `PUBLISHED` bila permintaan memuat `confirm_reviewed: true`; selain itu 409 `REVIEW_CONFIRMATION_REQUIRED`. Sukses menulis `reviewed_by` = admin dan `reviewed_at = now()` pada set (untuk sub-modul: pada materi/set terkait di `audit_log` `metadata.confirmed_by`).
**K3. Penyuntingan set berjalan:** set tidak dapat disunting (409 `SET_HAS_ACTIVE_ATTEMPTS`) bila ada `attempts` `IN_PROGRESS` pada set itu atau anak-anaknya (Boss).
**K4. Versi:** setiap penyuntingan yang mengubah konten set menaikkan `assessment_sets.version` +1 dan memperbarui `content_hash`; perubahan materi/sub-modul menaikkan `sub_modules.content_version` dan `learning_materials.content_version` +1; setiap perubahan menulis `content_revisions` (snapshot SEBELUM perubahan, `version` = versi sebelum perubahan, `changed_by` = admin).
**K5. Statistik kualitas soal:** per `question_id`, `attempts_count` = jumlah `attempt_answers` (attempt `GRADED`/`EXPIRED`, `is_correct IS NOT NULL`), `correct_rate = benar / attempts_count` (2 desimal). `flag = "TOO_HARD"` bila `attempts_count >= 20` dan `correct_rate < 0.20`; `"TOO_EASY"` bila `attempts_count >= 20` dan `correct_rate > 0.98`; selain itu `null`.

## Technical Flow
1. Admin membuka `/admin/konten/kurikulum`; klien memanggil `GET /api/v1/admin/curriculum`.
2. Admin memilih sub-modul; klien memanggil `GET /api/v1/admin/sub-modules/{id}` untuk detail dan daftar penghalang publikasi.
3. Admin mengubah status lewat `POST /api/v1/admin/{entity}/{id}/status`; server menerapkan K1/K2 dalam satu transaksi dengan `audit_log` `CONTENT_STATUS_CHANGED`.
4. Admin menyunting judul/urutan/ambang lewat `PATCH`; server memvalidasi, menaikkan versi (K4), menulis revisi.
5. Admin membuka `/admin/konten/soal`, memilih set (`GET /api/v1/admin/assessment-sets`, lalu `GET .../{id}`), dan menyunting satu soal lewat `PATCH .../questions/{question_id}`; server menggabungkan perubahan ke soal, memvalidasi soal utuh dengan skema SPEC-004, memeriksa K3, menaikkan versi, menulis revisi.
6. Admin melihat `GET .../{id}/quality` untuk soal bermasalah dan membuka riwayat revisi (`GET /api/v1/admin/content-revisions`).

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/curation.ts`. Semua endpoint **Auth: admin**. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN`, `CSRF_ORIGIN_MISMATCH`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.

### GET /api/v1/admin/curriculum
- **Success status:** 200
**Response (Success)** (dipotong):
```json
{ "data": { "tiers": [ { "tier_number": 2, "title": "Bridge to Academic",
  "skip_set": { "id": "f0a1b2c3-0002-4000-8000-0000000000e2", "status": "DRAFT", "question_count": 20, "version": 1 },
  "boss": { "id": "b0551002-0000-4000-8000-000000000002", "status": "DRAFT", "section_skills": ["LISTENING", "READING"], "version": 1 },
  "modules": [ { "id": "7a1b2c3d-0021-4000-8000-000000000021", "module_code": "2.1", "title": "Complex Grammar & Sentence Combining", "order_index": 1, "status": "PUBLISHED",
    "skip_set": { "id": "f0a1b2c3-0001-4000-8000-0000000000e1", "status": "PUBLISHED", "question_count": 12, "version": 2 },
    "sub_modules": [ { "id": "7a1b2c3d-0213-4000-8000-000000000213", "sub_module_code": "2.1.3", "title": "Passive Voice untuk Deskripsi Proses", "order_index": 3, "status": "PUBLISHED", "passing_score_percent": 75, "content_version": 2, "origin": "AI_GENERATED_REVIEWED", "has_material": true, "drill": { "id": "e5f6a7b8-0001-4000-8000-0000000000d1", "status": "PUBLISHED", "question_count": 10, "version": 3 }, "blocker_count": 0 } ] } ] } ],
  "placement": { "id": "d0cc0001-0001-4000-8000-000000000001", "status": "PUBLISHED", "question_count": 30, "version": 1 } } }
```
`skip_set`, `boss`, `drill`, `placement` nullable (null bila belum ada). `blocker_count` = jumlah baris `v_publish_blockers` + penghalang `PublishService` untuk entitas itu.

### GET /api/v1/admin/sub-modules/{sub_module_id}
- **Success status:** 200
**Response:** `{ "data": { "sub_module": { id, sub_module_code, title, order_index, status, passing_score_percent, content_version, module: { id, module_code, title } }, "material": { "article_markdown": string, "origin": enum content_origin, "attribution_text": string|null, "content_version": int, "videos": [{ "asset_id": uuid, "video_id": string, "title": string, "start_sec": int, "end_sec": int, "rights_status": enum }], "slides": [{ "asset_id": uuid, "order": int, "caption": string, "rights_status": enum }], "attachments": [{ "asset_id": uuid, "title": string, "file_type": string, "rights_status": enum }], "mini_task": object|null }|null, "drill": { "id": uuid, "status": enum, "question_count": int, "version": int }|null, "blockers": [ { "code": string, "entity_type": string, "entity_id": uuid, "detail": string } ] } }`
**Error:** `NOT_FOUND` (404).

### PATCH /api/v1/admin/modules/{module_id}
- **Success status:** 200 | **Zod:** `UpdateModuleRequestSchema` | Field (minimal satu): `title` (1-150), `order_index` (int >= 1). **Response:** `{ "data": { id, module_code, title, order_index, status } }`.
**Error**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body kosong (`empty_update`), nilai di luar rentang, `unrecognized_key` (mis. `module_code`, `status`) |
| 404 | NOT_FOUND | Modul tidak ada |
| 409 | ORDER_INDEX_TAKEN | `(tier_id, order_index)` sudah dipakai |

### PATCH /api/v1/admin/sub-modules/{sub_module_id}
- **Success status:** 200 | **Zod:** `UpdateSubModuleRequestSchema` | Field (minimal satu): `title` (1-200), `order_index` (int >= 1), `passing_score_percent` (int 1-100). **Response:** `{ "data": { id, sub_module_code, title, order_index, passing_score_percent, status, content_version } }`. `content_version` naik +1 (K4) bila `title` atau `passing_score_percent` berubah.
**Error:** `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `ORDER_INDEX_TAKEN` (409; `(module_id, order_index)`).

### PATCH /api/v1/admin/sub-modules/{sub_module_id}/material
- **Success status:** 200 | **Zod:** `UpdateMaterialRequestSchema`
| Field | Type | Required | Constraint |
|---|---|---|---|
| `article_markdown` | string | tidak | 1-100.000; tanpa HTML mentah dan tautan `javascript:`/`data:` (aturan SPEC-004) |
| `attribution_text` | string \| null | tidak | <= 500 |
| `mini_task` | object \| null | tidak | `{ task_type, prompt (1-2000), ai_rubric_criteria (1-1000) }` atau `null` (menghapus); `task_type` ∈ `AI_SHORT_WRITING` \| `AI_SHORT_SPEAKING` \| `SELF_CHECK` |
Minimal satu field. **Response (Success) 200:** `{ "data": { "content_version": 3, "updated_at": "2026-11-03T14:00:00.000Z" } }`.
**Error**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | `details[].code`: `raw_html_not_allowed`, `unsafe_link`, `empty_update`, `unrecognized_key` |
| 404 | NOT_FOUND | Sub-modul atau materi tidak ada |

### GET /api/v1/admin/assessment-sets
- **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `assessment_type` | enum | tidak | nilai `assessment_type` |
| `status` | enum | tidak | nilai `review_status` |
| `tier_number` | int | tidak | 1-4 |
| `q` | string | tidak | 1-100; cocok `ILIKE` pada judul (escape `%` `_`) |
| `page`, `page_size` | int | tidak | page_size 1-100 (default 20) |
**Response:** `{ "data": [ { "id": uuid, "assessment_type": enum, "title": string, "status": enum, "question_count": int, "version": int, "origin": enum, "scope_label": string, "updated_at": string } ], "meta": { ... } }` urut `updated_at DESC`.

### GET /api/v1/admin/assessment-sets/{set_id}
- **Success status:** 200 | **Response:** `{ "data": { ...ringkasan di atas, "time_limit_seconds": int, "pass_percent": int|null, "reading_passage_markdown": string|null, "listening_asset_id": uuid|null, "attribution_text": string|null, "reviewed_at": string|null, "questions": [ <Question lengkap dengan kunci jawaban sesuai kontrak SPEC-004> ], "blockers": [ ... ] } }` (HANYA admin melihat kunci).
**Error:** `NOT_FOUND` (404).

### PATCH /api/v1/admin/assessment-sets/{set_id}
- **Success status:** 200 | **Zod:** `UpdateAssessmentSetRequestSchema`
Field (minimal satu): `title` (1-200), `time_limit_seconds` (int 30-14.400), `pass_percent` (int 1-100 atau null), `reading_passage_markdown` (string <= 60.000 atau null; `parsePassages` harus valid dan `passage_no` soal tetap sah).
**Response:** `{ "data": { id, title, time_limit_seconds, pass_percent, version, content_hash } }`.
**Error**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body kosong, nilai di luar rentang, `too_many_passages`, `duplicate_paragraph_label`, `passage_out_of_range`, `unrecognized_key` |
| 404 | NOT_FOUND | Set tidak ada |
| 409 | SET_HAS_ACTIVE_ATTEMPTS | K3 |

### PATCH /api/v1/admin/assessment-sets/{set_id}/questions/{question_id}
- **Success status:** 200 | **Zod:** `UpdateQuestionRequestSchema`
Field boleh diubah (minimal satu): `prompt` (1-2000), `explanation_id` (1-2000), `options` (hanya tipe MCQ), `correct_answers`, `max_words` (hanya `FILL_IN_BLANK`/`SHORT_ANSWER`), `points` (1-20), `target_time_ms` (1000-600000 atau null), `difficulty` (1-5 atau null), `passage_no` (1-3 atau null), `section_no` (1-4 atau null), `matching` (hanya tipe matching), `segments` (hanya `SENTENCE_REORDER`), `tokens` (hanya `ERROR_RECOGNITION`). `question_id`, `question_type`, `skill` TIDAK dapat diubah. Soal hasil gabungan divalidasi penuh dengan skema tipe SPEC-004 (termasuk aturan silang).
```json
{ "prompt": "Manakah kalimat yang paling tepat untuk laporan akademik IELTS Writing Task 1?", "correct_answers": ["The coffee beans are ground in a mechanical grinder."] }
```
**Response (Success) 200:** `{ "data": { "question": <Question lengkap>, "set": { "id": uuid, "version": 4, "content_hash": "<sha256 hex>" } } }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Soal hasil gabungan melanggar skema (`details[].code` mis. `answer_not_in_options`, `field_not_allowed_for_type`, `empty_update`, `unrecognized_key`) |
| 404 | NOT_FOUND | Set atau `question_id` tidak ada |
| 409 | SET_HAS_ACTIVE_ATTEMPTS | K3 |

### POST /api/v1/admin/{entity}/{id}/status
- **Success status:** 200 | **Zod:** `ChangeStatusRequestSchema` | **Path:** `entity` ∈ `modules`, `sub-modules`, `assessment-sets` (selain itu 404 `NOT_FOUND`); `id` uuid
| Field | Type | Required | Constraint |
|---|---|---|---|
| `status` | enum | ya | `DRAFT` \| `IN_REVIEW` \| `APPROVED` \| `PUBLISHED` \| `ARCHIVED` |
| `confirm_reviewed` | boolean | tidak | wajib `true` bila K2 berlaku |
```json
{ "status": "PUBLISHED", "confirm_reviewed": true }
```
**Response (Success) 200:** `{ "data": { "id": uuid, "entity": "assessment-sets", "status": "PUBLISHED", "reviewed_at": "2026-11-03T14:10:00.000Z" } }` (`reviewed_at` null untuk modul/sub-modul).
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Entitas tidak ada |
| 409 | INVALID_STATUS_TRANSITION | K1 |
| 409 | PUBLISH_BLOCKED | Penghalang SPEC-004; `details[]` = `{ path: "<entity_type>:<entity_id>", code: "<kode penghalang>", message: "<detail>" }` |
| 409 | REVIEW_CONFIRMATION_REQUIRED | K2 |
| 409 | SET_HAS_ACTIVE_ATTEMPTS | Memindahkan set `PUBLISHED` ke `DRAFT`/`ARCHIVED` saat ada attempt `IN_PROGRESS` |

### GET /api/v1/admin/assessment-sets/{set_id}/quality
- **Success status:** 200
**Response (Success):**
```json
{ "data": { "set_id": "e5f6a7b8-0001-4000-8000-0000000000d1", "questions": [ { "question_id": "Q-213-01", "attempts_count": 46, "correct_rate": 0.17, "flag": "TOO_HARD" }, { "question_id": "Q-213-02", "attempts_count": 46, "correct_rate": 0.83, "flag": null } ] } }
```
`correct_rate` number 0-1 (2 desimal); `flag` ∈ `TOO_HARD` \| `TOO_EASY` \| null (K5). **Error:** `NOT_FOUND` (404).

### GET /api/v1/admin/content-revisions
- **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `entity_type` | enum | ya | `SUB_MODULE` \| `LEARNING_MATERIAL` \| `ASSESSMENT_SET` |
| `entity_id` | uuid | ya | |
| `page`, `page_size` | int | tidak | page_size 1-100 |
**Response:** `{ "data": [ { "id": uuid, "entity_type": string, "entity_id": uuid, "version": int, "changed_by_name": string|null, "import_batch_id": uuid|null, "created_at": string } ], "meta": { ... } }` urut `version DESC`.

### GET /api/v1/admin/content-revisions/{revision_id}
- **Success status:** 200 | **Response:** `{ "data": { ...baris di atas, "snapshot": { /* isi entitas sebelum perubahan */ } } }`. **Error:** `NOT_FOUND` (404).

## Database Changes
Tidak ada tabel/kolom baru. Menulis `modules`, `sub_modules`, `learning_materials`, `assessment_sets` (`title`, `order_index`, `passing_score_percent`, `time_limit_seconds`, `pass_percent`, `reading_passage_markdown`, `questions_json`, `question_count`, `status`, `version`, `content_hash`, `reviewed_by`, `reviewed_at`), `content_revisions`, `audit_log`. Statistik K5 memakai indeks `attempt_answers_set_q_idx`. Audit: `CONTENT_STATUS_CHANGED` (`metadata`: `entity`, `id`, `from`, `to`), `CONTENT_EDITED` (`metadata`: `entity`, `id`, `fields` (nama field saja, bukan isi)).

## UI/UX
Rujukan: `design-system.md` 5.20 (edit modul/soal: tabel + panel edit samping/sheet, konfirmasi sebelum buang perubahan), 5.6 Table, 5.4 Dialog/Sheet, 5.2 Input/Form, 5.7 Badge/Toast.

- **`/admin/konten/kurikulum`:** pohon Tier > Modul > Sub-Modul dengan Badge status (ikon + teks: "Draf", "Direviu", "Disetujui", "Terpublikasi", "Arsip"), jumlah penghalang (Badge merah "3 penghalang"), kolom set (Drill, Skip, Boss, Placement) dengan status dan jumlah soal. Aksi baris: "Ubah status" (Select status + Dialog; untuk `AI_GENERATED_REVIEWED` Checkbox wajib "Saya telah meninjau konten buatan AI ini"), "Sunting" (Sheet metadata), "Lihat penghalang" (daftar dengan tautan ke aset/kurikulum).
- **Sheet sub-modul:** Input judul, Input urutan, Input ambang lulus (1-100), Textarea artikel Markdown dengan panel pratinjau memakai renderer aman SPEC-005, Input atribusi, editor Mini-Task (Select tipe + Textarea); Button "Simpan" (Dialog konfirmasi bila sub-modul `PUBLISHED`: "Perubahan langsung terlihat oleh Learner").
- **`/admin/konten/soal`:** Table set (Judul, Jenis, Status, Soal, Versi, Diperbarui) + filter; klik membuka halaman set: daftar soal (nomor, tipe, prompt ringkas, Badge `TOO_HARD`/`TOO_EASY` dari `quality`), Sheet edit soal (field sesuai tipe; opsi MCQ dengan penanda jawaban benar; pratinjau render soal via `QuestionRenderer` baca-saja), banner "Set ini memiliki attempt berjalan; penyuntingan dinonaktifkan" bila K3.
- **`/admin/konten/revisi`:** pilih entitas -> Table revisi (Versi, Oleh, Waktu, Batch impor) dengan Sheet "Lihat snapshot" (JSON terformat baca-saja).
- State: loading Skeleton; galat validasi per field (`aria-describedby`); mobile: Table -> kartu, Sheet layar penuh; konfirmasi sebelum menutup Sheet dengan perubahan belum disimpan.

## Acceptance Criteria
- [ ] **Given** set `DRAFT` tanpa penghalang **When** `POST /admin/assessment-sets/{id}/status` `PUBLISHED` **Then** 200, `status="PUBLISHED"`, `reviewed_by`/`reviewed_at` terisi, `audit_log` `CONTENT_STATUS_CHANGED` (`from="DRAFT"`, `to="PUBLISHED"`).
- [ ] **Given** set dengan `origin="AI_GENERATED_REVIEWED"` **When** `PUBLISHED` tanpa `confirm_reviewed` **Then** 409 `REVIEW_CONFIRMATION_REQUIRED`; dengan `confirm_reviewed=true` -> 200.
- [ ] **Given** sub-modul yang aset videonya `UNVERIFIED` **When** `PUBLISHED` **Then** 409 `PUBLISH_BLOCKED` dengan `details[0].code="ASSET_UNVERIFIED"`; setelah aset diverifikasi (SPEC-018) dan drill `PUBLISHED` -> 200.
- [ ] **Given** sub-modul tanpa set drill `PUBLISHED` **When** `PUBLISHED` **Then** 409 `PUBLISH_BLOCKED` `DRILL_NOT_PUBLISHED`.
- [ ] **Given** `status=ARCHIVED` dari `DRAFT` **When** dipanggil **Then** 409 `INVALID_STATUS_TRANSITION`; `ARCHIVED -> PUBLISHED` -> 409; `ARCHIVED -> DRAFT` -> 200.
- [ ] **Given** sub-modul `PUBLISHED` diarsipkan **When** Learner memuat `/peta` **Then** sub-modul hilang dari tree dan baris progres pengguna tetap ada.
- [ ] **Given** `entity` = `tiers` **When** `POST /admin/tiers/{id}/status` **Then** 404 `NOT_FOUND`.
- [ ] **Given** `PATCH /admin/sub-modules/{id}` `passing_score_percent=80` **When** dipanggil **Then** 200, `content_version` +1, `content_revisions` menyimpan snapshot lama (`version` sebelumnya); nilai 0 atau 101 -> 400 `VALIDATION_ERROR`.
- [ ] **Given** dua sub-modul pada satu modul **When** `PATCH order_index` ke nilai milik lainnya **Then** 409 `ORDER_INDEX_TAKEN` dan tidak ada perubahan.
- [ ] **Given** `PATCH .../material` dengan `article_markdown` berisi `<script>` **When** dipanggil **Then** 400 `raw_html_not_allowed`; berisi `[x](javascript:alert(1))` -> 400 `unsafe_link`.
- [ ] **Given** `PATCH .../questions/Q-213-02` mengganti `correct_answers` ke teks yang tidak ada di `options` **When** dipanggil **Then** 400 `answer_not_in_options` dan soal tidak berubah; perubahan valid -> 200, `set.version` +1, `content_hash` berubah, `content_revisions` baru.
- [ ] **Given** field `question_type` di body **When** `PATCH` soal **Then** 400 `unrecognized_key`; `options` pada soal `FILL_IN_BLANK` -> 400 `field_not_allowed_for_type`.
- [ ] **Given** set punya attempt `IN_PROGRESS` **When** `PATCH` set/soal **Then** 409 `SET_HAS_ACTIVE_ATTEMPTS` tanpa perubahan; setelah attempt selesai -> 200.
- [ ] **Given** `PATCH` set `reading_passage_markdown` dengan 4 bagian `===PASSAGE===` **When** dipanggil **Then** 400 `too_many_passages`; `passage_out_of_range` bila soal merujuk teks yang dihapus.
- [ ] **Given** 46 jawaban pada Q-213-01 dengan 8 benar **When** `GET .../quality` **Then** `correct_rate=0.17`, `flag="TOO_HARD"`; soal dengan 19 jawaban tidak pernah ber-`flag`.
- [ ] **Given** `GET /admin/assessment-sets/{id}` **When** dipanggil oleh learner **Then** 403 `FORBIDDEN` (kunci jawaban tidak pernah keluar ke non-admin).
- [ ] **Given** revisi **When** `GET /admin/content-revisions?entity_type=ASSESSMENT_SET&entity_id=<id>` **Then** daftar urut `version DESC` dan `GET .../{revision_id}` memuat `snapshot` isi sebelum perubahan.
- [ ] **Given** `entity_type` salah **When** dipanggil **Then** 400 `VALIDATION_ERROR`.
- [ ] **Given** E2E Playwright **When** admin menyunting prompt soal, memublikasikan set AI dengan konfirmasi, dan Learner membuka drill **Then** Learner melihat prompt baru; pada 375x812 Sheet tampil layar penuh tanpa scroll horizontal.

## Edge Cases & Validation
- [ ] Dua admin menyunting soal sama serentak: transaksi terakhir menang; keduanya tercatat di `content_revisions` dengan `version` berurutan (UQ `(entity_type, entity_id, version)` menjaga tanpa duplikat; permintaan yang kalah mencoba ulang sekali, selain itu 409 `CONFLICT_RETRY` dengan pesan "Konten baru saja diubah. Muat ulang dan coba lagi.").
- [ ] `order_index` negatif atau 0: 400.
- [ ] Menurunkan set `PUBLISHED` Placement/Boss ke `DRAFT` tanpa attempt berjalan: diizinkan; fitur terkait menjadi tidak tersedia (`NO_PLACEMENT_PUBLISHED`, `NO_BOSS_PUBLISHED`).
- [ ] Audit `CONTENT_EDITED` tidak memuat isi artikel/soal (hanya nama field).
- [ ] Mengubah `passing_score_percent` tidak mengubah status progres yang sudah ada (keputusan gerbang memakai nilai saat attempt).

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; reviewer tunggal Admin (ADR-003 #3) |
| 2026-11-03 | Backend Engineer | Implementasi backend (aditif; tanpa migrasi). Klarifikasi: (1) K1: status yang sama juga 409 `INVALID_STATUS_TRANSITION`; audit status = `CONTENT_STATUS_CHANGED` (`entity` = nilai path, `from`, `to`, `confirmed_by` bila K2), tanpa `CONTENT_PUBLISHED`; urutan cek K1 -> K2 -> penghalang -> `SET_HAS_ACTIVE_ATTEMPTS`; (2) K3 memakai "attempt hidup": `IN_PROGRESS` EXAM sebelum deadline + 5 dtk, atau PRACTICE dengan aktivitas <= 24 jam (selaras SPEC-006 D3); attempt basi tidak menghalangi (tanpa ini satu Drill yang ditinggalkan mengunci set selamanya); berlaku untuk set itu, induknya, dan anak-anaknya (Boss) serta Placement (menutup F-15-07 untuk jalur admin; jalur impor SPEC-019 tidak dijaga); (3) K4: perubahan tanpa nilai baru tidak menaikkan versi/revisi; sub-modul: hanya `title`/`passing_score_percent` menaikkan `content_version` (urutan saja tidak); materi menaikkan `learning_materials.content_version` DAN `sub_modules.content_version`, menulis revisi `SUB_MODULE` + `LEARNING_MATERIAL`; modul menulis revisi `MODULE` (tidak dapat dibaca lewat endpoint revisi); snapshot set/materi = baris DB (kunci camelCase, sama dengan impor), snapshot sub-modul = bentuk impor; `content_hash` = sha256(canonical JSON judul, waktu, pass_percent, teks bacaan, aset listening, soal) sehingga impor ulang paket asal tampak UPDATE; (4) K5: `correct_rate` 0 bila belum ada jawaban, flag memakai pecahan tepat (bukan nilai bulat); (5) kode detail `unsafe_link` (bukan `unsafe_link_scheme`) dan `empty_update`, `field_not_allowed_for_type`, `passage_out_of_range`; (6) aditif: `has_active_attempts` pada `GET /admin/assessment-sets/{id}`, `origin` pada `SetRef`, `asset_id` pada penghalang `ASSET_UNVERIFIED`; (7) `entity` di luar daftar dan id bukan UUID pada `POST .../status` -> 404; kode galat 409 baru terdaftar di server. Skema Zod `src/contracts/curation.ts`. |
| 2026-11-03 | Backend Engineer | Amandemen QA W8 (ADR-003 #34-#37): (1) F-20-01: K3 berlaku juga untuk `modules` dan `sub-modules` pada transisi ke `DRAFT`/`ARCHIVED` (dari status mana pun): ditolak 409 `SET_HAS_ACTIVE_ATTEMPTS` bila ada attempt hidup pada set Drill/Skip di bawahnya; Gatekeeping `applyDrillResult`/`applySkipResult` toleran terhadap entitas yang tidak ada di snapshot (submit tetap 200, skor tersimpan, progres tidak berubah) dan galat pemrograman memakai `ApiError('INTERNAL_ERROR')`; (2) F-20-02: attempt PRACTICE `IN_PROGRESS` yang basi (> 24 jam tanpa aktivitas) atau dengan `attempts.assessment_version != assessment_sets.version` menjadi `ABANDONED` pada PUT answers, submit, GET, dan POST /attempts (yang terakhir lalu membuat attempt baru); tiga yang pertama membalas 409 `ATTEMPT_NOT_ACTIVE` setelah status tersimpan; (3) F-20-04: K3 dan pagar impor SPEC-019 memakai satu fungsi (`hasActiveAttempts`/`activeAttemptSetIds`, induk/anak Boss ikut); residual F-15-07 pada jalur impor tertutup; (4) F-20-03: lihat amandemen SPEC-019 (`confirm_reviewed` pada publikasi batch); (5) F-20-13 terverifikasi: `SetDetail.has_active_attempts`, `SetRef.origin`, `Blocker.asset_id` sudah ada di `src/contracts/curation.ts`. |
