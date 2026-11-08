# SPEC-019: Admin Bulk Importer JSON/CSV (Unggah, Validasi, Pratinjau, Publikasi, Rollback)

> **DIGANTIKAN sebagian oleh SPEC-025 / ADR-005 (2026-11-08).** UI dan API admin untuk fitur ini dihapus. Konten diimpor lewat CLI (`npm run content:validate|import`, `bank:validate`); pipeline impor batch, manajemen aset via UI, dan kurasi via UI tidak ada lagi. Dokumen dipertahankan sebagai riwayat.

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-000, SPEC-002, SPEC-004, SPEC-018
- **Prioritas:** P0 (jalur utama pengisian konten massal)
- **Cakupan:** Backend (batch lifecycle, job, CSV adapter, rollback) + Frontend (stepper 4 langkah, riwayat batch)

## User Story
Sebagai Admin (kurator konten), saya ingin mengunggah berkas JSON (paket konten) atau CSV (soal massal), melihat hasil validasi dan pratinjau perubahan, lalu mempublikasikan atau menyimpannya sebagai draf dan dapat membatalkan batch yang salah, sehingga ratusan sub-modul dan soal masuk tanpa input form satu per satu dan tanpa merusak data yang ada.

## Non-Goals / Out of Scope
- Tidak mengunggah berkas aset (SPEC-018); impor hanya merujuk aset yang sudah ada lewat `asset_code` (dan membuat aset video YouTube `UNVERIFIED`).
- Tidak mengambil data dari URL atau Google Sheets; tidak mendukung `.xlsx`.
- Tidak membuat atau mengubah Tier (hanya Modul, Sub-Modul, dan set asesmen).
- CSV hanya untuk jenis `QUESTIONS` (menambah/memperbarui soal pada set yang SUDAH ada); materi, set baru, dan modul hanya lewat JSON.
- CSV hanya mendukung tipe soal `MCQ_SINGLE`, `MCQ_MULTI`, `TFNG`, `YNNG`, `FILL_IN_BLANK`, `SHORT_ANSWER`.
- Tidak ada penghapusan entitas lewat impor (hanya CREATE/UPDATE/NOOP); pengarsipan lewat SPEC-020.
- Tidak ada penjadwalan impor, impor otomatis, atau webhook.
- Tidak memperbaiki berkas otomatis (validasi hanya melaporkan).
- Tidak ada impor bersamaan; hanya satu batch aktif per sistem.

## Definisi Tetap
**I1. Status batch** (`import_batches.status`): `UPLOADED` -> `VALIDATING` -> `PREVIEW_READY` -> `PUBLISHING` -> `PUBLISHED`; cabang: `FAILED` (galat teknis/validasi berubah), `CANCELLED` (dibatalkan admin), `ROLLED_BACK` (dikembalikan). Batch "aktif" = `UPLOADED`, `VALIDATING`, `PUBLISHING`.
**I2. Pemeriksaan sinkron saat unggah** (kegagalan = 400 `IMPORT_FILE_INVALID` kecuali disebut lain): ukuran <= 5 MB (413), tipe (415 `UNSUPPORTED_FILE_TYPE`), UTF-8 valid dan paling banyak satu BOM, tanpa karakter kontrol selain `\n \r \t`, JSON: sintaks valid, kedalaman <= 10, tanpa kunci `__proto__`/`constructor`/`prototype`, `contract_version` ∈ {"1.0","1.1"}, total item <= 2.000; CSV: header sesuai, baris <= 5.000, kolom <= 50, panjang sel <= 5.000.
**I3. Validasi asinkron** (job `import-validate`): Zod kontrak SPEC-004 per item + aturan silang + rencana CREATE/UPDATE/NOOP (hash konten) -> baris `import_batch_items` (`status` `VALID`/`INVALID`, `action`, `errors`). Item `INVALID` bila memiliki >= 1 galat `severity="error"`; peringatan (`severity="warning"`) tidak membuatnya `INVALID`.
**I4. Peringatan baku:** `asset_unverified` (aset dirujuk berstatus `UNVERIFIED`; menghalangi target `PUBLISHED`), `video_unverified` (video YouTube baru dibuat `UNVERIFIED`), `attribution_recommended`, `noop_item`.
**I5. Publikasi** (job `import-publish`, satu transaksi untuk seluruh batch): menerapkan rencana segar; `target_status = DRAFT` -> entitas ditulis `DRAFT` (entitas yang sudah `PUBLISHED` tetap `PUBLISHED` dengan `version`/`content_version` +1 bila hash berubah); `target_status = PUBLISHED` -> setelah penulisan, `PublishService.publish` untuk tiap entitas terdampak (SPEC-004); satu penghalang saja membatalkan seluruh transaksi dan batch kembali `PREVIEW_READY` dengan `summary.last_error = { code: "PUBLISH_BLOCKED", blockers: [...] }`.
**I6. Rollback:** hanya batch `PUBLISHED`. Item `UPDATE`: entitas dikembalikan ke snapshot `content_revisions` sebelum batch (versi naik +1, revisi baru dicatat). Item `CREATE`: entitas dihapus bila TIDAK dirujuk data pengguna (tidak ada `attempts`, `submissions`, `user_last_learned_state` terkait; dan semua baris `user_*_progress` entitas itu berstatus `LOCKED`/`UNLOCKED` dengan `attempts_count = 0`); jika ada satu saja yang tertahan, seluruh rollback ditolak (409 `ROLLBACK_BLOCKED`). Aset video YouTube yang dibuat batch tidak dihapus.
**I7. Retensi:** file asli dan `payload` item dihapus 90 hari setelah `PUBLISHED`/`CANCELLED` (tugas `purgeImportBatches`); ringkasan hitungan dipertahankan.

### Kolom CSV `QUESTIONS` (header WAJIB persis, urutan bebas; delimiter koma, kutip ganda; UTF-8)
| Kolom | Wajib | Constraint |
|---|---|---|
| `set_type` | ya | `ACTIVE_DRILL` \| `SKIP_MODULE_TEST` \| `SKIP_TIER_TEST` \| `BOSS_SECTION` \| `PLACEMENT_TEST` |
| `scope_code` | ya | `ACTIVE_DRILL`: `sub_module_code`; `SKIP_MODULE_TEST`: `module_code`; `SKIP_TIER_TEST`: `tier_number`; `BOSS_SECTION`: `<tier_number>:<SKILL>` (mis. `2:READING`); `PLACEMENT_TEST`: `PLACEMENT` |
| `question_id` | ya | aturan SPEC-004 |
| `question_type` | ya | enam tipe yang didukung |
| `skill` | ya | `SkillCategory` |
| `prompt` | ya | 1-2000 |
| `options` | tipe MCQ | butir dipisah ` || ` (spasi, dua garis tegak, spasi); 2-8 butir |
| `correct_answers` | ya | butir dipisah ` || `; aturan tipe SPEC-004 |
| `max_words` | `SHORT_ANSWER` wajib; `FILL_IN_BLANK` opsional | int 1-10 |
| `explanation_id` | ya | 1-2000 |
| `points` | tidak | int 1-20, default 1 |
| `target_time_ms`, `difficulty`, `passage_no`, `section_no` | tidak | seperti SPEC-004 |
Setiap baris menjadi satu item (`entity_kind="QUESTION"`, `entity_code` = `<set_type>:<scope_code>:<question_id>`); `question_id` yang sudah ada pada set -> `UPDATE` (atau `NOOP` bila hash sama), selain itu `CREATE` (ditambahkan di akhir). Set harus sudah ada (selain itu galat `set_not_found`). Sel diawali `=`, `@`, tab, atau CR = galat `formula_injection`.

## Technical Flow
1. Admin membuka `/admin/impor`, melihat riwayat batch, dan menekan "Impor Baru".
2. Langkah 1 Unggah: admin memilih `.json` atau `.csv`; klien memanggil `POST /api/v1/admin/import-batches` (multipart).
3. Server menjalankan I2, menghitung `file_sha256`, menolak duplikat/batch aktif, menyimpan file asli (`private/imports/<uuid>`), membuat `import_batches` (`UPLOADED`) dan job `import-validate` (`async_jobs` `IMPORT_VALIDATE`), lalu merespons 201.
4. Langkah 2 Validasi: klien polling `GET /api/v1/admin/import-batches/{id}` (2 detik) sampai `PREVIEW_READY` atau `FAILED`. Worker menjalankan I3 dan menyimpan hasil per item.
5. Admin meninjau ringkasan dan galat (`GET .../items?status=INVALID`); bila ada galat, memperbaiki berkas dan mengunggah ulang (batch lama tetap sebagai riwayat; admin dapat `cancel`).
6. Langkah 3 Pratinjau: klien memuat pohon item (`GET .../items`) dan, untuk satu item, payload lengkap (`GET .../items/{row_number}`) untuk merender pratinjau memakai komponen pemutar/soal read-only.
7. Langkah 4 Publikasikan: admin memilih `target_status` dan (jika ada peringatan) mencentang pengakuan; klien memanggil `POST .../publish`.
8. Server memvalidasi prasyarat, mengubah status `PUBLISHING`, membuat job `import-publish`; worker menjalankan I5.
9. Pada sukses: status `PUBLISHED`, `published_at`, hitungan `created/updated/skipped`, `content_revisions` dan `audit_log` `IMPORT_PUBLISHED`. Pada penghalang/galat: status sesuai I5, `summary.last_error` terisi.
10. Admin dapat `rollback` batch `PUBLISHED` (I6) atau `cancel` batch belum terpublikasi.

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/import.ts`. Semua endpoint **Auth: admin**. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN`, `CSRF_ORIGIN_MISMATCH`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED` (bucket `import_admin` 10/jam), `INTERNAL_ERROR`.

**`BatchDTO`:** `{ id: uuid, format: "JSON"|"CSV", csv_kind: "QUESTIONS"|null, contract_version: string|null, file_name: string, status: enum import_status, total_items: int, valid_items: int, invalid_items: int, created_count: int, updated_count: int, skipped_count: int, summary: { warnings: int, noop: int, by_kind: object, last_error: { code: string, message: string, blockers?: Blocker[] }|null }|null, target_status: "DRAFT"|"PUBLISHED"|null, job: JobDTO|null, created_at: string, validated_at: string|null, published_at: string|null }` (`file_name` hanya nama dasar yang disanitasi, maks 255 karakter).
**`ItemDTO`:** `{ row_number: int, entity_kind: "MODULE"|"SUB_MODULE"|"ASSESSMENT_SET"|"QUESTION", entity_code: string|null, status: "VALID"|"INVALID"|"APPLIED"|"SKIPPED", action: "CREATE"|"UPDATE"|"NOOP"|null, errors: [{ path: string, code: string, message: string, severity: "error"|"warning" }], content_hash: string|null }`.

### POST /api/v1/admin/import-batches
- **Success status:** 201 | **Content-Type:** `multipart/form-data` | **Zod:** `CreateImportBatchFieldsSchema`
| Part | Type | Required | Constraint |
|---|---|---|---|
| `format` | text | ya | `JSON` \| `CSV` |
| `csv_kind` | text | wajib bila `CSV`; dilarang bila `JSON` | `QUESTIONS` |
| `file` | file | ya (tepat satu) | I2 |
**Response (Success) 201:**
```json
{ "data": { "id": "ba7c0001-0000-4000-8000-000000000001", "format": "JSON", "csv_kind": null, "contract_version": "1.1", "file_name": "tier2-batch1.json", "status": "UPLOADED", "total_items": 0, "valid_items": 0, "invalid_items": 0, "created_count": 0, "updated_count": 0, "skipped_count": 0, "summary": null, "target_status": null, "job": { "id": "e5d4c3b2-4444-4000-8000-0000000000f4", "kind": "IMPORT_VALIDATE", "status": "QUEUED", "stage": null, "progress_percent": 0, "queue_position": 1, "error_code": null, "attempt": 0 }, "created_at": "2026-11-03T13:00:00.000Z", "validated_at": null, "published_at": null } }
```
(`JobDTO.kind` untuk impor: `IMPORT_VALIDATE` \| `IMPORT_PUBLISH`.)
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | IMPORT_FILE_INVALID | Pelanggaran I2. `details[].code`: `invalid_encoding`, `double_bom`, `control_char`, `json_syntax`, `depth_exceeded`, `forbidden_key`, `contract_version_unsupported`, `too_many_items`, `csv_header_invalid`, `too_many_rows`, `too_many_columns`, `cell_too_long` |
| 400 | VALIDATION_ERROR | Field multipart salah (`csv_kind` hilang/berlebih, `multiple_files`, `file_required`) |
| 409 | IMPORT_IN_PROGRESS | Ada batch aktif lain |
| 409 | DUPLICATE_BATCH | `file_sha256` sama dengan batch `PREVIEW_READY`/`PUBLISHING`/`PUBLISHED`; `details[0].message` = id batch |
| 413 | PAYLOAD_TOO_LARGE | > 5 MB |
| 415 | UNSUPPORTED_MEDIA_TYPE | Bukan multipart |
| 415 | UNSUPPORTED_FILE_TYPE | Bukan JSON/CSV teks |
| 429 | RATE_LIMITED | `import_admin` |

### GET /api/v1/admin/import-batches
- **Success status:** 200 | Query: `status` (nilai `import_status`, opsional), `page`, `page_size` (1-100, default 20). Urutan `created_at DESC`.
**Response:** `{ "data": [ <BatchDTO> ], "meta": { "page": 1, "page_size": 20, "total": 1 } }`

### GET /api/v1/admin/import-batches/{batch_id}
- **Success status:** 200 | **Response:** `{ "data": <BatchDTO> }` (dipakai polling). **Error:** `NOT_FOUND` (404).

### GET /api/v1/admin/import-batches/{batch_id}/items
- **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `status` | enum | tidak | `VALID` \| `INVALID` \| `APPLIED` \| `SKIPPED` |
| `action` | enum | tidak | `CREATE` \| `UPDATE` \| `NOOP` |
| `entity_kind` | enum | tidak | nilai `entity_kind` |
| `page`, `page_size` | int | tidak | page_size 1-200 (default 50) |
Urutan `row_number ASC`. **Response (Success):**
```json
{ "data": [ { "row_number": 2, "entity_kind": "SUB_MODULE", "entity_code": "2.1.3", "status": "INVALID", "action": null, "errors": [ { "path": "sub_modules[0].active_drill.questions[1].correct_answers[0]", "code": "answer_not_in_options", "message": "Jawaban benar harus salah satu opsi.", "severity": "error" }, { "path": "sub_modules[0].materials.videos[0]", "code": "video_unverified", "message": "Video baru akan dibuat dengan status belum diverifikasi.", "severity": "warning" } ], "content_hash": null } ], "meta": { "page": 1, "page_size": 50, "total": 1 } }
```
**Error:** `NOT_FOUND` (404), `VALIDATION_ERROR` (400).

### GET /api/v1/admin/import-batches/{batch_id}/items/{row_number}
- **Success status:** 200 | **Response:** `{ "data": { ...ItemDTO, "payload": { /* item ternormalisasi sesuai kontrak SPEC-004 */ } } }` untuk pratinjau; `payload` null bila sudah dipurge (I7).
**Error:** `NOT_FOUND` (404; batch/baris tidak ada).

### POST /api/v1/admin/import-batches/{batch_id}/publish
- **Success status:** 202 | **Zod:** `PublishBatchRequestSchema`
| Field | Type | Required | Constraint |
|---|---|---|---|
| `target_status` | enum | ya | `DRAFT` \| `PUBLISHED` |
| `acknowledge_warnings` | boolean | tidak | default `false`; wajib `true` bila `summary.warnings > 0` |
```json
{ "target_status": "DRAFT", "acknowledge_warnings": true }
```
**Response (Success) 202:** `{ "data": <BatchDTO status "PUBLISHING" dengan job IMPORT_PUBLISH> }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Batch tidak ada |
| 409 | BATCH_NOT_PUBLISHABLE | Status bukan `PREVIEW_READY` |
| 409 | BATCH_HAS_ERRORS | `invalid_items > 0` |
| 409 | WARNINGS_NOT_ACKNOWLEDGED | `summary.warnings > 0` dan `acknowledge_warnings` bukan `true` |
| 409 | IMPORT_IN_PROGRESS | Batch aktif lain |
Kegagalan di worker (bukan respons langsung): lihat I5 (`PUBLISH_BLOCKED`) dan `FAILED` `VALIDATION_CHANGED` (rencana segar menemukan galat baru).

### POST /api/v1/admin/import-batches/{batch_id}/cancel
- **Success status:** 200 | **Response:** `{ "data": <BatchDTO status "CANCELLED"> }`
**Error**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Batch tidak ada |
| 409 | BATCH_NOT_CANCELLABLE | Status selain `UPLOADED`/`PREVIEW_READY` |

### POST /api/v1/admin/import-batches/{batch_id}/rollback
- **Success status:** 200 | **Response:** `{ "data": <BatchDTO status "ROLLED_BACK"> }`
**Error**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Batch tidak ada |
| 409 | BATCH_NOT_ROLLBACKABLE | Status bukan `PUBLISHED` |
| 409 | ROLLBACK_BLOCKED | I6; `details[]` memuat `{ path: "<entity_code>", code: "has_user_data", message: "..." }` per entitas penahan |

### GET /api/v1/admin/import-templates/{kind}
- **Success status:** 200 | `kind` ∈ `content-package` (berkas JSON contoh valid minimal: 1 modul, 1 sub-modul dengan 2 soal; `Content-Disposition: attachment; filename="content-package.template.json"`) dan `questions-csv` (header + 2 baris contoh; `filename="questions.template.csv"`). **Error:** `NOT_FOUND` (404) untuk `kind` lain.

### GET /api/v1/admin/import-contract
- **Success status:** 200 | **Response:** `{ "data": { "contract_version": "1.1", "json_schema": { /* hasil z.toJSONSchema(ContentPackageSchema) */ } } }`

## Database Changes
Tidak ada tabel/kolom baru. Memakai `import_batches` (`admin_user_id`, `format`, `contract_version`, `file_name`, `file_sha256`, `storage_key`, `status`, hitungan, `summary`, `created_at`, `validated_at`, `published_at`), `import_batch_items`, `content_revisions` (kolom `import_batch_id`), `async_jobs` (`import_batch_id`). `csv_kind` dan `target_status` disimpan di `import_batches.summary` (`summary.csv_kind`, `summary.target_status`) agar tanpa kolom baru. Berkas asli di `private/imports/<uuid>` (izin direktori 0700). Worker mendaftarkan handler `import-validate` dan `import-publish` (concurrency 1, tidak memegang kunci advisory AI 727001). Tugas purge: `purgeImportBatches`. Audit: `IMPORT_UPLOADED`, `IMPORT_VALIDATED`, `IMPORT_PUBLISHED`, `IMPORT_CANCELLED`, `IMPORT_ROLLED_BACK` (selalu memuat `batch_id`). Seluruh penulisan konten lewat `applyContentPlan` dan `PublishService` (SPEC-004).

## UI/UX
Rujukan: `design-system.md` 5.20 Admin Importer (stepper 4 langkah), 5.6 Table, 5.4 Dialog/Sheet, 5.7 Badge/Progress/Toast, 8.9 wireframe Admin Importer.

- **`/admin/impor` (riwayat):** Table (Tanggal, File, Jenis, Status (Badge ikon + teks), Item, Aksi); Button "Impor Baru"; aksi baris: "Lanjutkan" (batch `UPLOADED`/`PREVIEW_READY`), "Batalkan", "Kembalikan (Rollback)" (Dialog destruktif yang menjelaskan I6). Kosong: "Belum ada impor."
- **Wizard `/admin/impor/[batch_id]`** (stepper `aria-current="step"`): 
  1. **Unggah:** dropzone besar (klik/seret + Button "Pilih berkas"), format .json/.csv, batas "maks 5 MB", tautan "Unduh templat JSON", "Unduh templat CSV", "Lihat kontrak data" (Dialog JSON Schema dari `/import-contract`).
  2. **Validasi:** tiga kartu angka (Valid, Peringatan, Error) dari `BatchDTO`; Progress job bila `VALIDATING`; Table galat (Baris, Path, Pesan Indonesia, Tingkat (ikon `XCircle`/`AlertTriangle` + teks)); filter "Hanya error"; Button "Unduh laporan galat" (CSV dibuat klien dari `items?status=INVALID`; sel yang diawali `= + - @ \t \r` diberi awalan `'`). Tombol "Lanjut" disabled bila `invalid_items > 0`; peringatan boleh dilanjutkan dengan Checkbox "Saya memahami peringatan ini".
  3. **Pratinjau:** pohon Tier > Modul > Sub-Modul dari item dengan Badge "Baru" / "Diubah" / "Tanpa perubahan" (ikon + teks); klik item membuka Sheet pratinjau yang merender materi dan soal dengan komponen pemutar/`QuestionRenderer` mode baca-saja (tanpa memanggil API attempt; kunci jawaban ditampilkan hanya di pratinjau admin).
  4. **Publikasikan:** RadioGroup "Simpan sebagai draf (disarankan)" / "Publikasikan sekarang" (peringatan `asset_unverified` menonaktifkan opsi Publikasikan dengan teks alasan); Dialog konfirmasi ringkas ("{n} dibuat, {m} diperbarui, {k} tanpa perubahan"); Progress job `IMPORT_PUBLISH`; hasil berisi ringkasan + tautan ke `/admin/konten/kurikulum` (SPEC-020).
- Banner pada tahap 2-4 bila sumber NC dipakai (`license-summary`, SPEC-018).
- State: loading Skeleton; galat jaringan: Toast "Coba lagi"; `PUBLISH_BLOCKED`: kartu daftar penghalang dengan tautan ke aset terkait di `/admin/konten/aset`.
- Mobile: wizard satu kolom; tabel menjadi kartu.

## Acceptance Criteria
- [ ] **Given** berkas JSON valid 20 sub-modul **When** `POST /import-batches` **Then** 201 `status="UPLOADED"`, job `IMPORT_VALIDATE` `QUEUED`; setelah worker selesai `GET` memberi `status="PREVIEW_READY"`, `total_items` = jumlah item, `invalid_items=0`.
- [ ] **Given** berkas 5,1 MB **When** diunggah **Then** 413 `PAYLOAD_TOO_LARGE`; `.xlsx` -> 415 `UNSUPPORTED_FILE_TYPE`; berkas bukan UTF-8 -> 400 `IMPORT_FILE_INVALID` `invalid_encoding`; dua BOM -> `double_bom`.
- [ ] **Given** JSON berisi `{"__proto__":{"x":1}}` pada kedalaman berapa pun **When** diunggah **Then** 400 `forbidden_key`, tidak ada baris `import_batches`, dan `({}).x === undefined`; kedalaman 11 -> `depth_exceeded`; 2.001 item -> `too_many_items`.
- [ ] **Given** CSV dengan header salah **When** diunggah **Then** 400 `csv_header_invalid`; 5.001 baris -> `too_many_rows`.
- [ ] **Given** batch dengan satu item galat `answer_not_in_options` **When** divalidasi **Then** `status="PREVIEW_READY"`, `invalid_items=1`, item muncul di `items?status=INVALID` dengan `path` dan `code` tepat; `POST .../publish` -> 409 `BATCH_HAS_ERRORS`.
- [ ] **Given** batch dengan peringatan `video_unverified` **When** `publish` tanpa `acknowledge_warnings` **Then** 409 `WARNINGS_NOT_ACKNOWLEDGED`; dengan `acknowledge_warnings=true` dan `target_status="DRAFT"` -> 202.
- [ ] **Given** `target_status="PUBLISHED"` dengan aset `UNVERIFIED` **When** worker menerapkan **Then** transaksi dibatalkan, tidak ada entitas berubah, batch kembali `PREVIEW_READY` dengan `summary.last_error.code="PUBLISH_BLOCKED"` dan daftar `blockers` memuat `ASSET_UNVERIFIED`.
- [ ] **Given** batch `DRAFT` valid **When** publish selesai **Then** `status="PUBLISHED"`, `created_count`+`updated_count`+`skipped_count` = `total_items`, entitas `DRAFT` ada, `content_revisions` terisi dengan `import_batch_id`, `audit_log` `IMPORT_PUBLISHED`.
- [ ] **Given** berkas yang sama diunggah ulang setelah `PREVIEW_READY`/`PUBLISHED` **When** diunggah **Then** 409 `DUPLICATE_BATCH`; berkas sama setelah batch `CANCELLED`/`ROLLED_BACK` -> diterima.
- [ ] **Given** batch `VALIDATING` **When** mengunggah batch lain **Then** 409 `IMPORT_IN_PROGRESS`; 11 unggahan dalam satu jam -> 429 `RATE_LIMITED`.
- [ ] **Given** isi berkas diimpor kedua kali dengan perubahan satu soal **When** tervalidasi **Then** satu item `UPDATE`, sisanya `NOOP`, dan saat dipublikasi `version` set naik 1 hanya untuk set yang berubah.
- [ ] **Given** CSV `QUESTIONS` dengan 3 baris untuk set `ACTIVE_DRILL:2.1.3` yang ada **When** dipublikasi **Then** `questions_json` set memuat soal baru/terbarui, `question_count` benar, `version` +1 sekali (bukan 3 kali).
- [ ] **Given** CSV dengan sel `=cmd|' /C calc'!A0` **When** divalidasi **Then** item `INVALID` dengan `formula_injection`; set yang tidak ada -> `set_not_found`.
- [ ] **Given** `rollback` pada batch `PUBLISHED` yang item `CREATE`-nya belum dirujuk data pengguna **When** dipanggil **Then** 200 `ROLLED_BACK`, entitas baru terhapus, entitas `UPDATE` kembali ke isi sebelum batch (versi +1), `audit_log` `IMPORT_ROLLED_BACK`.
- [ ] **Given** sub-modul hasil batch sudah dikerjakan pengguna (ada `attempts`) **When** `rollback` **Then** 409 `ROLLBACK_BLOCKED` dan tidak ada perubahan sama sekali.
- [ ] **Given** `cancel` pada `PREVIEW_READY` **When** dipanggil **Then** 200 `CANCELLED`; pada `PUBLISHED` -> 409 `BATCH_NOT_CANCELLABLE`.
- [ ] **Given** pengujian akses **When** `learner` memanggil endpoint mana pun **Then** 403 `FORBIDDEN`; tanpa sesi 401.
- [ ] **Given** server **When** memproses impor **Then** tidak ada permintaan jaringan keluar (tidak ada `fetch` ke URL dari payload; uji dengan URL `http://169.254.169.254/` di `image_url` -> hanya dicari `asset_code`, hasil `asset_not_found`).
- [ ] **Given** `GET /import-templates/content-package` **When** diunduh lalu diunggah apa adanya **Then** lolos validasi (templat selalu valid).
- [ ] **Given** tugas purge **When** batch `PUBLISHED` berumur 91 hari **Then** file asli dan `payload` item dihapus dan `GET .../items/{row}` mengembalikan `payload: null`; hitungan batch tetap.
- [ ] **Given** E2E Playwright **When** admin mengunggah templat JSON, melihat pratinjau, menyimpan sebagai draf, lalu rollback **Then** seluruh alur berjalan, stepper menandai langkah aktif, dan pada 375x812 tidak ada scroll horizontal.

## Edge Cases & Validation
- [ ] Worker mati saat `VALIDATING`/`PUBLISHING`: job dikerjakan ulang pg-boss; publikasi idempoten karena satu transaksi (tidak ada penulisan parsial).
- [ ] `file_name` berisi path/`..`/karakter kontrol: disanitasi menjadi nama dasar (`[A-Za-z0-9._-]`, lainnya `_`), maks 255.
- [ ] Item sama muncul dua kali dalam satu berkas (kunci alami ganda): item kedua `INVALID` `duplicate_item`.
- [ ] Modul pada paket belum ada dan tidak ada di DB tetapi sub-modul merujuknya: `module_not_found` pada sub-modul.
- [ ] Impor mengubah set yang punya attempt `IN_PROGRESS` dengan `target_status` apa pun: item `UPDATE` pada set itu menghasilkan galat `set_has_active_attempts` (tidak diterapkan).
- [ ] Admin dihapus/dinonaktifkan di tengah impor: job tetap selesai; `admin_user_id` dipertahankan (FK RESTRICT mencegah hapus fisik).

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; CSV dibatasi `QUESTIONS`; target status draf/publikasi |
