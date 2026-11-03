# SPEC-007: Resume Last Learned dan Dashboard (TRK-01)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-001, SPEC-003, SPEC-005, SPEC-006
- **Prioritas:** P0
- **Cakupan:** Backend (simpan/baca posisi) + Frontend (kartu "Lanjutkan Belajar", dashboard, perekam posisi di pemutar dan drill)

## User Story
Sebagai Learner, saya ingin dashboard saya menampilkan di paling atas posisi belajar terakhir saya secara presisi (sub-modul, tab, detik video, nomor soal) dengan satu tombol "Lanjutkan Belajar", sehingga saya bisa kembali ke titik terakhir dalam waktu kurang dari 10 detik tanpa mencari-cari.

## Non-Goals / Out of Scope
- Tidak ada riwayat posisi (hanya satu baris per pengguna: posisi terakhir).
- Tidak ada pelacakan analitik/metrik penggunaan tombol (pengukuran 10 detik dilakukan lewat uji E2E, bukan telemetri).
- Tidak ada penyimpanan posisi untuk mode Ujian (Skip Test, Boss, Placement): posisi ujian dipulihkan lewat `GET /attempts/{id}` (SPEC-006), bukan kartu Lanjutkan Belajar.
- Tidak ada penyimpanan posisi scroll artikel, indeks slide, atau draf teks.
- Tidak mengisi kartu radar, riwayat ujian, poin/streak di dashboard (SPEC-016/017 menambahkannya ke slot yang disediakan).
- Tidak ada sinkron real-time antar perangkat (cukup baca terakhir saat dashboard dibuka).

## Technical Flow
1. Pengguna berada di `/belajar/{sub_module_code}`; komponen `PositionRecorder` menyimpan posisi saat: pindah tab utama, pindah sub-tab, video berstatus `PLAYING` (setiap 5 detik, debounce), video dijeda, pindah soal drill, dan `pagehide`/`visibilitychange=hidden` (dengan `fetch(..., { keepalive: true })`).
2. Klien memanggil `PUT /api/v1/me/last-learned` dengan posisi terkini.
3. Server memvalidasi akses sub-modul (`assertSubModuleAccessible`), menurunkan `active_tier_id`/`active_module_id` dari sub-modul, dan melakukan UPSERT pada `user_last_learned_state` (PK `user_id`).
4. Pengguna membuka `/`; halaman memanggil `GET /api/v1/me/last-learned`.
5. Server membaca baris, menentukan `state` (`RESUME` atau `FALLBACK_NEXT`, aturan di bawah), menghitung `position_label` dan `resume_path`, lalu mengembalikan kartu.
6. Klien menampilkan `ResumeCard` di posisi paling atas dengan satu tombol primary "Lanjutkan Belajar".
7. Pengguna menekan tombol; klien menavigasi ke `resume_path` (satu klik, tanpa halaman perantara).
8. Halaman `/belajar/...` membaca query (`tab`, `sub`, `t`, `q`, `attempt`) dan memulihkan: tab, sub-tab, video mulai di `t` detik (`playerVars.start = t`), soal drill ke indeks `q` dari attempt `attempt`.

### Aturan Penentuan Kartu (D-RESUME)
1. Baca `user_last_learned_state` pengguna. Jika tidak ada baris -> langkah 4.
2. Muat sub-modul `active_sub_module_id`. Jika NULL (FK `SET NULL`), tidak `AVAILABLE`, `ARCHIVED`, atau status progres `LOCKED` -> langkah 4.
3. Jika status progres sub-modul `COMPLETED` atau `SKIPPED` -> langkah 4. Selain itu -> `state = "RESUME"` dengan posisi tersimpan.
4. `state = "FALLBACK_NEXT"`: pilih sub-modul pertama dengan status `IN_PROGRESS`, jika tidak ada maka status `UNLOCKED`, diurutkan `(tier_number, modules.order_index, sub_modules.order_index)`. Jika tidak ada -> `data = null`.
   Tab fallback: `learn_completed_at IS NULL` -> `LEARN`; selain itu bila status belum `COMPLETED` -> `DRILL`; selain itu bila Mini-Task ada dan `mini_task_completed_at IS NULL` -> `MINI_TASK`; selain itu `LEARN`. Posisi detail (subtab, detik, indeks soal) tidak dipakai pada fallback.
5. Pada `RESUME`, bila `active_attempt_id` merujuk attempt yang bukan `IN_PROGRESS` (atau bukan milik pengguna), abaikan `active_attempt_id` dan `last_question_index`.

### Format `position_label` (bahasa Indonesia, persis)
| Kondisi | Teks |
|---|---|
| `LEARN` + `VIDEO` + `video_progress_sec > 0` | `Video {mm}:{ss}` (mis. `Video 03:42`) |
| `LEARN` + `VIDEO` + detik 0 | `Video dari awal` |
| `LEARN` + `ARTICLE` atau subtab null | `Tab Pelajari - Artikel` |
| `LEARN` + `SLIDES` | `Tab Pelajari - Slide` |
| `DRILL` + `last_question_index` bukan null dan attempt valid | `Tab Latihan - Soal {index+1} dari {question_count}` |
| `DRILL` selain itu | `Tab Latihan` |
| `MINI_TASK` | `Tab Terapkan` |
| `FALLBACK_NEXT` | `Sub-modul berikutnya` |

### Format `resume_path`
`/belajar/{sub_module_code}?tab={pelajari|latihan|terapkan}` dengan penambahan berurutan: `&sub={artikel|video|slide}` bila tab LEARN dan subtab ada; `&t={detik}` bila subtab VIDEO dan detik > 0; `&q={index}` bila DRILL dan indeks valid; `&attempt={uuid}` bila attempt valid. Pemetaan tab: `LEARN`=`pelajari`, `DRILL`=`latihan`, `MINI_TASK`=`terapkan`.

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/resume.ts`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `CSRF_ORIGIN_MISMATCH` (PUT), `RATE_LIMITED`, `INTERNAL_ERROR`.

### PUT /api/v1/me/last-learned
- **Auth:** user
- **Success status:** 200
- **Zod:** `UpdateLastLearnedRequestSchema`
- **Rate limit:** `heartbeat` (30/menit/user, kunci per endpoint)

| Field | Type | Required | Constraint |
|---|---|---|---|
| `sub_module_id` | uuid | ya | sub-modul `AVAILABLE` dan tidak `LOCKED` bagi pengguna |
| `active_tab` | enum | ya | `LEARN` \| `DRILL` \| `MINI_TASK` |
| `active_learn_subtab` | enum \| null | tidak | `ARTICLE` \| `VIDEO` \| `SLIDES` \| null; hanya disimpan bila `active_tab = LEARN`, selain itu disimpan NULL |
| `active_video_id` | string \| null | tidak | regex `^[A-Za-z0-9_-]{11}$`; harus salah satu `video_id` materi sub-modul bila bukan null; disimpan hanya bila `active_learn_subtab = VIDEO`, selain itu NULL |
| `video_progress_sec` | int | tidak | 0-21600, default 0; disimpan 0 bila `active_learn_subtab <> VIDEO` |
| `last_question_index` | int \| null | tidak | 0-199 atau null; disimpan hanya bila `active_tab = DRILL`, selain itu NULL |
| `active_attempt_id` | uuid \| null | tidak | bila bukan attempt `IN_PROGRESS` milik pengguna untuk set drill sub-modul ini, DISIMPAN NULL tanpa error |
```json
{ "sub_module_id": "7a1b2c3d-0213-4000-8000-000000000213", "active_tab": "LEARN", "active_learn_subtab": "VIDEO", "active_video_id": "dQw4w9WgXcQ", "video_progress_sec": 222, "last_question_index": null, "active_attempt_id": null }
```
**Response (Success) 200:**
```json
{ "data": { "updated_at": "2026-11-03T10:25:41.000Z" } }
```
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Bentuk salah; `active_video_id` bukan video sub-modul (`details[].code = "video_not_in_sub_module"`); field tak dikenal |
| 403 | LOCKED_CONTENT | Sub-modul `LOCKED` |
| 404 | NOT_FOUND | Sub-modul tidak ada/`ARCHIVED`/bukan `AVAILABLE` |
| 429 | RATE_LIMITED | Bucket `heartbeat` terlampaui |

### GET /api/v1/me/last-learned
- **Auth:** user
- **Success status:** 200
- **Zod:** `ResumeCardResponseSchema`
**Response (Success), `RESUME`:**
```json
{ "data": { "state": "RESUME",
  "sub_module": { "id": "7a1b2c3d-0213-4000-8000-000000000213", "sub_module_code": "2.1.3", "title": "Passive Voice untuk Deskripsi Proses & Laporan Ilmiah" },
  "breadcrumb": { "tier_label": "Tier 2", "module_title": "Complex Grammar & Sentence Combining" },
  "active_tab": "LEARN", "active_learn_subtab": "VIDEO", "video_progress_sec": 222, "last_question_index": null, "question_count": null,
  "position_label": "Video 03:42", "progress_percent": 20,
  "resume_path": "/belajar/2.1.3?tab=pelajari&sub=video&t=222", "change_path": "/peta", "updated_at": "2026-11-03T10:25:41.000Z" } }
```
**Response (Success), pengguna baru atau semua selesai:** `{ "data": null }`
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `data` | object | ya | null bila langkah 4 tidak menemukan kandidat |
| `state` | `"RESUME"` \| `"FALLBACK_NEXT"` | tidak | D-RESUME |
| `active_tab` | `"LEARN"` \| `"DRILL"` \| `"MINI_TASK"` | tidak | |
| `active_learn_subtab` | `"ARTICLE"` \| `"VIDEO"` \| `"SLIDES"` | ya | |
| `video_progress_sec` | int | tidak | 0 bila bukan video |
| `last_question_index` | int | ya | |
| `question_count` | int | ya | jumlah soal attempt aktif bila indeks valid |
| `progress_percent` | int 0-100 | tidak | SPEC-003 D7 |
| `breadcrumb.tier_label` | string | tidak | `"Tier {n}"` |
**Response (Error):** hanya kode umum.

## Database Changes
Tidak ada tabel/kolom baru. Menulis `user_last_learned_state` (`user_id`, `active_tier_id`, `active_module_id`, `active_sub_module_id`, `active_tab`, `active_learn_subtab`, `active_video_id`, `video_progress_sec`, `last_question_index`, `active_attempt_id`, `updated_at`). Nama kolom identik dengan `schema.reference.ts`. UPSERT: `INSERT ... ON CONFLICT (user_id) DO UPDATE`. Penulisan hanya lewat `ResumeService` (`src/server/resume/service.ts`).

## UI/UX
Rujukan: `design-system.md` 5.10 Kartu "Lanjutkan Belajar", 5.3 Card (`highlight`), 5.7 Progress/Skeleton, 8.1 wireframe Beranda/Dashboard.

- Rute `/` (dashboard) dengan urutan vertikal: sapaan ("Halo, {display_name}"), `ResumeCard` (PALING ATAS), lalu slot kartu lain (`DashboardSlot`) yang diisi SPEC-016 (poin/streak) dan SPEC-017 (radar, riwayat).
- `ResumeCard`: varian `highlight`, lebar penuh, radius `lg`; isi: label kecil "Lanjutkan Belajar"; judul sub-modul; breadcrumb ("Tier 2 > Complex Grammar & Sentence Combining"); `position_label`; Progress sub-modul (`progress_percent`, `role="progressbar"`); Button `lg` primary **"Lanjutkan Belajar"** (satu-satunya CTA primer di layar); tautan sekunder "Ganti sub-modul" ke `change_path`. Seluruh kartu bukan tautan (hanya tombol dan tautan sekunder yang interaktif).
- `state = FALLBACK_NEXT`: label kecil berubah menjadi "Berikutnya untuk Anda" dan `position_label` "Sub-modul berikutnya".
- Empty state (`data = null`): Card "Mulai perjalanan Anda" dengan Button primary "Mulai dari Tier 1" (ke `/peta`) dan Button sekunder "Ikut Placement Test" (hanya tampil bila `GET /api/v1/placement` SPEC-015 mengatakan tersedia; sebelum spec itu ada, tombol disembunyikan).
- Loading: Skeleton setinggi kartu (tanpa CLS); error: Card "Posisi terakhir gagal dimuat" + Button "Coba lagi" + tautan "Buka Peta Belajar".
- `PositionRecorder` tidak menampilkan UI kecuali ikon awan kecil "Tersimpan" (opsional, `aria-hidden`); kegagalan `PUT` diam-diam diulang pada simpan berikutnya.
- Pemulihan posisi: video dimuat dengan `start = t`; bila `t` melebihi `end_sec` video, mulai dari `start_sec`; drill melompat ke indeks `q` bila `attempt` valid dan `IN_PROGRESS`, selain itu mulai layar pembuka drill.

## Acceptance Criteria
- [ ] **Given** pengguna menonton video sub-modul 2.1.3 sampai detik 222 **When** `PUT /me/last-learned` dikirim dengan `video_progress_sec=222` **Then** 200 dan baris `user_last_learned_state` memuat `active_tab='LEARN'`, `active_learn_subtab='VIDEO'`, `video_progress_sec=222`, `active_tier_id`/`active_module_id` terisi sesuai sub-modul.
- [ ] **Given** baris tersebut **When** `GET /me/last-learned` **Then** `state="RESUME"`, `position_label="Video 03:42"`, `resume_path="/belajar/2.1.3?tab=pelajari&sub=video&t=222"`.
- [ ] **Given** `active_tab="DRILL"`, `last_question_index=3`, `active_attempt_id` attempt `IN_PROGRESS` dengan 10 soal **When** `GET` **Then** `position_label="Tab Latihan - Soal 4 dari 10"` dan `resume_path` berakhiran `?tab=latihan&q=3&attempt=<uuid>`.
- [ ] **Given** attempt pada baris sudah `GRADED` **When** `GET` **Then** `last_question_index` diabaikan: `position_label="Tab Latihan"` dan `resume_path` tanpa `q` dan `attempt`.
- [ ] **Given** `PUT` dengan `active_attempt_id` milik pengguna lain **When** diproses **Then** 200 dan `active_attempt_id` tersimpan NULL (tidak membocorkan keberadaan attempt).
- [ ] **Given** `PUT` dengan `active_tab="DRILL"` dan `active_learn_subtab="VIDEO"`, `video_progress_sec=50` **When** disimpan **Then** `active_learn_subtab=NULL`, `video_progress_sec=0`, `active_video_id=NULL` (normalisasi).
- [ ] **Given** `active_video_id="aaaaaaaaaaa"` yang bukan video sub-modul **When** `PUT` **Then** 400 `VALIDATION_ERROR` `video_not_in_sub_module` dan baris tidak berubah.
- [ ] **Given** sub-modul `LOCKED` **When** `PUT` **Then** 403 `LOCKED_CONTENT`; sub-modul tak dikenal -> 404.
- [ ] **Given** pengguna baru tanpa baris dan sub-modul 1.1.1 `UNLOCKED` **When** `GET` **Then** `state="FALLBACK_NEXT"`, sub-modul 1.1.1, `active_tab="LEARN"`, `resume_path="/belajar/1.1.1?tab=pelajari"`.
- [ ] **Given** sub-modul tersimpan sekarang `COMPLETED` dan 2.1.4 `UNLOCKED` **When** `GET` **Then** `state="FALLBACK_NEXT"` dengan sub-modul 2.1.4.
- [ ] **Given** sub-modul tersimpan kini `ARCHIVED` **When** `GET` **Then** `FALLBACK_NEXT` ke kandidat berikutnya (bukan error 404).
- [ ] **Given** semua sub-modul AVAILABLE `COMPLETED`/`SKIPPED` **When** `GET` **Then** `{"data": null}`.
- [ ] **Given** 31 `PUT` dalam satu menit **When** permintaan ke-31 **Then** 429 `RATE_LIMITED`.
- [ ] **Given** `GET /me/last-learned` **When** diukur lokal **Then** p95 < 150 ms dan tepat 1 round trip untuk membaca baris posisi (+ query ringan untuk judul dan fallback).
- [ ] **Given** E2E Playwright (fixture) **When** pengguna menonton video sampai detik >= 20, menutup tab, membuka `/`, menekan "Lanjutkan Belajar" **Then** halaman sub-modul terbuka pada tab Pelajari > Video dengan `player.getCurrentTime()` dalam 3 detik dari posisi tersimpan, dan total waktu dari klik tombol sampai video siap diputar < 10 detik.
- [ ] **Given** E2E **When** pengguna keluar di soal ke-4 drill lalu menekan "Lanjutkan Belajar" **Then** drill terbuka di soal ke-4 dengan jawaban 1-3 tetap tersimpan.
- [ ] **Given** pengguna baru **When** membuka `/` **Then** hanya ada satu tombol primary "Mulai dari Tier 1" pada empty state dan tombol Placement tersembunyi bila SPEC-015 belum aktif.
- [ ] **Given** `ResumeCard` **When** diaudit aksesibilitas **Then** tombol punya nama aksesibel "Lanjutkan Belajar: {judul sub-modul}", progress punya `aria-valuenow`, kontras >= 4.5:1 pada light dan dark.

## Edge Cases & Validation
- [ ] Dua perangkat menulis bergantian: baris terakhir yang diterima menang (tanpa penguncian optimistik).
- [ ] `PUT` dikirim saat sesi habis: 401 `UNAUTHENTICATED`; klien berhenti mengirim hingga login ulang.
- [ ] `video_progress_sec` negatif atau > 21600: 400 `VALIDATION_ERROR` (`out_of_range`).
- [ ] Sub-modul sama dengan baris tersimpan, hanya posisi berubah: UPSERT tetap menaikkan `updated_at`.
- [ ] Pengguna dengan `status='DISABLED'`: 401 (`requireUser`).
- [ ] Klien offline: `PositionRecorder` menyimpan pembaruan terakhir saja di memori dan mengirim saat daring kembali.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft |
