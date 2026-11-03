# SPEC-005: Pemutar Materi Multimodal "Learn - Drill - Apply" (MAT-01, MAT-02, MAT-03, kerangka MAT-04/MAT-05)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-001, SPEC-003, SPEC-004
- **Prioritas:** P0 (Mini-Task tampilan: P1)
- **Cakupan:** Backend (API materi, bukti belajar, aset) + Frontend (halaman pemutar)

## User Story
Sebagai Learner, saya ingin membuka sub-modul yang sudah terbuka dan mempelajarinya lewat artikel Markdown (dengan unduhan PDF/DOCX), video YouTube yang mulai dan berhenti pada detik yang ditentukan, dan carousel slide, lalu menandai materi selesai, sehingga saya paham konsepnya sebelum mengerjakan latihan.

## Non-Goals / Out of Scope
- Tidak membuat mesin soal/Active Drill (SPEC-006) maupun penilaian AI Mini-Task (SPEC-012/013); spec ini menyediakan kerangka tab dan slot komponennya.
- Tidak menyimpan posisi terakhir (tab, detik video, nomor soal) ke DB (SPEC-007); spec ini hanya memancarkan event `onPositionChange`.
- Tidak mengunduh, menyimpan, atau memutar ulang video pihak ketiga dari server sendiri; hanya YouTube IFrame Player API (embed).
- Tidak ada gambar inline di dalam artikel Markdown (visual disampaikan lewat Slide). Sintaks gambar Markdown dibuang saat render.
- Tidak ada HTML mentah di artikel; tidak ada `rehype-raw`.
- Tidak ada transkrip video, subtitle yang dikelola sendiri, kecepatan putar kustom (memakai kontrol bawaan YouTube).
- Tidak ada komentar, catatan pengguna, atau bookmark.
- Tidak ada penyuntingan konten (SPEC-020).

## Technical Flow
1. Learner membuka `/belajar/{sub_module_code}` (dari `/peta` atau kartu Lanjutkan Belajar).
2. Halaman memanggil `GET /api/v1/sub-modules/{sub_module_code}`.
3. Server menjalankan `assertSubModuleAccessible` (SPEC-003): `LOCKED` -> 403 `LOCKED_CONTENT`; tidak ada/`ARCHIVED`/bukan `AVAILABLE` -> 404 `NOT_FOUND`.
4. Server memanggil `markStarted` (SPEC-003) sehingga `UNLOCKED -> IN_PROGRESS`, lalu menyusun respons: sub-modul, materi (JSON aset dipetakan ke `asset_id`/`url`), progres, informasi Drill, navigasi.
5. Klien merender tab "Pelajari" dengan sub-tab Artikel, Video, Slide (hanya yang punya konten; Artikel selalu ada).
6. Klien menghitung waktu aktif: detik terakumulasi hanya saat `document.visibilityState === 'visible'` DAN ada interaksi (scroll, klik, tombol, atau video berstatus `PLAYING`) dalam 60 detik terakhir. Setiap 15 detik (dan saat pindah sub-tab/`pagehide`) klien mengirim `POST /api/v1/sub-modules/{sub_module_id}/learn-progress` dengan `subtab` aktif dan detik terakumulasi (maks 30).
7. Server menambah `learn_active_seconds` dengan nilai yang di-clamp (aturan di bawah), menambahkan sub-tab ke `learn_visited_subtabs`, dan mengembalikan `learn_ready`.
8. Ketika `learn_ready=true`, tombol "Selesai Belajar" aktif; klik memanggil `POST /api/v1/sub-modules/{sub_module_id}/learn-complete`.
9. Server memverifikasi syarat; jika terpenuhi menetapkan `learn_completed_at = now()` (sekali) dan memanggil `activityHooks` (SPEC-016); klien berpindah ke tab "Latihan".
10. Tab "Latihan" menampilkan ringkasan Drill dan tombol "Mulai Latihan" bila `drill.can_start`; mesin soal dijalankan SPEC-006.
11. Tab "Terapkan" menampilkan Mini-Task; tipe `SELF_CHECK` dapat ditandai selesai lewat `POST .../mini-task/complete`; tipe AI memakai slot SPEC-012/013.
12. Gambar slide dan unduhan dimuat browser dari `GET /api/v1/assets/{asset_id}/file`.

### Aturan Bukti Belajar (D-LEARN)
- Syarat `learn_ready`: (a) `learn_active_seconds >= app_settings['learn.min_active_seconds']` (default 60); DAN (b) `learn_visited_subtabs` memuat `ARTICLE`, memuat `VIDEO` bila `videos` tidak kosong, memuat `SLIDES` bila `slides` tidak kosong.
- Penambahan per `learn-progress`: `delta = min(active_seconds, 30, elapsed)` dengan `elapsed = floor(now - learn_last_ping_at)` detik (>= 0); bila `learn_last_ping_at IS NULL`, `delta = min(active_seconds, 5)`. Lalu `learn_last_ping_at = now()`. Klaim klien di atas batas dipotong tanpa error.
- Sub-modul yang sudah `COMPLETED`/`SKIPPED` tetap menerima `learn-progress` (tidak mengubah status).

### Aturan Render (WAJIB; selaras `security-standards.md` 3.2)
- Artikel: `react-markdown` + `remark-gfm` + `remark-directive`; TANPA `rehype-raw`; tabel responsif dalam wadah scroll terkurung; heading mendapat `id` slug; tautan eksternal `target="_blank" rel="noopener noreferrer"`; skema tautan selain `https:`, `http:`, `mailto:` dibuang; gambar Markdown dibuang.
- Callout lewat directive blok: `:::tips-examiner` ... `:::` -> komponen `Callout` varian "Tips Examiner" (ikon `Lightbulb`); `:::kesalahan-umum` ... `:::` -> varian "Kesalahan Umum" (ikon `AlertTriangle`). Label teks selalu tampil.
- Video: URL embed dibangun HANYA dari `video_id` yang lolos regex `^[A-Za-z0-9_-]{11}$`: IFrame API dari `https://www.youtube-nocookie.com/embed/{video_id}` dengan `playerVars: { start: start_sec, end: end_sec, rel: 0, playsinline: 1, origin: window.location.origin }`. Label di bawah video: "Bagian {mm:ss}-{mm:ss}". Gagal memuat: pesan "Video tidak dapat dimuat" + tautan "Buka di YouTube" (`https://www.youtube.com/watch?v={video_id}&t={start_sec}s`) + Button "Coba lagi".
- Slide: Embla Carousel; `<img>` dengan `alt` dari data; prefetch slide berikutnya.

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/player.ts`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `CSRF_ORIGIN_MISMATCH` (POST), `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.

### GET /api/v1/sub-modules/{sub_module_code}
- **Auth:** user
- **Success status:** 200
- **Zod:** `SubModuleDetailResponseSchema`
- **Path:** `sub_module_code` regex `^[1-4]\.\d{1,2}\.\d{1,2}$`

**Response (Success):**
```json
{ "data": {
  "sub_module": { "id": "7a1b2c3d-0213-4000-8000-000000000213", "sub_module_code": "2.1.3", "title": "Passive Voice untuk Deskripsi Proses & Laporan Ilmiah", "passing_score_percent": 75, "content_version": 1,
    "module": { "id": "7a1b2c3d-0021-4000-8000-000000000021", "module_code": "2.1", "title": "Complex Grammar & Sentence Combining", "skill_category": "GRAMMAR" },
    "tier": { "id": "7a1b2c3d-0002-4000-8000-000000000002", "tier_number": 2, "title": "Bridge to Academic" } },
  "material": {
    "article_markdown": "## Mengapa Passive Voice Krusial di IELTS?\nDalam **IELTS Writing Task 1**...",
    "videos": [ { "asset_id": "c1d2e3f4-0001-4000-8000-0000000000a1", "video_id": "dQw4w9WgXcQ", "title": "Cara Cepat Menguasai Passive Voice", "instructor_channel": "Kampung Inggris LC", "language": "ID", "start_sec": 95, "end_sec": 420 } ],
    "slides": [ { "asset_id": "c1d2e3f4-0002-4000-8000-0000000000a2", "order": 1, "caption": "Alur perubahan objek menjadi subjek", "alt": "Diagram alur pabrik", "url": "/api/v1/assets/c1d2e3f4-0002-4000-8000-0000000000a2/file" } ],
    "attachments": [ { "asset_id": "c1d2e3f4-0003-4000-8000-0000000000a3", "title": "Daftar 100 Verb-3 Irregular", "file_type": "PDF", "size_bytes": 482113, "url": "/api/v1/assets/c1d2e3f4-0003-4000-8000-0000000000a3/file" } ],
    "mini_task": { "task_type": "AI_SHORT_WRITING", "prompt": "Ubah 3 tahapan aktif berikut menjadi 1 paragraf pasif...", "success_criteria": "Harus mengandung 3 struktur Passive Voice Present Simple yang akurat." },
    "attribution_text": null },
  "progress": { "status": "IN_PROGRESS", "progress_percent": 20, "learn_completed_at": null, "mini_task_completed_at": null, "best_score_percent": 0, "mastery_crown": "NONE", "learn_active_seconds": 42, "learn_visited_subtabs": ["ARTICLE"], "learn_ready": false },
  "drill": { "assessment_set_id": "e5f6a7b8-0001-4000-8000-0000000000d1", "question_count": 10, "time_limit_seconds": 300, "pass_percent": 75, "can_start": false, "blocked_reason": "LEARN_NOT_COMPLETED" },
  "navigation": { "prev_sub_module_code": "2.1.2", "next_sub_module_code": "2.1.4" } } }
```
| Field | Tipe | Nullable | Constraint |
|---|---|---|---|
| `material.videos[].video_id` | string 11 char | tidak | dari `content_assets.external_ref` |
| `material.mini_task` | object | ya (null bila tidak ada) | `task_type` enum `AI_SHORT_WRITING` \| `AI_SHORT_SPEAKING` \| `SELF_CHECK`; `success_criteria` = `ai_rubric_criteria` |
| `material.attribution_text` | string | ya | dari `learning_materials.attribution_text` |
| `attachments[].file_type` | `"PDF"` \| `"DOCX"` | tidak | |
| `progress.status` | enum `progress_status` | tidak | setelah `markStarted` |
| `progress.learn_visited_subtabs` | array `"ARTICLE"\|"VIDEO"\|"SLIDES"` | tidak | tanpa duplikat |
| `drill.assessment_set_id` | uuid | ya | set `ACTIVE_DRILL` PUBLISHED; null bila tidak ada |
| `drill.can_start` | boolean | tidak | `learn_completed_at IS NOT NULL` DAN set ada |
| `drill.blocked_reason` | `"LEARN_NOT_COMPLETED"` \| `"NO_DRILL_PUBLISHED"` \| null | ya | prioritas: `NO_DRILL_PUBLISHED` lalu `LEARN_NOT_COMPLETED` |
| `navigation.prev_sub_module_code`, `next_sub_module_code` | string | ya | tetangga dalam `chain(T)` (SPEC-003 D2); null di ujung |
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | `sub_module_code` tidak cocok regex |
| 403 | LOCKED_CONTENT | Sub-modul `LOCKED` bagi pengguna (`details[0].code` = `PREVIOUS_INCOMPLETE` atau `TIER_LOCKED`) |
| 404 | NOT_FOUND | Kode tidak ada, `ARCHIVED`, atau bukan `AVAILABLE` |

### POST /api/v1/sub-modules/{sub_module_id}/learn-progress
- **Auth:** user | **Success status:** 200 | **Zod:** `LearnProgressRequestSchema` | **Rate limit:** `heartbeat` (30/menit/user)

| Field | Type | Required | Constraint |
|---|---|---|---|
| `subtab` | enum | ya | `ARTICLE` \| `VIDEO` \| `SLIDES`; `VIDEO`/`SLIDES` ditolak bila sub-modul tidak punya konten itu |
| `active_seconds` | int | ya | 1-30 |
```json
{ "subtab": "VIDEO", "active_seconds": 15 }
```
**Response (Success) 200:**
```json
{ "data": { "learn_active_seconds": 57, "learn_visited_subtabs": ["ARTICLE", "VIDEO"], "learn_ready": false } }
```
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body tidak valid; `subtab` tidak tersedia pada sub-modul (`details[].code = "subtab_unavailable"`) |
| 403 | LOCKED_CONTENT | Sub-modul `LOCKED` |
| 404 | NOT_FOUND | Sub-modul tidak ada/tidak `AVAILABLE` |
| 429 | RATE_LIMITED | Bucket `heartbeat` terlampaui |

### POST /api/v1/sub-modules/{sub_module_id}/learn-complete
- **Auth:** user | **Success status:** 200 | **Request body:** tidak ada
**Response (Success) 200:**
```json
{ "data": { "learn_completed_at": "2026-11-03T10:20:00.000Z", "drill_can_start": true } }
```
Idempoten: bila sudah selesai, 200 dengan `learn_completed_at` lama.
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 403 | LOCKED_CONTENT | Sub-modul `LOCKED` |
| 404 | NOT_FOUND | Tidak ada/tidak `AVAILABLE` |
| 409 | LEARN_REQUIREMENTS_NOT_MET | `learn_ready=false`. `details[]` memuat `{path:"learn_active_seconds",code:"insufficient_active_time",message:"Waktu belajar aktif minimal 60 detik (sekarang 42)."}` dan/atau `{path:"learn_visited_subtabs",code:"subtab_not_visited",message:"Buka tab Video terlebih dahulu."}` |

### POST /api/v1/sub-modules/{sub_module_id}/mini-task/complete
- **Auth:** user | **Success status:** 200 | **Request body:** tidak ada
Hanya untuk `mini_task.task_type = "SELF_CHECK"`; menetapkan `mini_task_completed_at = now()` (sekali) dan memanggil `activityHooks`.
**Response (Success) 200:** `{ "data": { "mini_task_completed_at": "2026-11-03T10:40:00.000Z" } }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 403 | LOCKED_CONTENT | Sub-modul `LOCKED` |
| 404 | NOT_FOUND | Tidak ada/tidak `AVAILABLE` |
| 409 | NO_MINI_TASK | Sub-modul tidak punya Mini-Task |
| 409 | MINI_TASK_NOT_SELF_CHECK | Tipe Mini-Task `AI_SHORT_WRITING`/`AI_SHORT_SPEAKING` (selesai lewat SPEC-012/013) |
| 409 | LEARN_NOT_COMPLETED | `learn_completed_at IS NULL` |

### GET /api/v1/assets/{asset_id}/file
- **Auth:** user | **Success status:** 200 (atau 304 bila `If-None-Match` cocok)
- **Path:** `asset_id` uuid
Melayani berkas aset kind `SLIDE_IMAGE`, `IMAGE`, `DOCUMENT` yang dirujuk `learning_materials.slides_json` atau `attachments_json` suatu sub-modul `AVAILABLE` yang statusnya BUKAN `LOCKED` bagi pengguna.
Header respons: `Content-Type` = `content_assets.mime_type` (hanya `image/webp|png|jpeg`, `application/pdf`, DOCX), `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`, `ETag: "<sha256>"`, `Content-Length`; `Content-Disposition: attachment; filename="<judul-slug>.<ext>"` untuk `DOCUMENT`, `inline` untuk gambar. Tidak mendukung `Range` (selalu 200 penuh).
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Aset tidak ada, kind tidak dilayani (mis. `AUDIO_LISTENING`, `VIDEO_EMBED`), tidak dirujuk sub-modul terbuka mana pun, atau berkas storage hilang |
| 403 | LOCKED_CONTENT | Semua sub-modul yang merujuk aset berstatus `LOCKED` |

## Database Changes
Migrasi bertag `spec_005_learn_evidence`: tabel `user_sub_module_progress` (tambah kolom):
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| `learn_active_seconds` | integer | NOT NULL | `0` |
| `learn_visited_subtabs` | text[] | NOT NULL | `'{}'` |
| `learn_last_ping_at` | timestamptz | NULL | tanpa default |
Seed `app_settings`: `learn.min_active_seconds` = 60 (registri `_api-contract.md` bagian 8). Penulisan `learn_*` dan `mini_task_completed_at` hanya lewat `PlayerService` (`src/server/player/service.ts`), bukan `GatekeepingService`.

## UI/UX
Rujukan: `design-system.md` 5.11 Pemutar Multimodal, 5.7 Tabs/Callout/Skeleton, 5.1 Button, 5.3 Card, 5.4 Dialog, 8.3 wireframe Pemutar Sub-Modul.

- Rute `/belajar/[sub_module_code]` dengan query opsional `tab` (`pelajari`|`latihan`|`terapkan`, default `pelajari`), `sub` (`artikel`|`video`|`slide`, default `artikel`), `t` (detik video, int >= 0), `q` (indeks soal, int >= 0). Query dibaca SPEC-007.
- Kerangka: header (tombol kembali ke `/peta`, judul, Progress sub-modul), Tabs 3 segmen "Pelajari / Latihan / Terapkan" dengan centang bila selesai (Pelajari: `learn_completed_at`; Latihan: `best_score_percent >= pass`; Terapkan: `mini_task_completed_at`), bar bawah mobile "Sebelumnya"/"Selanjutnya" memakai `navigation`.
- Tab Pelajari: segmented sub-tab (Artikel, Video, Slide) hanya untuk yang berisi; Artikel `max-w-[72ch]`, line-height 1.7, daftar isi sticky di desktop; Button sekunder "Unduh PDF (482 KB)" per lampiran (ikon `Download`); atribusi (`attribution_text`) ditampilkan di bawah artikel sebagai teks kecil bila tidak null; Video rasio 16:9 (`aspect-video`, ruang dicadangkan); Slide carousel Embla dengan kontrol Prev/Next 44px, indikator "3/12", navigasi panah keyboard, `role="region" aria-roledescription="carousel"`.
- Button primary "Selesai Belajar": disabled sampai `learn_ready` (Tooltip menjelaskan syarat yang belum terpenuhi); loading "Menyimpan...".
- Tab Latihan: Card ringkasan ("10 soal - 5 menit - lulus 75%"), Button primary "Mulai Latihan" (disabled + teks alasan bila `drill.blocked_reason`: "Selesaikan materi terlebih dahulu." / "Latihan belum tersedia."). Mesin soal = SPEC-006.
- Tab Terapkan: Card tugas (prompt, `success_criteria`); `SELF_CHECK`: Button "Tandai Selesai"; tipe AI: slot `<MiniTaskAi taskType=... />` (SPEC-012/013); sebelum spec itu selesai, slot menampilkan "Segera hadir" (disabled).
- Layar ringkasan sub-modul setelah drill lulus (skor, mahkota dari SPEC-016, tombol "Sub-Modul Berikutnya" ke `next_sub_module_code`) ditampilkan SPEC-006.
- State: loading = Skeleton kerangka; kosong video/slide = sub-tab disembunyikan; error 403 = Card "Sub-modul ini masih terkunci" + alasan + tombol "Kembali ke Peta"; error 404 = halaman tidak ditemukan; jaringan gagal pada `learn-progress` = diam, coba lagi pada ping berikutnya (tidak memunculkan Toast).
- Aksesibilitas: video diberi `title` iframe; tombol ikon `aria-label`; fokus ke `<h1>` setelah pindah rute.

## Acceptance Criteria
- [ ] **Given** sub-modul `UNLOCKED` **When** `GET /api/v1/sub-modules/2.1.3` **Then** 200, `progress.status = "IN_PROGRESS"` (setelah `markStarted`), `material.article_markdown` non-kosong, `drill.blocked_reason = "LEARN_NOT_COMPLETED"`.
- [ ] **Given** sub-modul `LOCKED` **When** dipanggil `GET /api/v1/sub-modules/2.1.4` **Then** 403 `LOCKED_CONTENT` dan body TIDAK memuat `article_markdown` atau data materi lain.
- [ ] **Given** sub-modul berstatus `DRAFT` atau `ARCHIVED` **When** dipanggil **Then** 404 `NOT_FOUND`; kode `9.9.9` (format valid, tidak ada) 404; kode `abc` 400 `VALIDATION_ERROR`.
- [ ] **Given** payload `GET` **When** diperiksa **Then** tidak ada kunci `ai_rubric_criteria`, `storage_key`, `sha256`, `external_url` (hanya `success_criteria`, `url`, `video_id`).
- [ ] **Given** `learn_last_ping_at` 10 detik lalu **When** `learn-progress` dengan `active_seconds=30` **Then** `learn_active_seconds` bertambah <= 10 (clamp `elapsed`); salvo 30 ping dalam ~1 detik menambah <= 5 detik total.
- [ ] **Given** ping pertama `active_seconds=30` **When** diproses **Then** bertambah tepat 5.
- [ ] **Given** `learn_active_seconds=61` dan hanya sub-tab ARTICLE dikunjungi tetapi sub-modul punya video **When** `learn-complete` **Then** 409 `LEARN_REQUIREMENTS_NOT_MET` dengan `details[].code = "subtab_not_visited"`.
- [ ] **Given** `learn_active_seconds=45` **When** `learn-complete` **Then** 409 dengan `details[].code = "insufficient_active_time"` dan `learn_completed_at` tetap NULL.
- [ ] **Given** syarat terpenuhi **When** `learn-complete` **Then** 200, `learn_completed_at` terisi; `GET` berikutnya `drill.can_start = true`; memanggil lagi 200 dengan `learn_completed_at` yang sama.
- [ ] **Given** sub-modul tanpa video dan slide dengan `learn_active_seconds=60` dan ARTICLE dikunjungi **When** `learn-complete` **Then** 200.
- [ ] **Given** sub-modul tanpa video **When** `learn-progress` dengan `subtab=VIDEO` **Then** 400 `VALIDATION_ERROR` `subtab_unavailable`.
- [ ] **Given** `learn-progress` dikirim 31 kali dalam satu menit **When** permintaan ke-31 **Then** 429 `RATE_LIMITED`.
- [ ] **Given** Mini-Task `SELF_CHECK` dan `learn_completed_at` terisi **When** `mini-task/complete` **Then** 200 dan `mini_task_completed_at` terisi; pada tipe `AI_SHORT_WRITING` 409 `MINI_TASK_NOT_SELF_CHECK`; sebelum materi selesai 409 `LEARN_NOT_COMPLETED`.
- [ ] **Given** aset slide milik sub-modul terbuka **When** `GET /api/v1/assets/{id}/file` **Then** 200 dengan `Content-Type` `image/webp`, `X-Content-Type-Options: nosniff`, `ETag`; permintaan ulang dengan `If-None-Match` sama 304.
- [ ] **Given** aset `DOCUMENT` **When** diunduh **Then** `Content-Disposition` berawalan `attachment`.
- [ ] **Given** aset `AUDIO_LISTENING` atau aset yang hanya dirujuk sub-modul `LOCKED` **When** dipanggil **Then** 404 / 403 `LOCKED_CONTENT` sesuai tabel error.
- [ ] **Given** artikel berisi `<script>alert(1)</script>`, `[x](javascript:alert(1))`, dan `![i](http://x/a.png)` (disuntikkan lewat fixture) **When** dirender **Then** tidak ada `<script>` di DOM, tautan `javascript:` tidak memiliki `href`, dan tidak ada `<img>` dari Markdown (uji komponen).
- [ ] **Given** artikel dengan `:::tips-examiner` **When** dirender **Then** muncul Callout berlabel teks "Tips Examiner".
- [ ] **Given** `video_id` tidak lolos regex di data (korup) **When** dirender **Then** player tidak dibuat dan pesan "Video tidak dapat dimuat" tampil; tidak ada iframe ke host selain `www.youtube-nocookie.com`.
- [ ] **Given** E2E Playwright dengan fixture **When** pengguna membaca artikel, membuka Video dan Slide, menunggu >= 60 detik aktif (jam dipercepat), menekan "Selesai Belajar" **Then** tab Latihan aktif dan tombol "Mulai Latihan" enabled; pada 375x812 tidak ada scroll horizontal.
- [ ] **Given** halaman dimuat di localhost **When** diaudit CSP **Then** tidak ada pelanggaran untuk `www.youtube-nocookie.com` (frame-src) dan skrip IFrame API (script-src).

## Edge Cases & Validation
- [ ] Tab tidak aktif (`visibilityState = 'hidden'`) atau tanpa interaksi 60 detik: klien tidak menambah detik aktif.
- [ ] Dua tab browser membuka sub-modul yang sama: server menerima keduanya; `delta` dibatasi oleh `elapsed` sehingga akumulasi tidak melampaui waktu nyata.
- [ ] `end_sec` video di data lebih kecil dari `start_sec` (data korup): player memutar tanpa `end`, galat dicatat `warn`.
- [ ] Artikel > 100.000 karakter tidak mungkin (divalidasi di SPEC-004); jika terjadi, ditampilkan penuh tanpa potongan.
- [ ] `If-None-Match` tidak cocok: 200 penuh.
- [ ] File aset hilang dari storage tetapi baris DB ada: 404 `NOT_FOUND` + log `error` (`asset_file_missing`) tanpa membocorkan path.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; delta skema `learn_active_seconds`, `learn_visited_subtabs`, `learn_last_ping_at` |
| 2026-11-03 | Backend Engineer | Aditif: `progress.min_active_seconds` (int, ambang `learn.min_active_seconds`) pada `GET /sub-modules/{code}` atas usul Frontend. Catatan: regex path `sub_module_code` dilonggarkan ke `^\d\.\d{1,2}\.\d{1,2}$` agar AC `9.9.9` -> 404 terpenuhi; folder rute memakai segmen tunggal `[sub_module]` (path publik tidak berubah). |
| 2026-11-03 | Backend Engineer | Amandemen QA W2 F-05-01: `delta = min(active_seconds, 30, elapsed)` (sebelumnya `elapsed + 2`) sehingga total detik aktif <= waktu dinding sejak ping pertama + 5 |
