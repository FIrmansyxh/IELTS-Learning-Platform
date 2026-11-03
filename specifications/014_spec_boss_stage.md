# SPEC-014: Boss Stage / Tier Boss Exam Berskor Band (CUR-02 gerbang Tier)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-003, SPEC-004, SPEC-006, SPEC-008, SPEC-009, SPEC-010, SPEC-011, SPEC-012, SPEC-013
- **Prioritas:** P0
- **Cakupan:** Backend (attempt bersegmen, penilaian band, gerbang Tier) + Frontend (intro, transisi section, hasil)

## User Story
Sebagai Learner yang telah menyelesaikan semua modul sebuah Tier, saya ingin mengerjakan Boss Stage (simulasi ujian bersegmen Listening, Reading, Writing, Speaking) yang dinilai ke band IELTS, sehingga saya tahu kesiapan saya dan, bila lulus sesuai target band Tier, Tier berikutnya terbuka.

## Non-Goals / Out of Scope
- Gerbang lulus HANYA dari Listening + Reading (objektif, server-side). Writing/Speaking wajib dikerjakan (sebagai bagian alur) tetapi nilai AI/self-assessment bersifat masukan, TIDAK menjadi syarat lulus dan TIDAK dapat meloloskan gerbang (ADR-003 #1, #17).
- Tidak ada pause/jeda waktu section; tidak ada mengulang section yang sudah selesai dalam attempt yang sama.
- Tidak ada Boss untuk Modul (hanya Tier). Skip Test Tier ada di SPEC-008.
- Tidak ada penilaian Writing/Speaking sinkron; hasil AI datang belakangan (SPEC-012/013) dan tampil saat siap.
- Tidak membuat mesin attempt/soal, pemutar Reading/Listening, konverter band; spec ini menyusunnya.
- Tidak ada pembahasan atau kunci jawaban pada hasil (SPEC-006 D10).
- Tidak ada perubahan ambang gerbang oleh pengguna; nilai dari `tiers.boss_gate_type/boss_gate_value`.
- Tidak ada Boss yang hanya berisi Writing/Speaking; set Boss `PUBLISHED` wajib punya section Listening dan Reading.

## Definisi Tetap
**D1. Struktur set.** Induk `TIER_BOSS_EXAM` (tanpa soal) + anak `BOSS_SECTION` per skill: wajib `LISTENING` dan `READING`; opsional `WRITING` dan `SPEAKING`. Urutan section tetap: `LISTENING` -> `READING` -> `WRITING` -> `SPEAKING` (yang ada).
**D2. Ketersediaan.** SPEC-003 D9 (Tier `UNLOCKED`/`IN_PROGRESS`, semua modul AVAILABLE `COMPLETED`/`SKIPPED`, `boss_passed_at IS NULL`, set induk `PUBLISHED`).
**D3. Cooldown dan batas harian.** Sama dengan SPEC-008 D3 dan D4, kunci = set induk, memakai `app_settings['attempt.cooldown_minutes']` dan `['attempt.max_per_set_per_day']`.
**D4. Waktu.** Setiap section punya waktu sendiri = `time_limit_seconds` set anak, dimulai saat `sections/{id}/start`. `attempts.deadline_at` = `started_at + jumlah semua time_limit_seconds section + 1800 detik` (pengaman keseluruhan). Toleransi 5 detik per section (`SECTION_EXPIRED` setelahnya).
**D5. Nilai Listening/Reading.** Untuk section `S` skill `LISTENING`/`READING`: `raw_score` = jumlah skor soal objektif, `max_score` = jumlah poin, `raw_40 = scaleToForty(raw_score, max_score)` (SPEC-009), `band = convertRawToBand(tabel aktif skill, raw_40)` (`LISTENING` atau `READING_ACADEMIC`). Section yang tidak pernah dimulai: `raw_score=0`.
**D6. Gerbang.**
- `gate_type = BAND`: `boss_band = bossBand(listening_band, reading_band)`; `passed = boss_band >= gate_value`.
- `gate_type = PERCENT`: `percent = (L.raw + R.raw) * 100 / (L.max + R.max)` (poin mentah, tanpa penskalaan); `passed = (L.raw + R.raw) * 100 >= gate_value * (L.max + R.max)` (aritmetika bilangan bulat per-sentesimal). `boss_band` tetap dihitung untuk informasi.
Vektor uji: Tier 2 (BAND 5.0): L raw40 16 (5.0) dan R raw40 14 (4.5) -> 4.75 -> 5.0 LULUS; L 13 dan R 13 (4.5, 4.5) -> 4.5 GAGAL. Tier 3 (6.0): L 23 (6.0), R 22 (5.5) -> 5.75 -> 6.0 LULUS; L 22 (5.5), R 22 (5.5) -> 5.5 GAGAL. Tier 4 (7.0): L 30 (7.0), R 29 (6.5) -> 6.75 -> 7.0 LULUS. Tier 1 (PERCENT 80): L 9/10 + R 7/10 = 80% LULUS; 8/10 + 7/10 = 75% GAGAL.
**D7. Hasil.** `attempts.raw_score/max_score` = jumlah L+R; `score_percent` = D6 `percent`; `band_score` = `boss_band`; `band_table_id` = NULL dan `result_json.band_table_ids = { listening, reading_academic }`; `passed` = D6.
**D8. Estimasi Overall Band.** `boss.overall_band_estimate = overallBand(L, R, W, S)` bila keempat ada: W dan S = `overall_band` evaluasi `AI_LOCAL` terbaru submission section itu yang `injection_suspected=false`; evaluasi `SELF_ASSESSMENT` dan yang bertanda injeksi TIDAK dihitung. Jika salah satu kosong: `null`. Dihitung ulang setiap `GET .../result`.

## Technical Flow
1. Learner membuka `/peta`, menekan "Boss Stage" (hanya aktif bila `boss.available`); klien membuka `/ujian/mulai/{assessment_set_id}` (set induk).
2. `GET /api/v1/exams/{id}/intro` mengembalikan aturan, daftar section, gerbang, cooldown.
3. Learner menekan "Mulai Ujian"; klien memanggil `POST /api/v1/attempts` (set induk). Handler `TIER_BOSS_EXAM.start` menjalankan D2, `BOSS_ALREADY_PASSED`, D3, lalu membuat attempt `EXAM` dan baris `attempt_sections` untuk tiap anak; `state.sections[section_id] = { phase: "PENDING" }`.
4. Klien menampilkan layar transisi untuk section pertama; learner menekan "Mulai Section"; klien memanggil `POST /attempts/{id}/sections/{section_set_id}/start`.
5. Server memeriksa urutan, menetapkan `phase="ACTIVE"`, `started_at`, `deadline_at` section, menyiapkan soal tersaji (acak, pemetaan opsi, SPEC-006 D4-D5) dan mengembalikan soal section.
6. Learner menjawab lewat `PUT /attempts/{id}/answers/{question_id}` (SPEC-006; server menolak bila section pemilik soal tidak `ACTIVE`). Section WRITING/SPEAKING: learner mengirim tulisan/rekaman lewat `POST /submissions/writing|speaking` dengan `attempt_id` dan `question_id` (SPEC-012/013).
7. Learner menekan "Selesai Section" (atau waktu section habis); klien memanggil `POST /attempts/{id}/sections/{section_set_id}/submit`; server menilai section objektif, menulis `attempt_sections` (`raw_score`, `max_score`, `band_score`, `status='SUBMITTED'`) dan menetapkan `phase="DONE"`.
8. Klien menampilkan transisi ke section berikutnya; ulangi langkah 4-7 sampai section terakhir.
9. Klien memanggil `POST /attempts/{id}/submit`. Server (satu transaksi, `SELECT ... FOR UPDATE`): menyelesaikan section `ACTIVE` dengan jawaban tersimpan dan memberi skor 0 untuk section `PENDING`, menghitung D5-D7, memanggil `GatekeepingService.applyBossResult({tierId, percent, band, passed})`, menulis `audit_log` `BOSS_PASSED`/`BOSS_FAILED`, memanggil `attemptCompletedHooks`, dan mengembalikan hasil.
10. Klien menampilkan hasil; `overall_band_estimate` dan band Writing/Speaking muncul bila evaluasi AI selesai (polling `GET /attempts/{id}/result` setiap 10 detik selama ada `pending_ai > 0`, berhenti setelah 10 menit).

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/exams.ts`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `CSRF_ORIGIN_MISMATCH`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`. Semua endpoint **Auth: user**; attempt milik user lain -> 404.

**`SectionDTO`:** `{ assessment_set_id: uuid, skill: "LISTENING"|"READING"|"WRITING"|"SPEAKING", order: int (1-4), title: string, time_limit_seconds: int, question_count: int, counts_toward_gate: boolean (true untuk LISTENING/READING), requires_audio: boolean, requires_microphone: boolean, phase: "PENDING"|"ACTIVE"|"DONE", started_at: string|null, deadline_at: string|null, remaining_seconds: int|null }`

### GET /api/v1/exams/{assessment_set_id}/intro (ekstensi untuk `TIER_BOSS_EXAM`)
Field `boss` terisi (selain bentuk SPEC-008): 
```json
{ "boss": { "tier_number": 1, "gate": { "type": "PERCENT", "value": 80 },
  "sections": [ { "assessment_set_id": "b0551001-0001-4000-8000-000000000001", "skill": "LISTENING", "order": 1, "title": "Listening Tier 1", "time_limit_seconds": 900, "question_count": 10, "counts_toward_gate": true, "requires_audio": true, "requires_microphone": false, "phase": "PENDING", "started_at": null, "deadline_at": null, "remaining_seconds": null } ],
  "total_time_limit_seconds": 4500, "last_result": { "passed": false, "score_percent": 75.0, "boss_band": 5.5, "at": "2026-11-02T09:00:00.000Z" },
  "advisory_note": "Kelulusan ditentukan oleh Listening dan Reading. Writing dan Speaking dinilai sebagai masukan." } }
```
`threshold` = `{ "kind": "PERCENT"|"BAND", "value": number }` sesuai gerbang; `scope.kind="TIER"`; `blocked_reason`: `TIER_LOCKED` \| `MODULES_INCOMPLETE` \| `BOSS_ALREADY_PASSED` \| `COOLDOWN_ACTIVE` \| `DAILY_ATTEMPT_LIMIT` \| null (prioritas urutan ini). `last_result` null bila belum pernah.

### POST /api/v1/attempts (kontrak tambahan tipe `TIER_BOSS_EXAM`)
Request/Response mengikuti SPEC-006; `AttemptDTO.questions=[]`, `AttemptDTO.sections` = array `SectionDTO` terurut `order`, `deadline_at` D4. Kode error tambahan:
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 409 | BOSS_NOT_AVAILABLE | D2 tidak terpenuhi. `details[0].code` = `TIER_LOCKED` \| `MODULES_INCOMPLETE`. Pesan: "Boss Stage belum tersedia. Selesaikan semua modul Tier ini terlebih dahulu." |
| 409 | BOSS_ALREADY_PASSED | `boss_passed_at` terisi. Pesan: "Boss Stage Tier ini sudah Anda lulusi." |
| 429 | COOLDOWN_ACTIVE | SPEC-008 D3 |
| 429 | DAILY_ATTEMPT_LIMIT | SPEC-008 D4 |

### POST /api/v1/attempts/{attempt_id}/sections/{section_set_id}/start
- **Success status:** 200 | **Request body:** tidak ada | **Zod:** path `attempt_id`, `section_set_id` uuid
**Response (Success) 200:**
```json
{ "data": { "section": { "assessment_set_id": "b0551001-0001-4000-8000-000000000001", "skill": "LISTENING", "order": 1, "title": "Listening Tier 1", "time_limit_seconds": 900, "question_count": 10, "counts_toward_gate": true, "requires_audio": true, "requires_microphone": false, "phase": "ACTIVE", "started_at": "2026-11-03T12:00:00.000Z", "deadline_at": "2026-11-03T12:15:00.000Z", "remaining_seconds": 900 },
  "passage_markdown": null, "listening": { "audio_url": "/api/v1/attempts/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/audio?section=b0551001-0001-4000-8000-000000000001", "mime_type": "audio/mpeg", "duration_sec": 612 },
  "questions": [ { "question_id": "Q-T1-L-01", "question_type": "FILL_IN_BLANK", "skill": "LISTENING", "prompt": "Name: ______", "points": 1, "target_time_ms": null, "passage_no": null, "section_no": 1, "options": null, "choose_count": null, "fixed_choices": null, "max_words": 2, "matching": null, "segments": null, "tokens": null, "ai_task": null } ],
  "answers": [], "server_now": "2026-11-03T12:00:00.000Z" } }
```
(`questions` dipotong; `QuestionPublicDTO` tanpa kunci.) Memanggil `start` pada section `ACTIVE` mengembalikan payload yang sama dengan `answers` tersimpan (resume).
Catatan audio Boss: `listening.audio_url` memuat query `section=<section_set_id>`; `GET /attempts/{id}/audio` (SPEC-011) menerima query opsional `section` (uuid) dan melayani audio set anak itu bila section tersebut `ACTIVE`; tanpa `section` untuk attempt Boss -> 404.
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Attempt tidak ada/bukan milik user, atau `section_set_id` bukan anak set induk attempt |
| 409 | ATTEMPT_NOT_ACTIVE | Attempt bukan `IN_PROGRESS` |
| 409 | ATTEMPT_EXPIRED | Melewati `attempts.deadline_at + 5 s` |
| 409 | SECTION_ORDER_VIOLATION | Ada section sebelumnya yang belum `DONE`. Pesan: "Selesaikan section sebelumnya terlebih dahulu." |
| 409 | SECTION_ALREADY_DONE | Section sudah `DONE` |

### POST /api/v1/attempts/{attempt_id}/sections/{section_set_id}/submit
- **Success status:** 200 | **Request body:** tidak ada
**Response (Success) 200:** `{ "data": { "section": <SectionDTO phase "DONE">, "next_section": <SectionDTO|null> } }` (tanpa skor; skor hanya di hasil akhir).
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Seperti `start` |
| 409 | ATTEMPT_NOT_ACTIVE | Attempt tidak `IN_PROGRESS` |
| 409 | SECTION_NOT_ACTIVE | Section `PENDING` |
Memanggil pada section `DONE` mengembalikan 200 idempoten (tanpa efek).

### PUT /api/v1/attempts/{attempt_id}/answers/{question_id} (kode error tambahan untuk Boss)
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 409 | SECTION_NOT_ACTIVE | Section pemilik soal `PENDING` atau `DONE` |
| 409 | SECTION_EXPIRED | `now() > section.deadline_at + 5 s` (section otomatis ditutup dan dinilai dari jawaban tersimpan; `phase` menjadi `DONE`) |

### POST /api/v1/attempts/{attempt_id}/submit (ekstensi hasil `boss`)
`AttemptResultDTO.boss` terisi; `skip` dan `placement` null; `attempt.band_score` = `boss_band`.
```json
{ "boss": { "passed": true, "gate": { "type": "BAND", "value": 5.0 }, "percent": 57.5, "boss_band": 6.0,
  "sections": [
    { "skill": "LISTENING", "raw_score": 16, "max_score": 20, "raw_40": 32, "band": 7.5, "status": "SUBMITTED", "submission_ids": [], "counts_toward_gate": true },
    { "skill": "READING", "raw_score": 7, "max_score": 20, "raw_40": 14, "band": 4.5, "status": "SUBMITTED", "submission_ids": [], "counts_toward_gate": true },
    { "skill": "WRITING", "raw_score": null, "max_score": null, "raw_40": null, "band": null, "status": "SUBMITTED", "submission_ids": ["d4c3b2a1-1111-4000-8000-0000000000f1"], "counts_toward_gate": false },
    { "skill": "SPEAKING", "raw_score": null, "max_score": null, "raw_40": null, "band": null, "status": "EXPIRED", "submission_ids": [], "counts_toward_gate": false } ],
  "overall_band_estimate": null, "pending_ai": 1,
  "band_table_ids": { "listening": "aa11bb22-0001-4000-8000-000000000001", "reading_academic": "aa11bb22-0002-4000-8000-000000000002" },
  "tier": { "id": "7a1b2c3d-0002-4000-8000-000000000002", "tier_number": 2 }, "next_tier_unlocked": true,
  "unlocked": [ { "kind": "TIER", "id": "7a1b2c3d-0003-4000-8000-000000000003", "label": "Tier 3 Operational IELTS" } ],
  "retry": { "next_allowed_at": null, "attempts_remaining_today": 2 },
  "disclaimer": "Perkiraan latihan, bukan skor resmi IELTS." } }
```
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `boss.percent` | number | tidak | D6 persen L+R (2 desimal) |
| `boss.boss_band` | number | tidak | `bossBand` (selalu dihitung) |
| `sections[].band` | number | ya | band Listening/Reading; W/S: band evaluasi AI terbaru bila ada, selain itu null (Badge "Masukan") |
| `sections[].status` | enum `attempt_status` | tidak | |
| `sections[].submission_ids` | uuid[] | tidak | submission W/S section ini |
| `pending_ai` | int | tidak | jumlah submission W/S yang belum terminal |
| `overall_band_estimate` | number | ya | D8 |
| `next_tier_unlocked` | boolean | tidak | |
| `retry` | object | tidak | seperti SPEC-008 (`next_allowed_at` null bila lulus) |
Contoh di atas: Tier 2 (BAND 5.0): L 7.5 dan R 4.5 -> `boss_band` 6.0 -> lulus.

### GET /api/v1/attempts/{attempt_id}/result
Sama seperti SPEC-006; untuk Boss `boss` dihitung ulang (D8) pada setiap panggilan. Kode error: `NOT_FOUND` (404), `ATTEMPT_NOT_FINISHED` (409).

## Database Changes
Tidak ada tabel/kolom baru. Memakai `attempts` (`state`, `result_json`, `band_score`, `deadline_at`), `attempt_sections`, `attempt_answers` (`assessment_set_id` = set anak), `submissions.attempt_id`. `attempts.state.sections` (jsonb): `{ "<section_set_id>": { "phase": "PENDING|ACTIVE|DONE", "started_at": "ISO|null", "deadline_at": "ISO|null" } }` dan `state.question_section`: `{ "<question_id>": "<section_set_id>" }`. `attempt_sections.status` memakai `IN_PROGRESS` (PENDING/ACTIVE), `SUBMITTED` (section diselesaikan user), `EXPIRED` (waktu habis), `GRADED` (setelah skor final). `attempts.result_json` menyimpan struktur `boss` tanpa field turunan D8. Mendaftarkan `assessmentTypeHandlers.TIER_BOSS_EXAM` (`start`, `onFinish`, `intro`) dan menjadikan `BOSS_SECTION` tetap tidak dapat dimulai langsung. Aturan data (validasi di SPEC-004/020): `question_id` unik lintas anak satu induk. Audit: `BOSS_PASSED`, `BOSS_FAILED` (`metadata`: `tier_number`, `boss_band`, `percent`).

## UI/UX
Rujukan: `design-system.md` 5.19 Mode Ujian, 5.9 (header Tier, tombol Boss), 5.15 Editor Writing, 5.16 Perekam Speaking, 5.13/5.14 (Reading/Listening), 8.5-8.8 wireframe.

- **Intro** `/ujian/mulai/[assessment_set_id]` (`ExamIntro`, SPEC-008) + blok Boss: daftar section (ikon skill, nama, durasi, jumlah soal), total durasi, penjelasan gerbang ("Lulus bila band Listening + Reading >= 5.0" atau "Lulus bila akurasi Listening + Reading >= 80%"), catatan `advisory_note`, `last_result`, checklist audio dan mikrofon, Button primary "Mulai Ujian" (disabled + alasan bila `available=false`; `BOSS_ALREADY_PASSED` menampilkan "Sudah lulus" tanpa tombol).
- **Transisi section** (`SectionGate`): layar tenang: "Section {n} dari {N}: {nama}", durasi, aturan singkat (mis. audio sekali putar), Button primary "Mulai Section". Setelah section selesai: "Section {nama} selesai" + Button "Lanjut". Tidak ada tombol kembali ke section selesai.
- **Section berjalan:** `ExamShell` dengan header nama section dan timer section; Listening memakai `ListeningPlayer` EXAM (SPEC-011); Reading memakai `ReadingWorkspace` (SPEC-010); Writing memakai `WritingEditor` (SPEC-012) sebagai halaman penuh; Speaking memakai `SpeakingRecorder` (SPEC-013) dengan persetujuan rekaman bila perlu. Tombol "Selesai Section" (Dialog konfirmasi menyebut soal belum dijawab). Gagal jaringan: perilaku SPEC-010 butir 6.
- **Hasil** `/ujian/[attempt_id]/hasil`: `BandBadge` besar `boss_band` + status Lulus/Belum lulus (ikon + teks); kartu per skill: Listening dan Reading menampilkan "Skor mentah {raw}/{max} -> setara {raw_40}/40 -> Band {band}" memakai `BandConversionTable` (dari `GET /band-tables/active`) dan Badge "Menentukan kelulusan"; Writing dan Speaking menampilkan "Menunggu penilaian AI" (spinner dan teks), atau band + Badge "Masukan (tidak menentukan kelulusan)" dengan tautan "Lihat umpan balik" ke `/riwayat/penilaian/{id}`, atau "Tidak dikerjakan"; baris gerbang ("Target Band 5.0, hasil Anda 6.0"); `overall_band_estimate` bila ada dengan `EstimasiNotice`. Lulus: Button primary "Buka Tier {n+1}" (ke `/peta`) + daftar "Terbuka". Belum lulus: pesan suportif, rincian keterampilan terlemah, jam coba lagi (`retry.next_allowed_at`), Button "Kembali ke Peta".
- Perlindungan keluar: `beforeunload` + Dialog "Keluar dari ujian? Jawaban tersimpan, waktu terus berjalan."
- State: loading Skeleton; 429 saat mulai -> Dialog informatif; section expired -> Dialog "Waktu section habis" lalu ke transisi; AI tertunda -> hasil Writing/Speaking diperbarui otomatis tanpa layout shift.

## Acceptance Criteria
- [ ] **Given** semua modul Tier 2 `COMPLETED`/`SKIPPED` dan Boss `PUBLISHED` **When** `GET /exams/{id}/intro` **Then** `available=true`, `boss.sections` terurut LISTENING, READING (+WRITING/SPEAKING bila ada), `boss.gate = {type:"BAND", value:5}`.
- [ ] **Given** satu modul Tier belum selesai **When** `POST /attempts` pada set induk **Then** 409 `BOSS_NOT_AVAILABLE` (`details[0].code="MODULES_INCOMPLETE"`), tidak ada attempt; Tier `LOCKED` -> `TIER_LOCKED`; setelah lulus -> 409 `BOSS_ALREADY_PASSED`.
- [ ] **Given** syarat terpenuhi **When** `POST /attempts` **Then** 201, `sections` memuat semua anak dengan `phase="PENDING"`, `questions=[]`, `deadline_at = started_at + jumlah time_limit + 1800 s`, dan satu baris `attempt_sections` per anak.
- [ ] **Given** section Listening belum `DONE` **When** `start` section Reading **Then** 409 `SECTION_ORDER_VIOLATION`; `start` section yang sudah `DONE` -> 409 `SECTION_ALREADY_DONE`; `start` untuk `section_set_id` set lain -> 404.
- [ ] **Given** section `ACTIVE` **When** `start` dipanggil lagi **Then** 200 dengan `started_at`/`deadline_at` TIDAK berubah dan `answers` tersimpan ikut kembali.
- [ ] **Given** section `PENDING` **When** `PUT answers` untuk soal section itu **Then** 409 `SECTION_NOT_ACTIVE`.
- [ ] **Given** jam server melewati `section.deadline_at + 5 s` **When** `PUT answers` **Then** 409 `SECTION_EXPIRED`, section `DONE` dengan `attempt_sections.status="EXPIRED"`, dan jawaban sebelumnya dinilai.
- [ ] **Given** payload `start` section dan `GET /attempts/{id}` **When** diperiksa **Then** tidak ada `correct_answers`/`explanation_id`/`is_correct`, dan soal section lain belum dikirim (hanya section yang sedang `ACTIVE`).
- [ ] **Given** Tier 2 dengan L raw40 16 dan R raw40 14 **When** `submit` **Then** `boss_band=5.0`, `passed=true`, `applyBossResult` dipanggil, Tier 2 `COMPLETED`, Tier 3 `UNLOCKED` (`unlock_source="BOSS_PASS"`); dengan L 13 dan R 13 -> `boss_band=4.5`, `passed=false`, Tier 3 tetap `LOCKED`.
- [ ] **Given** vektor D6 untuk Tier 3 (L 23/R 22 lulus; 22/22 gagal), Tier 4 (30/29 lulus), Tier 1 PERCENT (16/20 lulus, 15/20 gagal) **When** diuji pada fungsi penilai **Then** semuanya sesuai.
- [ ] **Given** section Listening dengan 10 soal 1 poin, 9 benar **When** dinilai **Then** `raw_40=36` (`scaleToForty(9,10)`), `band=8.0` (tabel seed LISTENING).
- [ ] **Given** Writing/Speaking sangat buruk atau tidak dikerjakan **When** L dan R memenuhi gerbang **Then** `passed=true` (W/S tidak memengaruhi gerbang); **Given** nilai AI Writing 9.0 tetapi L/R gagal **Then** `passed=false`.
- [ ] **Given** Writing `SELF_ASSESSMENT` atau evaluasi `injection_suspected` **When** `overall_band_estimate` dihitung **Then** komponen itu dianggap kosong dan `overall_band_estimate=null`.
- [ ] **Given** keempat komponen tersedia (L 6.5, R 6.0, W 6.0 AI_LOCAL, S 6.0 AI_LOCAL) **When** `GET .../result` **Then** `overall_band_estimate=6.0` (rata-rata 6.125 dibulatkan resmi); evaluasi yang selesai setelah submit muncul pada `GET` berikutnya tanpa mengubah `passed`.
- [ ] **Given** percobaan gagal 10 menit lalu **When** `POST /attempts` **Then** 429 `COOLDOWN_ACTIVE`; 3 percobaan dalam 24 jam -> 429 `DAILY_ATTEMPT_LIMIT`; attempt `IN_PROGRESS` di-resume (200) tanpa terkena batas.
- [ ] **Given** `submit` serentak 2x **When** diproses **Then** satu efek (poin/gerbang/audit sekali), kedua respons 200 identik.
- [ ] **Given** `submit` saat section Listening `ACTIVE` dan Reading/Writing/Speaking `PENDING` **When** diproses **Then** Listening dinilai dari jawaban tersimpan, Reading `raw_score=0`, W/S `status` tanpa submission, dan attempt `GRADED`.
- [ ] **Given** `question_id` sama di dua section Boss (data korup) **When** import **Then** ditolak validator (SPEC-004); pada runtime dua soal berbeda section tidak saling menimpa jawaban (UQ `(attempt_id, question_id)` dijaga validator).
- [ ] **Given** audio Boss **When** `GET /attempts/{id}/audio?section=<LISTENING section>` saat section `ACTIVE` **Then** 206/200; tanpa `section` -> 404; untuk section `PENDING`/`DONE` -> 409 `ATTEMPT_NOT_ACTIVE`.
- [ ] **Given** attempt milik user lain **When** memanggil endpoint section/submit/result **Then** 404.
- [ ] **Given** E2E Playwright (fixture Boss Tier 1: L 4 soal, R 4 soal, W 1, S 1; mock AI) **When** learner menyelesaikan semua section **Then** layar transisi muncul antar section, hasil menampilkan band + rincian per skill, W/S berlabel "Masukan", dan hasil W/S terisi otomatis setelah mock AI selesai; pada 375x812 tanpa scroll horizontal.
- [ ] **Given** hasil Boss **When** payload diperiksa **Then** `review`, jika ada, tidak memuat `correct_answer` atau `explanation_id` (SPEC-006 D10).

## Edge Cases & Validation
- [ ] Boss tanpa section Writing/Speaking: valid; `sections` hanya L dan R; `overall_band_estimate=null`; `pending_ai=0`.
- [ ] Learner menutup tab di tengah section: jam section terus berjalan; `GET /attempts/{id}` mengembalikan section aktif beserta `remaining_seconds`.
- [ ] Set anak diubah/diarsipkan admin saat attempt berjalan: attempt memakai data saat mulai section; admin dicegah menyunting set yang punya attempt `IN_PROGRESS` (SPEC-020).
- [ ] `max_score = 0` pada section L atau R (tidak mungkin pada set `PUBLISHED`): section dianggap `raw_40=0`, band sesuai tabel (0.0).
- [ ] Tabel band aktif berganti di tengah attempt: nilai dihitung dengan tabel aktif saat `submit` dan `result_json.band_table_ids` mencatatnya.
- [ ] Gagal menulis `applyBossResult`: seluruh transaksi `submit` dibatalkan (500), attempt tetap `IN_PROGRESS`.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; gerbang Listening+Reading, W/S advisory (ADR-003 #1, #17); cooldown S-D4 |
