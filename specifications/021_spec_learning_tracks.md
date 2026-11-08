# SPEC-021: Jalur Belajar (Learning Track) dan Gaya Penyampaian Materi

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-004); direvisi teknis oleh Analyst 2026-11-08 (menyelaraskan dengan SPEC-025/ADR-005)
- **Created:** 2026-11-08
- **Status:** approved (human, 2026-11-08, via /build-feature: disetujui apa adanya); revisi teknis 2026-11-08 menunggu konfirmasi human pada butir "Keputusan Analyst"
- **Depends on:** SPEC-003, SPEC-004, SPEC-005, SPEC-007, SPEC-022 (migrasi `0002` dan penambahan nilai enum `TRACK_CHECKPOINT`), SPEC-025. Dependensi berstatus `ready_to_test` dianggap cukup (dispensasi human).
- **Prioritas:** P1 (setelah MVP evaluasi Writing GT)
- **Urutan build:** KE-2 dari 4 (022 -> 021 -> 024 -> 023).
- **Cakupan:** Backend (entitas jalur, gatekeeping per jalur, varian materi, checkpoint) + Frontend (pemilih jalur di peta belajar, sakelar gaya di pemutar) + Konten (berkas jalur dan varian materi)

## User Story
Sebagai Learner IELTS General Training (profil lokal), saya ingin memilih jalur belajar dengan susunan materi dan cara penyampaian yang berbeda (terstruktur, intensif per skill, sprint berbatas waktu), sehingga saya belajar dengan cara yang paling cocok untuk saya tanpa kehilangan progres yang sudah ada.

## Non-Goals / Out of Scope
- Tidak menyalin sub-modul: jalur hanya MERUJUK sub-modul yang sama (satu progres, bukan satu progres per jalur).
- Tidak ada pembuatan atau pengubahan jalur oleh learner, tidak ada endpoint/halaman admin untuk jalur (SPEC-025). Jalur didefinisikan lewat berkas `content/gt-tracks/tracks.json` + `db:seed`/`content:import`.
- Tidak mengubah kurikulum Tier 1-4 yang ada; jalur "Terstruktur" adalah kurikulum itu sendiri.
- Jalur TIDAK PERNAH membuka sub-modul yang terkunci oleh Tier/Boss/Skip Test (keputusan human, D5). Tidak ada "jalan pintas" melewati Boss Stage.
- Tidak ada jadwal/kalender/pengingat harian otomatis. "Minggu" dan "Hari" pada Sprint adalah pengelompokan logis, bukan tanggal.
- Tidak ada Boss Stage atau Skip Test khusus jalur; keduanya tetap milik Tier dan diakses lewat peta `GT-STRUCT`.
- Checkpoint tidak mengunci apa pun dan tidak memberi poin/mahkota (D8).
- Tidak ada konten Academic di jalur mana pun.

## Definisi Tetap
**D1. Jalur** = daftar berurutan rujukan sub-modul + metadata (`code`, `title`, `description`, `kind`, `layout`, `delivery_style_default`, `target_band_min/max`, `recommended_for`, `sort_order`). `kind='CURRICULUM'` (hanya `GT-STRUCT`): urutan DITURUNKAN saat baca dari kurikulum (tidak punya baris di `learning_track_items`); `kind='CURATED'`: urutan dari `learning_track_items`.

**D2. Jalur awal (seed `content/gt-tracks/tracks.json`).** Urutan item = urutan array. `CP` = Checkpoint.
| Kode | Nama | `layout` | Gaya default | Band target | Isi |
|---|---|---|---|---|---|
| `GT-STRUCT` | Terstruktur Tier 1-4 | `LIST` | `LEARN_FIRST` | 3.0-7.5 | 31 sub-modul yang tampil pada `EXAM_MODULE=GENERAL_TRAINING` (33 baris seed `curriculum-structure` dikurangi `3.3.1` dan `4.1.1` yang bertag ACADEMIC; `3.3.3` dan `4.1.3` bertag GENERAL_TRAINING ikut), urutan Tier -> modul -> sub-modul. Tanpa Checkpoint; gerbang Boss/Skip SPEC-003 utuh |
| `GT-WRITING` | Intensif Writing GT | `LIST` | `CASE_BASED` | 5.5-7.0 | `1.1.1`, `1.1.2`, `1.1.3`, `1.1.4`, CP, `2.1.1`, `2.1.2`, `2.1.4`, `2.2.1`, `2.2.2`, CP, `3.3.3`, `3.3.2`, `4.1.3`, `4.1.2`, `4.2.1`, `4.2.2`, CP (15 sub-modul + 3 CP) |
| `GT-READING` | Intensif Reading GT | `LIST` | `PRACTICE_FIRST` | 5.5-7.0 | `1.3.2`, `2.3.1`, `2.2.2`, `3.2.1`, CP, `3.2.2`, `4.1.3`, `4.3.1`, CP (7 sub-modul + 2 CP) |
| `GT-SPRINT-4W` | Sprint 4 Minggu | `SPRINT` | `PRACTICE_FIRST` | 6.0-6.5 | Minggu 1: `1.1.3`, `1.1.4`, `2.1.1`, `2.1.2`, `2.1.4`, CP. Minggu 2: `2.2.2`, `2.3.1`, `2.3.2`, `3.1.1`, `3.2.1`, CP. Minggu 3: `3.1.2`, `3.2.2`, `3.3.3`, `3.3.2`, `3.4.1`, CP. Minggu 4: `3.4.2`, `3.4.3`, `4.1.3`, `4.2.2`, `4.3.1`, CP. Tiap sub-modul membawa `week_no` (1-4) dan `day_no` (1-5) berurutan (20 hari, 20 sub-modul, 4 CP) |
Pemilihan isi: jalur diurutkan menaik menurut Tier (agar tidak menabrak gerbang Tier, D5) dan mengacu pada sub-modul GT/COMMON yang sudah ada di seed `curriculum-structure`. Konten Reading/Listening GT per bank soal (SPEC-022) bukan sub-modul dan tidak termasuk jalur.

**D3. Gaya penyampaian** (`delivery_style`): `LEARN_FIRST` (artikel -> drill -> terapkan; = materi bawaan), `PRACTICE_FIRST` (drill dulu, penjelasan muncul setelah salah/selesai, lalu terapkan), `CASE_BASED` (contoh jawaban model + analisis, lalu menulis sendiri = Mini-Task). Satu sub-modul boleh menyediakan satu varian materi per gaya `PRACTICE_FIRST`/`CASE_BASED`. Materi bawaan disimpan sebagai `learning_materials.style='BASE'` dan dilayani untuk `LEARN_FIRST`.
**Resolusi gaya** (fungsi murni `resolveStyle`): `requested` = parameter `style` pada permintaan (sumber `QUERY`) jika ada; selain itu override profil di `user_sub_module_styles` (sumber `USER_OVERRIDE`); selain itu `delivery_style_default` jalur aktif (sumber `TRACK_DEFAULT`). `applied` = `requested` bila `requested='LEARN_FIRST'` atau varian untuk `requested` ada pada sub-modul itu; selain itu `LEARN_FIRST` (jatuh ke bawaan tanpa galat).
**Aturan varian.** Varian wajib `article_markdown`; `videos`, `slides`, `attachments`, `mini_task` opsional dan bila tidak ada MEWARISI dari materi bawaan. Varian dengan `style='LEARN_FIRST'` ditolak validator (`style_reserved`).
**Perilaku gaya di pemutar.** `PRACTICE_FIRST` (terterap bila `applied`=`PRACTICE_FIRST`): tab terbuka awal = `DRILL`; syarat `LEARN_NOT_COMPLETED` pada permulaan Active Drill DILEWATI (belajar tetap wajib agar sub-modul `COMPLETED`, SPEC-003 D4/D7 tidak berubah); setelah drill selesai dengan >= 1 jawaban salah, hasil menampilkan tombol "Baca penjelasan" yang membuka tab `LEARN`. `CASE_BASED`: urutan tab tetap `LEARN` -> `DRILL` -> `MINI_TASK`, isi tab `LEARN` memakai varian. `LEARN_FIRST`: perilaku SPEC-005/006 apa adanya.

**D4. Progres bersama.** `user_sub_module_progress` tetap satu per (profil, sub-modul). Menyelesaikan sub-modul di satu jalur dihitung selesai di semua jalur.

**D5. Gerbang (KEPUTUSAN HUMAN FINAL): gerbang Tier/Boss/Skip berlaku di SEMUA jalur.** Jalur hanya mengubah susunan dan tampilan; jalur tidak pernah membuka sub-modul yang terkunci oleh Tier/Boss. Aturan `trackStatus(sub, track)` (fungsi murni di `src/server/gatekeeping/track.ts`, dipanggil dari `recompute`):
1. Status tersimpan `user_sub_module_progress.status` selain `LOCKED` adalah status sub-modul itu di jalur mana pun (monoton, tidak pernah mengunci ulang).
2. Bila status tersimpan `LOCKED` dan Tier sub-modul itu berstatus `LOCKED` (`user_tier_progress`) -> tetap `LOCKED` dengan `lock_reason.code='TIER_LOCKED'` di SEMUA jalur termasuk `GT-STRUCT`. Tier hanya terbuka lewat SPEC-003 D6 (Boss lulus, Skip Test Tier, Placement).
3. Jalur `GT-STRUCT`: SPEC-003 D2/D4 utuh (rantai per Tier).
4. Jalur `CURATED` yang AKTIF, Tier tidak `LOCKED`: item `SUB_MODULE` pertama (yang AVAILABLE) terbuka; item `SUB_MODULE` ke-n terbuka bila item `SUB_MODULE` AVAILABLE sebelumnya pada jalur itu berstatus `COMPLETED` atau `SKIPPED`. Item yang tidak AVAILABLE (`COMING_SOON`, bukan `PUBLISHED`) dilewati dan tidak memblokir. Hasil ditulis sebagai `UNLOCKED` dengan `unlock_source='SEQUENTIAL'` oleh `recompute`.
5. `CHECKPOINT` bukan sub-modul dan diabaikan saat menentukan predecessor.
6. Evaluasi aturan 4 dijalankan untuk jalur aktif pada setiap `recomputeStatuses` dan sekali saat `PUT /api/v1/me/active-track`. Sub-modul yang sudah dibuka tetap terbuka bila jalur diganti.
7. Boss Stage dan Skip Test tidak muncul sebagai item jalur `CURATED`; tombolnya hanya ada di peta Tier (`GT-STRUCT`). Alasan kunci `TIER_LOCKED` pada jalur lain menampilkan tautan "Lihat Boss Stage" ke `/peta?track=GT-STRUCT`.

**D6. Jalur aktif.** Tiap profil punya paling banyak satu jalur aktif: `users.active_track_id`; NULL, atau menunjuk jalur yang tidak `PUBLISHED`, berarti `GT-STRUCT`. Mengganti jalur tidak menghapus atau mengubah progres.

**D7. Resume (SPEC-007)** tidak berubah semantiknya: tetap menunjuk posisi terakhir lintas jalur; kartu menambah field `active_track` (`{ code, title }`).

**D8. Checkpoint** (pengganti Boss pada jalur `CURATED`; TIDAK mengunci). Item `CHECKPOINT` mencakup semua item `SUB_MODULE` sejak Checkpoint sebelumnya (atau awal jalur). Status checkpoint untuk profil:
- `NOT_READY`: ada sub-modul AVAILABLE yang dicakup berstatus selain `COMPLETED`/`SKIPPED`.
- `READY`: semua yang dicakup `COMPLETED`/`SKIPPED` dan belum ada attempt.
- `ATTEMPTED`: ada attempt `TRACK_CHECKPOINT` selesai, tidak ada yang lulus.
- `PASSED`: ada attempt selesai dengan `scorePercent >= 75`.
Komposisi (saat `POST .../attempts`): kolam = soal objektif (`OBJECTIVE_TYPES`) dari set `ACTIVE_DRILL` berstatus `PUBLISHED` milik sub-modul AVAILABLE yang dicakup, TANPA set ber-`reading_passage_markdown` atau `listening_asset_id`. Ambil 10 soal: bergilir antar sub-modul menurut urutan jalur (satu soal tiap giliran), dalam sub-modul diacak oleh CSPRNG, tanpa duplikat, berhenti saat 10 soal atau kolam habis. Kolam < 5 soal -> tidak dapat dimulai (`422 CHECKPOINT_NOT_ENOUGH_QUESTIONS`). Attempt: `assessment_type='TRACK_CHECKPOINT'`, `assessment_set_id` NULL, `mode='PRACTICE'`, ambang lulus 75%, umpan balik instan, `points_awarded=0`, boleh diulang tanpa batas, menulis radar lewat `skillScoreHook`, tidak menulis progres gatekeeping. Skema `attempts.state`: `{ schema: "checkpoint.v1", track_item_id: uuid, rng_seed: string(32 hex), questions: [{ position, question_id, set_id, sub_module_code, skill, question_type, option_order, question: <Question lengkap> }] }`; `attempt_answers.assessment_set_id` = `set_id` drill asal. Hanya satu attempt `TRACK_CHECKPOINT` `IN_PROGRESS` per profil (memulai yang baru mengubah yang lama menjadi `ABANDONED`).

**D9. Sprint.** Jalur `layout='SPRINT'`: tiap item `SUB_MODULE` punya `week_no` (1-4) dan `day_no` (1-5); satu hari = tepat satu sub-modul inti. "1 mini-task" per hari = Mini-Task milik sub-modul hari itu (`learning_materials.mini_task_json`, mengikuti gaya yang berlaku); hari tanpa Mini-Task hanya memuat sub-modul. Hari selesai bila sub-modulnya `COMPLETED`/`SKIPPED` (Mini-Task adalah bagian penyelesaian menurut SPEC-003 D7, bukan entitas baru). Tiap minggu ditutup satu Checkpoint. Urutan gerbang sama dengan jalur `CURATED` lain (D5).

## Technical Flow
1. Penulis konten mengisi `codes/content/gt-tracks/tracks.json` (kontrak konten 1.2: `learning_tracks[]`) dan menambah `materials_variants[]` pada sub-modul di paket konten, lalu menjalankan `npm run content:validate -- --dir content/gt-tracks` dan `npm run db:seed` (modul seed `learning-tracks`, setelah `curriculum-structure`, memuat berkas yang sama; idempoten per `track_code` lewat `content_hash`). `npm run content:import -- --dir <paket>` mengimpor varian materi.
2. Learner membuka `/peta`, memilih jalur (kartu/Select), UI memanggil `PUT /api/v1/me/active-track`; server menyimpan `users.active_track_id` dan menjalankan `recomputeStatuses` (D5.6).
3. `GET /api/v1/curriculum/tree?track=<code>` mengembalikan `tiers` (tidak berubah) dan `track` (item berurutan beserta status per D5).
4. Pemutar (SPEC-005) memanggil `GET /api/v1/sub-modules/{code}`; server memilih varian materi lewat `resolveStyle` (D3) dan mengembalikan blok `delivery`. Learner dapat menyimpan override lewat `PUT /api/v1/sub-modules/{code}/style`.
5. Learner menekan "Mulai Checkpoint" -> `POST /api/v1/tracks/{track_code}/checkpoints/{item_id}/attempts`; jawaban/submit/hasil memakai endpoint attempt yang ada (layanan attempt memilih handler dari `attempts.assessment_type`, soal dari `attempts.state`, seperti `MIX_PRACTICE` di SPEC-022).

## API Contract
Semua rute `auth: 'user'`; envelope `{ data }` / `{ error }` sesuai `_api-contract.md` bagian 1. Tidak ada `/admin/*`.

### GET /api/v1/tracks
- **Auth:** user. **Sukses:** 200. Hanya jalur `PUBLISHED`, urut `sort_order` menaik.
| Field `data[]` | Tipe | Null | Keterangan |
|---|---|---|---|
| `code` | string | tidak | mis. `GT-WRITING` |
| `title` | string | tidak | 1-100 |
| `description` | string | tidak | 1-500 |
| `kind` | string | tidak | `CURRICULUM`\|`CURATED` |
| `layout` | string | tidak | `LIST`\|`SPRINT` |
| `delivery_style_default` | string | tidak | `LEARN_FIRST`\|`PRACTICE_FIRST`\|`CASE_BASED` |
| `target_band_min`, `target_band_max` | number | tidak | kelipatan 0.5 |
| `recommended_for` | string | tidak | 1-200 |
| `total_sub_modules` | int | tidak | jumlah item `SUB_MODULE` yang tampil pada `EXAM_MODULE` aktif (termasuk `COMING_SOON`) |
| `completed_sub_modules` | int | tidak | yang berstatus `COMPLETED` atau `SKIPPED` |
| `checkpoint_count` | int | tidak | 0 untuk `GT-STRUCT` |
| `is_active` | boolean | tidak | tepat satu `true` |
```json
{ "data": [
  { "code": "GT-STRUCT", "title": "Terstruktur Tier 1-4", "description": "Kurikulum lengkap Tier 1 sampai 4 dengan gerbang Boss Stage.", "kind": "CURRICULUM", "layout": "LIST", "delivery_style_default": "LEARN_FIRST", "target_band_min": 3.0, "target_band_max": 7.5, "recommended_for": "Pemula sampai mahir yang ingin urutan penuh", "total_sub_modules": 31, "completed_sub_modules": 4, "checkpoint_count": 0, "is_active": true },
  { "code": "GT-WRITING", "title": "Intensif Writing GT", "description": "Surat formal, semi-formal, informal dan esai Task 2.", "kind": "CURATED", "layout": "LIST", "delivery_style_default": "CASE_BASED", "target_band_min": 5.5, "target_band_max": 7.0, "recommended_for": "Target Writing GT lebih tinggi", "total_sub_modules": 15, "completed_sub_modules": 3, "checkpoint_count": 3, "is_active": false } ] }
```
| HTTP | Kode | Kapan |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Tanpa cookie sesi |

### PUT /api/v1/me/active-track
- **Auth:** user. **Sukses:** 204 tanpa body. Idempoten.
| Field | Tipe | Required | Constraint |
|---|---|---|---|
| `track_code` | string | ya | regex `^GT-[A-Z0-9]+(-[A-Z0-9]+)*$`, panjang 4-30 |
```json
{ "track_code": "GT-WRITING" }
```
| HTTP | Kode | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body tidak sesuai tabel (`unrecognized_key`, `invalid_format`, `required`) |
| 401 | `UNAUTHENTICATED` | Tanpa sesi |
| 403 | `CSRF_ORIGIN_MISMATCH` / `HOST_NOT_ALLOWED` | Origin/Host asing |
| 404 | `NOT_FOUND` | Kode tidak ada atau jalur tidak `PUBLISHED` |

### GET /api/v1/curriculum/tree
- **Auth:** user. **Sukses:** 200. Query opsional `track` (regex sama dengan di atas); tanpa `track` = jalur aktif.
**Response:** `data.tiers` = bentuk SPEC-003 apa adanya (status tersimpan). Ditambah `data.track`:
| Field | Tipe | Null | Keterangan |
|---|---|---|---|
| `track.code`, `track.title` | string | tidak | |
| `track.layout` | string | tidak | `LIST`\|`SPRINT` |
| `track.delivery_style_default` | string | tidak | |
| `track.is_active` | boolean | tidak | |
| `track.items[]` | array | tidak | berurutan; `GT-STRUCT` hanya berisi `SUB_MODULE` |
| `items[].position` | int | tidak | mulai 1 |
| `items[].kind` | string | tidak | `SUB_MODULE`\|`CHECKPOINT` |
| `items[].item_id` | uuid | ya | `learning_track_items.id`; NULL untuk `GT-STRUCT` |
| `items[].sub_module` | `SubModuleNodeDTO` | ya | untuk `SUB_MODULE` (bentuk persis `src/contracts/curriculum.ts`; `status` mengikuti D5, `lock_reason` bila `LOCKED`); NULL untuk `CHECKPOINT` |
| `items[].week_no`, `items[].day_no` | int | ya | hanya `layout='SPRINT'` |
| `items[].checkpoint` | objek | ya | untuk `CHECKPOINT`: `{ status: "NOT_READY"\|"READY"\|"ATTEMPTED"\|"PASSED", best_percent: number\|null, covers: string[] (kode sub-modul), pool_size: int, pass_percent: 75 }` |
```json
{ "data": { "tiers": [ "...bentuk SPEC-003 tidak berubah..." ], "track": { "code": "GT-WRITING", "title": "Intensif Writing GT", "layout": "LIST", "delivery_style_default": "CASE_BASED", "is_active": true, "items": [
  { "position": 1, "kind": "SUB_MODULE", "item_id": "0d9b3e0a-5c52-4d0e-9a0e-2f3a1b6c7d01", "week_no": null, "day_no": null,
    "sub_module": { "id": "7a1c0e94-3d2b-4b8a-8f55-0a6d9c1e2b10", "sub_module_code": "1.1.1", "title": "Nouns, Pronouns, Articles (a/an/the), & Plurals", "order_index": 1, "status": "COMPLETED", "content_state": "AVAILABLE", "mastery_crown": "GOLD", "best_score_percent": 100, "progress_percent": 100, "has_mini_task": false, "lock_reason": null }, "checkpoint": null },
  { "position": 5, "kind": "CHECKPOINT", "item_id": "9e8f7a6b-1c2d-4e3f-8a9b-0c1d2e3f4a5b", "week_no": null, "day_no": null, "sub_module": null,
    "checkpoint": { "status": "READY", "best_percent": null, "covers": ["1.1.1", "1.1.2", "1.1.3", "1.1.4"], "pool_size": 16, "pass_percent": 75 } } ] } } }
```
| HTTP | Kode | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `track` tidak sesuai regex |
| 401 | `UNAUTHENTICATED` | Tanpa sesi |
| 404 | `NOT_FOUND` | `track` tidak ada / tidak `PUBLISHED` |

### GET /api/v1/sub-modules/{code}
- **Auth:** user. **Sukses:** 200. Respons SPEC-005 apa adanya, ditambah query opsional `style` (`LEARN_FIRST`\|`PRACTICE_FIRST`\|`CASE_BASED`) dan blok baru `data.delivery`:
| Field | Tipe | Null | Keterangan |
|---|---|---|---|
| `delivery.requested_style` | string | tidak | hasil D3 |
| `delivery.applied_style` | string | tidak | gaya yang benar-benar dilayani |
| `delivery.source` | string | tidak | `QUERY`\|`USER_OVERRIDE`\|`TRACK_DEFAULT` |
| `delivery.available_styles` | string[] | tidak | selalu memuat `LEARN_FIRST`; ditambah gaya yang punya varian |
`data.learn` (artikel/video/slide/lampiran/mini-task) berisi materi `applied_style` (varian yang mewarisi bagian kosong dari bawaan).
```json
{ "data": { "delivery": { "requested_style": "CASE_BASED", "applied_style": "LEARN_FIRST", "source": "TRACK_DEFAULT", "available_styles": ["LEARN_FIRST", "PRACTICE_FIRST"] } } }
```
(contoh hanya memperlihatkan blok baru.) Error tambahan: `400 VALIDATION_ERROR` bila `style` bukan salah satu dari tiga nilai; error lain mengikuti SPEC-005 (`403 LOCKED_CONTENT`, `404 NOT_FOUND`).

### PUT /api/v1/sub-modules/{code}/style
- **Auth:** user. **Sukses:** 204. Menyimpan override gaya profil untuk satu sub-modul.
| Field | Tipe | Required | Constraint |
|---|---|---|---|
| `style` | string \| null | ya | `LEARN_FIRST`\|`PRACTICE_FIRST`\|`CASE_BASED`; `null` menghapus override |
```json
{ "style": "PRACTICE_FIRST" }
```
| HTTP | Kode | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body tidak sesuai |
| 401 | `UNAUTHENTICATED` | Tanpa sesi |
| 403 | `LOCKED_CONTENT` | Sub-modul terkunci (aturan SPEC-005) |
| 404 | `NOT_FOUND` | Kode sub-modul tidak ada / tidak AVAILABLE |

### POST /api/v1/tracks/{track_code}/checkpoints/{item_id}/attempts
- **Auth:** user. **Sukses:** 201. Body kosong atau `{}` (strictObject).
**Response (201):** `{ "data": { "attempt_id": uuid, "question_count": int (5-10), "pass_percent": 75, "covers": string[] } }`
```json
{ "data": { "attempt_id": "c2b1a0f9-8e7d-4c6b-9a5f-4e3d2c1b0a99", "question_count": 10, "pass_percent": 75, "covers": ["1.1.1", "1.1.2", "1.1.3", "1.1.4"] } }
```
| HTTP | Kode | Kapan |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Tanpa sesi |
| 404 | `NOT_FOUND` | Jalur/`item_id` tidak ada, `item_id` bukan `CHECKPOINT` milik jalur itu, atau `GT-STRUCT` |
| 409 | `CHECKPOINT_NOT_READY` | Status checkpoint `NOT_READY` |
| 422 | `CHECKPOINT_NOT_ENOUGH_QUESTIONS` | Kolam < 5 soal; `details[0].code = "max_available:<n>"` |

### GET /api/v1/me/last-learned (perubahan aditif)
`data` kartu resume (SPEC-007) menambah `active_track: { code: string, title: string }` (tidak null). Field lain tidak berubah.

### Endpoint attempt untuk `TRACK_CHECKPOINT`
`GET /attempts/{id}`, `PUT /attempts/{id}/answers/{question_id}`, `POST /attempts/{id}/submit`, `GET /attempts/{id}/result` berlaku apa adanya; `result.passed` = `scorePercent >= 75`.

## Database Changes
Migrasi SQLite `codes/drizzle/0003_spec_021_learning_tracks.sql` (dibuat `drizzle-kit generate`, aditif; TIDAK membangun ulang tabel apa pun). Bila drizzle-kit menghasilkan pembangunan ulang `users`, `learning_materials`, atau tabel lain, ganti dengan `ALTER TABLE ... ADD COLUMN` manual (membangun ulang `users` di dalam transaksi memicu `ON DELETE CASCADE` ke seluruh progres).
- `learning_tracks`: `id TEXT PK` (UUID aplikasi), `code TEXT NOT NULL UNIQUE`, `title TEXT NOT NULL`, `description TEXT NOT NULL`, `kind TEXT NOT NULL` (`CURRICULUM`\|`CURATED`), `layout TEXT NOT NULL DEFAULT 'LIST'` (`LIST`\|`SPRINT`), `delivery_style_default TEXT NOT NULL`, `target_band_min REAL NOT NULL`, `target_band_max REAL NOT NULL` (CHECK kelipatan 0.5, 0..9, min <= max), `recommended_for TEXT NOT NULL`, `sort_order INTEGER NOT NULL`, `status TEXT NOT NULL DEFAULT 'DRAFT'` (enum `review_status`), `content_hash TEXT NULL`, `created_at INTEGER NOT NULL`, `updated_at INTEGER NOT NULL`. (Koreksi atas draf lama: `review_status` dinamai `status` seperti tabel lain; ditambah `kind`, `layout`, `sort_order`, `recommended_for`, `content_hash`.)
- `learning_track_items`: `id TEXT PK`, `track_id TEXT NOT NULL` FK `learning_tracks.id` `ON DELETE CASCADE`, `item_kind TEXT NOT NULL` (`SUB_MODULE`\|`CHECKPOINT`), `sub_module_id TEXT NULL` FK `sub_modules.id` `ON DELETE RESTRICT`, `order_index INTEGER NOT NULL`, `week_no INTEGER NULL`, `day_no INTEGER NULL`, `created_at INTEGER NOT NULL`. Indeks/CHECK: unik `(track_id, order_index)`; unik parsial `(track_id, sub_module_id)` WHERE `sub_module_id IS NOT NULL`; CHECK `(item_kind='SUB_MODULE' AND sub_module_id IS NOT NULL) OR (item_kind='CHECKPOINT' AND sub_module_id IS NULL)`; CHECK `(week_no IS NULL AND day_no IS NULL) OR (week_no BETWEEN 1 AND 4 AND day_no BETWEEN 1 AND 5 AND item_kind='SUB_MODULE')`. (Koreksi: `is_checkpoint bool` diganti `item_kind` agar Checkpoint tidak butuh sub-modul.)
- `users.active_track_id TEXT NULL` FK `learning_tracks.id` `ON DELETE SET NULL` (`ALTER TABLE users ADD COLUMN`).
- `learning_materials.style TEXT NOT NULL DEFAULT 'BASE'` (nilai `BASE`\|`PRACTICE_FIRST`\|`CASE_BASED`) via `ALTER TABLE ADD COLUMN`; `DROP INDEX learning_materials_sub_module_id_unique`; `CREATE UNIQUE INDEX learning_materials_sub_style_uq ON learning_materials (sub_module_id, style)`. (Koreksi: `NULL` diganti `'BASE'` agar `ON CONFLICT` biasa dapat dipakai.) Konsekuensi kode: semua query yang memilih materi per `sub_module_id` (pemutar, publikasi, validator, `apply.ts`, view `v_publish_blockers` tetap sah) WAJIB menambah `style = 'BASE'` kecuali pemilih varian; target konflik upsert menjadi `(sub_module_id, style)`.
- `user_sub_module_styles`: `user_id TEXT NOT NULL` FK `users.id` `ON DELETE CASCADE`, `sub_module_id TEXT NOT NULL` FK `sub_modules.id` `ON DELETE CASCADE`, `style TEXT NOT NULL` (`LEARN_FIRST`\|`PRACTICE_FIRST`\|`CASE_BASED`), `updated_at INTEGER NOT NULL`, PK `(user_id, sub_module_id)`.
- Nilai enum `TRACK_CHECKPOINT` pada `attempts.assessment_type` dan CHECK `attempts_set_required_chk` sudah dikerjakan oleh `0002` (SPEC-022); spec ini tidak mengubah tabel `attempts`.
- Seed: modul `learning-tracks` di `scripts/seed.ts` (urutan: setelah `curriculum-structure`), status jalur `PUBLISHED`.

**Kontrak konten 1.2** (`src/contracts/content.ts`; `contract_version` `"1.2"` diterima di samping `1.1`/`1.0`; semua objek `z.strictObject`):
`ContentPackage` += `learning_tracks?: LearningTrackItem[]` (<= 20). `SubModuleItem` += `materials_variants?: MaterialVariant[]` (<= 2).
| `LearningTrackItem` field | Tipe | Wajib | Constraint |
|---|---|---|---|
| `track_code` | string | ya | `^GT-[A-Z0-9]+(-[A-Z0-9]+)*$`, 4-30, unik |
| `title` | string | ya | 1-100 |
| `description` | string | ya | 1-500 |
| `kind` | enum | ya | `CURRICULUM`\|`CURATED` |
| `layout` | enum | tidak | `LIST` (default)\|`SPRINT` |
| `delivery_style_default` | enum | ya | 3 gaya |
| `target_band_min`, `target_band_max` | number | ya | 0..9 kelipatan 0.5, min <= max |
| `recommended_for` | string | ya | 1-200 |
| `sort_order` | int | ya | 1-99, unik |
| `items` | array | `CURATED`: ya (1-60); `CURRICULUM`: dilarang | `{ kind: "SUB_MODULE", sub_module_code, week_no?, day_no? }` atau `{ kind: "CHECKPOINT" }` |
| `MaterialVariant` field | Tipe | Wajib | Constraint |
|---|---|---|---|
| `style` | enum | ya | `PRACTICE_FIRST`\|`CASE_BASED` (`LEARN_FIRST` -> `style_reserved`) |
| `article_markdown`, `videos`, `slides`, `attachments`, `mini_task` | sama dengan `Materials` kontrak 1.1 | `article_markdown` ya; lainnya tidak | bagian yang tidak ada mewarisi bawaan |
Aturan validator (kode galat persis): `duplicate_track_code`, `duplicate_sort_order`, `sub_module_not_found`, `sub_module_not_gt` (sub-modul bertag ACADEMIC), `duplicate_sub_module_in_track`, `tier_order_violation` (Tier item menurun), `checkpoint_first` (CP item pertama), `checkpoint_adjacent`, `checkpoint_last_required` (item terakhir harus CP), `checkpoint_group_size` (jumlah `SUB_MODULE` antar-CP di luar 1-6, atau 4-6 untuk semua grup kecuali yang terakhir), `sprint_slot_required` (jalur `SPRINT`: setiap `SUB_MODULE` wajib `week_no`+`day_no`), `slot_not_allowed` (selain `SPRINT`), `sprint_slot_order` (pasangan (`week_no`,`day_no`) harus unik dan menaik), `curriculum_items_forbidden`, `style_reserved`, `duplicate_style_variant`, `variant_without_base` (sub-modul belum punya materi bawaan di DB/paket).

## UI/UX
Komponen dari `state/knowledge_base/design-system/design-system.md`: Skill Tree (5.8-5.9), Card (5.3), Badge/Chip/Progress/Tabs/Tooltip/Toast (5.7), Button (5.1), Pemutar Multimodal (5.11), Kuis (5.12), Kartu "Lanjutkan Belajar" (5.10).
- `/peta`: pemilih jalur di atas pohon (Card horizontal yang dapat digulir di mobile, kolom di desktop) memuat judul, `completed/total` + Progress, Chip gaya (ikon + teks: "Belajar dulu", "Latihan dulu", "Studi kasus"), penanda jalur aktif. Memilih kartu memanggil `PUT /me/active-track` lalu memuat `?track=<code>`. `GT-STRUCT` menampilkan pohon Tier lama; jalur `CURATED` menampilkan daftar item (Sprint dikelompokkan "Minggu 1..4" dengan label "Hari n").
- Item: status memakai komponen 5.8; `COMING_SOON` berlabel "Segera hadir" dan tidak memblokir; item `LOCKED` menampilkan `lock_reason.message`, untuk `TIER_LOCKED` ditambah tautan "Lihat Boss Stage". Item Checkpoint: Card dengan Badge status (Belum siap / Siap / Dicoba / Lulus), `best_percent`, tombol "Mulai Checkpoint" (nonaktif + alasan saat `NOT_READY` atau `pool_size < 5`).
- Pemutar: sakelar "Cara belajar" (Tabs: Belajar dulu / Latihan dulu / Studi kasus) hanya bila `available_styles.length > 1`; memilih memanggil `PUT /sub-modules/{code}/style` lalu memuat ulang. Gaya `PRACTICE_FIRST`: tab awal Latihan, tombol "Baca penjelasan" pada hasil bila ada jawaban salah.
- Kartu resume menampilkan nama jalur aktif ("Jalur: Intensif Writing GT").
- State: memuat (kerangka kartu), kosong (jalur tanpa item PUBLISHED: "Belum ada materi terbit di jalur ini."), galat (Toast + "Coba lagi"). Teks Indonesia di `src/i18n/id.ts`.

## Acceptance Criteria
Seluruh AC dapat dibuktikan sekarang dengan fixture konten (tanpa menunggu konten Tier massal), kecuali dinyatakan lain.
- [ ] **AC-1** **Given** DB baru setelah `db:seed` **When** `GET /api/v1/tracks` **Then** tepat 4 jalur berkode `GT-STRUCT`, `GT-WRITING`, `GT-READING`, `GT-SPRINT-4W` berurutan, dengan `total_sub_modules` 31, 15, 7, 20 dan `checkpoint_count` 0, 3, 2, 4; `GT-STRUCT` `items` berurutan Tier -> modul -> sub-modul dan tidak memuat `3.3.1`/`4.1.1`; `total_sub_modules` menghitung rujukan (termasuk `COMING_SOON`), bukan hanya yang terpublikasi.
- [ ] **AC-2** **Given** profil baru **When** `GET /tracks` **Then** `GT-STRUCT.is_active=true`; **When** `PUT /me/active-track {"track_code":"GT-WRITING"}` **Then** 204, `GT-WRITING.is_active=true` dan isi baris `user_sub_module_progress`/`user_module_progress`/`user_tier_progress` profil itu identik sebelum dan sesudah; `track_code` tak dikenal -> 404 `NOT_FOUND`.
- [ ] **AC-3** **Given** sub-modul `2.2.2` ada di `GT-WRITING` dan `GT-STRUCT` **When** `2.2.2` diselesaikan saat `GT-WRITING` aktif **Then** `GET /curriculum/tree?track=GT-STRUCT` menampilkan `2.2.2` berstatus `COMPLETED` dan `completed_sub_modules` naik 1 pada kedua jalur.
- [ ] **AC-4** **Given** jalur aktif `GT-WRITING`, Tier 2 `UNLOCKED`, `2.1.2` selesai **When** `recomputeStatuses` **Then** `2.1.4` berstatus `UNLOCKED` (`unlock_source='SEQUENTIAL'`) walau `2.1.3` belum selesai; **When** jalur diganti ke `GT-STRUCT` **Then** `2.1.4` tetap `UNLOCKED` (tidak pernah mengunci ulang).
- [ ] **AC-5** **Given** sub-modul yang punya varian `PRACTICE_FIRST` **When** `GET /sub-modules/{code}?style=PRACTICE_FIRST` **Then** `delivery.applied_style='PRACTICE_FIRST'`, `source='QUERY'` dan `learn.article_markdown` = artikel varian; **When** gaya diminta tetapi varian tidak ada **Then** `200` dengan `applied_style='LEARN_FIRST'`, tanpa galat dan `learn` = materi bawaan; bagian varian yang kosong (mis. `slides`) mewarisi bawaan.
- [ ] **AC-6** Tes endpoint-guards memuat 5 rute baru (`GET /tracks`, `PUT /me/active-track`, `PUT /sub-modules/{code}/style`, `POST /tracks/{track_code}/checkpoints/{item_id}/attempts`, dan parameter `track` pada `GET /curriculum/tree`) dan menolak tanpa cookie dengan 401; unit gatekeeping per jalur (`trackStatus`) lulus; integrasi migrasi `0003` + seed + progres bersama lulus; E2E Playwright "ganti jalur, progres tetap" lulus.
- [ ] **AC-7 (D5: gerbang Tier tetap berlaku)** **Given** Tier 2 `LOCKED` (Boss Tier 1 belum lulus, tidak ada Skip/Placement), jalur aktif `GT-WRITING`, `1.1.1`-`1.1.4` `COMPLETED`, dan `2.1.1` `PUBLISHED` **When** `GET /curriculum/tree` **Then** item `2.1.1` berstatus `LOCKED` dengan `lock_reason.code='TIER_LOCKED'`; **And** `GET /sub-modules/2.1.1` -> `403 LOCKED_CONTENT` dengan `details[0].code='TIER_LOCKED'`; **And** status tersimpan `2.1.1` di `user_sub_module_progress` tetap `LOCKED`.
- [ ] **AC-8** **Given** kondisi AC-7 **When** Boss Tier 1 lulus (Tier 2 `UNLOCKED`) **Then** `2.1.1` menjadi `UNLOCKED` pada `recomputeStatuses` berikutnya di jalur manapun; **And** pada jalur aktif `GT-SPRINT-4W` dan `GT-READING` item pertamanya yang berada di Tier terkunci juga `LOCKED` (`TIER_LOCKED`).
- [ ] **AC-9** **Given** Boss/Skip Test **When** jalur aktif diganti-ganti **Then** `boss.*` dan `skip_test.*` pada `data.tiers` identik (tidak bergantung jalur) dan tidak ada item bertipe Boss/Skip di `track.items`.
- [ ] **AC-10** **Given** `GT-WRITING` dengan `1.1.1`-`1.1.4` `COMPLETED`, tiap sub-modul punya >= 4 soal objektif drill `PUBLISHED` **When** `POST /tracks/GT-WRITING/checkpoints/{item_id}/attempts` **Then** 201, `question_count=10`, soal berasal dari keempat sub-modul (masing-masing 2 atau 3 soal), tanpa duplikat; **And** menjawab >= 8 benar dari 10 lalu submit -> `passed=true`, `GET /tracks`/tree menampilkan checkpoint `PASSED` dan `best_percent` terisi; **And** `points_awarded=0` dan baris progres gatekeeping tidak berubah.
- [ ] **AC-11** **Given** checkpoint dengan sub-modul tercakup berstatus bukan `COMPLETED`/`SKIPPED` **When** `POST .../attempts` **Then** `409 CHECKPOINT_NOT_READY`; **Given** kolam < 5 soal **Then** `422 CHECKPOINT_NOT_ENOUGH_QUESTIONS` dengan `details[0].code='max_available:<n>'`; **Given** `item_id` bukan checkpoint milik jalur itu **Then** `404 NOT_FOUND`; checkpoint yang `ATTEMPTED` (tidak lulus) tidak mengubah status sub-modul apa pun.
- [ ] **AC-12** **Given** sub-modul `COMING_SOON` di tengah jalur `GT-WRITING` **When** pohon dimuat **Then** ia berlabel `content_state='COMING_SOON'`, tidak memblokir pembukaan item sesudahnya, dan tidak dihitung sebagai predecessor.
- [ ] **AC-13** **Given** `GT-SPRINT-4W` **When** pohon dimuat **Then** `layout='SPRINT'`, 20 item `SUB_MODULE` punya `week_no`/`day_no` unik dan menaik (minggu 1 hari 1 ... minggu 4 hari 5) dan 4 item `CHECKPOINT` masing-masing setelah hari ke-5 tiap minggu.
- [ ] **AC-14** **Given** paket konten uji **When** `content:validate` **Then** tiap kode galat pada daftar aturan validator di atas dihasilkan oleh tepat satu fixture negatif yang sesuai (termasuk `style_reserved`, `tier_order_violation`, `checkpoint_group_size`, `sprint_slot_order`, `variant_without_base`), dan fixture positif lolos.
- [ ] **AC-15** **Given** gaya terterap `PRACTICE_FIRST` dan `learn_completed_at` NULL **When** `POST /attempts` untuk Active Drill sub-modul itu **Then** attempt dibuat (tanpa `LEARN_NOT_COMPLETED`); **Given** gaya `LEARN_FIRST` dengan `learn_completed_at` NULL **Then** tetap `409 LEARN_NOT_COMPLETED`; sub-modul tidak menjadi `COMPLETED` selama belajar belum selesai pada gaya apa pun.
- [ ] **AC-16** **Given** `PUT /sub-modules/{code}/style {"style":"CASE_BASED"}` **When** `GET /sub-modules/{code}` tanpa parameter **Then** `delivery.source='USER_OVERRIDE'`; `{"style":null}` menghapus override dan `source` kembali `TRACK_DEFAULT`.
- [ ] **AC-17** **Given** jalur aktif berstatus tidak `PUBLISHED` atau `users.active_track_id` NULL **When** `GET /tracks` **Then** `GT-STRUCT.is_active=true`.
- [ ] **AC-18** **Given** kartu resume **When** `GET /me/last-learned` **Then** `data.active_track.code` = jalur aktif; semantik posisi terakhir tidak berubah (tes regresi SPEC-007 lulus).
- [ ] **AC-19** **Given** `content:import`/`db:seed` dijalankan dua kali **Then** run kedua `NOOP` (hash sama), jumlah baris `learning_tracks` = 4 dan `learning_track_items` = 51 (`GT-WRITING` 18, `GT-READING` 9, `GT-SPRINT-4W` 24, `GT-STRUCT` 0).

## Edge Cases & Validation
- Jalur berisi sub-modul `COMING_SOON`/belum `PUBLISHED`: ditandai "Segera hadir", dilewati saat menentukan predecessor, tidak memblokir.
- Jalur aktif tidak `PUBLISHED`/dihapus dari berkas: dibaca sebagai `GT-STRUCT`; `users.active_track_id` FK `ON DELETE SET NULL` bila baris jalur dihapus.
- Dua jalur memuat sub-modul yang sama: progres tunggal (D4); resume tetap konsisten.
- Urutan item ditentukan posisi di array berkas; field `order_index` tidak dikirim di berkas (kode `ORDER_INDEX_TAKEN` dari draf lama dipensiunkan; bentrokan mustahil karena diturunkan dari posisi).
- Sub-modul bertag `ACADEMIC` pada `EXAM_MODULE=GENERAL_TRAINING` tidak tampil di jalur mana pun; jalur yang merujuknya ditolak validator (`sub_module_not_gt`).
- Kolam Checkpoint dihitung dari set drill `PUBLISHED` saja; set dengan teks bacaan/audio dikecualikan.
- Mengganti jalur saat attempt `TRACK_CHECKPOINT` `IN_PROGRESS`: attempt tetap berlaku untuk jalur asal; memulai checkpoint lain mengubahnya menjadi `ABANDONED`.
- Sprint tidak punya tanggal: tidak ada status "terlambat".

## Status Implementasi
| Area | Status | Catatan |
|---|---|---|
| Kontrak konten 1.2 + validator (`learning_tracks[]`, `materials_variants[]`) | not_started | |
| Migrasi `0003` + `schema.ts` (tabel jalur, item, override gaya, kolom `style`/`active_track_id`) | not_started | menunggu migrasi `0002` SPEC-022 |
| Berkas `content/gt-tracks/tracks.json` + modul seed `learning-tracks` | not_started | |
| `trackStatus` + perluasan `recompute` (D5) | not_started | |
| Endpoint `GET /tracks`, `PUT /me/active-track`, `PUT /sub-modules/{code}/style`, perluasan tree/sub-module/last-learned | not_started | |
| Checkpoint (komposisi, endpoint, handler `TRACK_CHECKPOINT`) | not_started | |
| UI `/peta` pemilih jalur, sakelar gaya, kartu checkpoint, kartu resume | not_started | |
| Varian materi contoh (>= 1 sub-modul `PRACTICE_FIRST`, >= 1 `CASE_BASED`) | not_started | konten |
| Tes (unit, integrasi, guards, E2E) | not_started | |

## Keputusan Analyst — perlu konfirmasi human
1. Isi jalur per kode sub-modul (D2) dan band target jalur adalah usulan Analyst; urutan menaik Tier agar tidak menabrak gerbang Tier (konsekuensi D5: jalur panjang tetap menunggu Boss Tier).
2. Checkpoint bersifat TIDAK MENGUNCI (penanda evaluasi, lulus >= 75%); draf lama tidak menyatakan apakah ia memblokir.
3. Komposisi Checkpoint: 10 soal objektif drill, bergilir antar sub-modul; siap bila semua yang dicakup selesai.
4. `GT-STRUCT` bersifat turunan dari kurikulum (tanpa baris item), bukan salinan 31 baris.
5. Penyimpanan materi bawaan sebagai `style='BASE'` (bukan NULL); varian `LEARN_FIRST` ditolak.
6. Aturan buka-urut jalur `CURATED` dievaluasi hanya untuk jalur AKTIF (dan saat jalur diganti) agar tidak mengubah progres profil yang tidak memakai jalur.
7. Override gaya per sub-modul disimpan di tabel baru `user_sub_module_styles`.
8. `PRACTICE_FIRST` mengizinkan Active Drill sebelum belajar selesai (penyelesaian sub-modul tetap mensyaratkan belajar).
9. Sprint: hari adalah pengelompokan logis tanpa tanggal; "mini-task harian" = Mini-Task bawaan sub-modul hari itu.
10. `order_index`/`ORDER_INDEX_TAKEN` dipensiunkan di berkas jalur (urutan = posisi array); `is_checkpoint` diganti `item_kind`.

## Human Approval
- [x] Disetujui human (2026-11-08) — substansi produk; D5 (gerbang Tier tetap berlaku) dan dispensasi dependensi `ready_to_test` adalah keputusan human final
- [ ] Konfirmasi human atas revisi teknis 2026-11-08 (butir "Keputusan Analyst")

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
| 2026-11-08 | Human | Draf disetujui apa adanya (build-feature, depth standard) |
| 2026-11-08 | Analyst | Revisi teknis menyelaraskan SPEC-025/ADR-005 dan keputusan human: hapus `admin/tracks`, "dikurasi admin", migrasi Postgres `0008` dan tipe Postgres (diganti migrasi SQLite `0003`, berkas konten + seed); `Depends on` ditambah SPEC-022/025; D5 ditulis ulang (gerbang Tier/Boss/Skip berlaku di semua jalur; aturan buka-urut khusus jalur aktif; alasan `TIER_LOCKED`) beserta AC-7/8/9; isi jalur per kode sub-modul (D2) dan model Sprint (D9: `week_no`/`day_no`, `layout`); Checkpoint diberi model, komposisi, endpoint, tipe attempt `TRACK_CHECKPOINT` (D8); resolusi gaya, aturan varian, perilaku `PRACTICE_FIRST` terhadap `LEARN_NOT_COMPLETED` (D3); API Contract penuh (5 endpoint baru + perluasan tree/sub-module/resume); kontrak konten 1.2 dan kode galat validator; Database Changes terperinci; AC diperluas dari 6 ke 19; tambah Status Implementasi dan "Keputusan Analyst" |
