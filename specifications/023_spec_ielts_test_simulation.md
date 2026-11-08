# SPEC-023: Simulasi Tes IELTS General Training dengan Pilihan Section

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-004); direvisi teknis oleh Analyst 2026-11-08 (menyelaraskan dengan SPEC-025/ADR-005)
- **Created:** 2026-11-08
- **Status:** approved (human, 2026-11-08, via /build-feature: disetujui apa adanya); revisi teknis 2026-11-08 menunggu konfirmasi human pada butir "Keputusan Analyst"
- **Depends on:** SPEC-006, SPEC-009 (tabel band `LISTENING` dan `READING_GENERAL`; `READING_GENERAL` SUDAH ada di seed), SPEC-011, SPEC-012, SPEC-013 (addendum Speaking eksternal), SPEC-014 (pola timer server dan pemulihan), SPEC-017, SPEC-022 (bank soal, migrasi `0002` termasuk `attempts` tanpa set), SPEC-024 (bank Listening beraudio), SPEC-025. Dependensi berstatus `ready_to_test` dianggap cukup (dispensasi human).
- **Prioritas:** P1
- **Urutan build:** KE-4 (terakhir) dari 4 (022 -> 021 -> 024 -> 023).
- **Cakupan:** Backend (perakit tes, attempt multi-section, penilaian gabungan) + Frontend (pemilih section, runner, hasil) + Konten (stok bank soal GT per format ujian, pekerjaan konten terpisah)

## User Story
Sebagai Learner IELTS General Training (profil lokal), saya ingin memulai simulasi tes dengan memilih section yang saya mau (Listening, Reading, Writing, Speaking, boleh sebagian atau lengkap), sehingga saya dapat berlatih kondisi ujian yang realistis sesuai target latihan hari itu, dan mendapat band per section serta Overall bila lengkap.

## Non-Goals / Out of Scope
- Tidak menggantikan Boss Stage (SPEC-014): Boss tetap gerbang Tier; simulasi bebas gerbang dan tidak membuka/mengunci apa pun.
- Tidak ada skor resmi: semua tampilan memuat "Perkiraan latihan, bukan skor resmi IELTS."
- Tidak ada tes Academic (grafik/peta/diagram).
- Tidak ada proctoring atau pembatasan perangkat.
- Speaking tidak dinilai otomatis pada MVP; dinilai lewat prompt AI eksternal dan input skor (SPEC-013 addendum).
- Tidak ada panel/endpoint admin; tabel band diganti lewat CLI `npm run band:import` (SPEC-025).
- Tidak ada poin, mahkota, streak harian dari simulasi.
- Tidak membuat konten Reading 40 soal / Listening 40 soal dalam spec ini: itu pekerjaan konten (D10). Kode, fixture, dan tes dibangun dan dibuktikan tanpa konten itu.
- Tidak ada pemutaran ulang audio Listening dan tidak ada jeda/pause timer.
- Tidak ada jadwal/kuota harian simulasi.

## Definisi Tetap
**D1. Section dan format General Training.**
| Section | Isi | Waktu | Penilaian |
|---|---|---|---|
| LISTENING | 4 bagian (S1-S4), 40 soal (10 per bagian), audio tiap bagian diputar sekali | `time_limit_seconds` = jumlah `duration_sec` audio keempat bagian + 120 detik (periksa jawaban) | otomatis, tabel band `LISTENING` |
| READING | 3 teks berurutan, 40 soal total | 3600 detik | otomatis, tabel band `READING_GENERAL` (`READING_BAND_SKILL`) |
| WRITING | Task 1 (surat, >= 150 kata) + Task 2 (esai, >= 250 kata) | 3600 detik total (petunjuk UI 20 + 40 menit; tidak dipaksakan per task) | LLM lokal; band Writing = (Task 1 x 1 + Task 2 x 2) / 3 dengan aturan pembulatan D4 |
| SPEAKING | Part 1 (4 pertanyaan), Part 2 (1 cue card), Part 3 (4 pertanyaan) | tanpa timer server (±11-14 menit sebagai petunjuk) | prompt AI eksternal + input skor manual per part |
Jumlah kata minimum Writing adalah petunjuk (penghitung kata di UI), tidak memblokir pengiriman.

**D2. Pilihan section dan urutan.** Learner memilih himpunan tak kosong dari {LISTENING, READING, WRITING, SPEAKING} (1-4 unik). Urutan eksekusi tetap: LISTENING -> READING -> WRITING di antara section terpilih (section berikutnya baru boleh dimulai setelah section sebelumnya yang terpilih dikirim). SPEAKING dapat dimulai kapan saja (sebelum, sesudah, atau di antara) karena memakai AI pihak ketiga, tanpa timer.

**D3. Perakitan soal** (fungsi `assembleSimulation(pool, selection, seenQuestionIds, rng)` di `src/server/simulation/assemble.ts`; pool = bank `QUESTION_BANK` berstatus `PUBLISHED`, `exam_module='GENERAL_TRAINING'`). "Sudah dilihat" (`seen`) = `question_id` yang muncul pada `state` attempt `MOCK_TEST` milik profil dengan status bukan `ABANDONED`. Aturan umum: pilih yang belum dilihat lebih dulu; bila tak cukup, isi dari yang sudah dilihat (urut seed). Penarikan acak memakai PRNG dari `rng_seed` CSPRNG yang disimpan di `attempts.state`.
- **READING:** satuan = paket teks (bank, `passage_no`) seperti SPEC-022 D4 dengan jenis bank `READING_GT_S1`, `READING_GT_S2`, `READING_GT_S3`. Pilih tepat satu paket dari tiap jenis (urutan tampil S1, S2, S3 = makin sulit) dengan jumlah soal total TEPAT 40. Dari semua kombinasi yang berjumlah 40 pilih yang memuat soal `seen` paling sedikit; seri dipecah oleh PRNG. Tidak ada kombinasi = Reading tidak ditawarkan.
- **LISTENING:** tepat satu bank `PUBLISHED` ber-`listening_asset_id` untuk tiap `LISTENING_GT_S1..S4`, jumlah soal total TEPAT 40; pilih yang `seen` paling sedikit. Tidak lengkap = Listening tidak ditawarkan.
- **WRITING:** 1 soal dari salah satu bank `WRITING_GT_T1_*` (task_kind `TASK1`) dan 1 soal dari `WRITING_GT_T2` (`TASK2`). Register Task 1 dipilih seragam acak di antara register yang punya soal belum dilihat. Perlu minimal 1 soal untuk tiap task.
- **SPEAKING:** 4 soal dari `SPEAKING_P1`, 1 dari `SPEAKING_P2`, 4 dari `SPEAKING_P3`. Perlu minimal 4/1/4 soal `PUBLISHED`. Soal Part 3 tidak dikaitkan dengan topik Part 2 (bank tidak punya metadata keterkaitan).
- Soal dibekukan (snapshot) di `attempts.state` (skema `mock.v1` di bawah). Opsi jawaban diacak dengan seed CSPRNG rahasia (`state.rng_seed`).

**D4. Band dan pembulatan (aturan SATU untuk semua).** `roundBand(x) = floor(2x + 0.5) / 2` (kelipatan 0,5; x.25 naik ke x.5; x.75 naik ke bilangan bulat berikutnya). Dihitung dengan bilangan bulat setengah-band (`h = band x 2`) untuk menghindari galat pecahan: untuk jumlah berbobot `W` (dalam setengah-band) dan pembagi `n`, hasil setengah-band = `floor((2W + n) / (2n))`.
- Writing: `W = h(T1) + 2 x h(T2)`, `n = 3`. Contoh: T1 6.0 dan T2 6.5 -> `W = 12 + 26 = 38` -> `floor(79/6) = 13` -> 6.5. T1 6.5 dan T2 6.0 -> `W = 13 + 24 = 37` -> `floor(77/6) = 12` -> 6.0. Task kosong = band 0 untuk task itu (D8).
- Speaking: `W = h(part1) + h(part2) + h(part3)` (band tiap part = `overall_band` evaluasi eksternal yang dihitung server dari empat kriteria, SPEC-013), `n = 3`.
- Reading dan Listening: `raw40` = `scaleToForty(rawScore, maxScore)` (utilitas SPEC-009 yang sama dengan Boss), band = pencarian baris tabel band aktif (`READING_GENERAL` untuk Reading, `LISTENING` untuk Listening). Jangkar: 30/40 -> 6.0, 34/40 -> 7.0, 40/40 -> 9.0.
- **Overall** = `roundBand` dari rata-rata EMPAT band section (`W = jumlah h`, `n = 4` -> `floor((S + 2) / 4)` setengah-band, dengan `S` jumlah setengah-band) dan hanya ditampilkan bila KEEMPAT section terpilih dan masing-masing berstatus `GRADED`. Contoh: 6.0, 6.0, 6.0, 7.0 -> `S = 50` -> 13 -> 6.5; 6.0, 7.0, 7.0, 7.0 -> `S = 54` -> 14 -> 7.0.
- Selain itu: `overall.status='PARTIAL_SELECTION'` (kurang dari 4 terpilih) dengan label "Overall parsial: dipilih {n} dari 4 section", atau `PENDING_SECTIONS` (4 terpilih, belum semua bernilai) dengan label "Menunggu skor Speaking" / "Menunggu penilaian Writing" / "Menunggu penilaian Writing dan skor Speaking". Keduanya menyertakan `indicative_band` = `roundBand` rata-rata band section yang sudah `GRADED` (null bila belum ada).
- Speaking menunggu input skor tiga part; hasil menampilkan "Menunggu skor Speaking" sampai ketiganya terisi.

**D5. Dampak ke radar dan gamifikasi.** Hasil objektif (Listening/Reading) masuk `attempt_answers` (skill `LISTENING`/`READING`) sehingga `skillScoreHook` memperbarui `user_skill_scores` ketika attempt menjadi `GRADED` (D6); Writing/Speaking masuk lewat `evaluationGradedHooks` yang ada (submission membawa `attempt_id`). `points_awarded=0`; gamifikasi, gatekeeping, dan Boss tidak dipanggil untuk `MOCK_TEST`. Simulasi muncul di Riwayat Ujian (`GET /me/exam-history`) sebagai entri baru bertipe `MOCK_TEST` (judul "Simulasi tes", `band_score` = Overall bila `COMPLETE`, selain itu null, tautan ke `/simulasi/{attempt_id}/hasil`).

**D6. Status attempt dan section.** Baris `attempt_sections` dibuat saat `POST /simulations`, satu per section terpilih (`skill` = nama section, `assessment_set_id` NULL, `status='IN_PROGRESS'`, `started_at` NULL). Status section di API: `NOT_STARTED` (= `started_at` NULL), `IN_PROGRESS`, `AWAITING_GRADING` (Writing dikirim, menunggu evaluasi), `GRADED`.
- Attempt `MOCK_TEST` (`mode='EXAM'`): `IN_PROGRESS` selama ada section terpilih selain SPEAKING yang belum dikirim; bila yang terpilih HANYA SPEAKING: `IN_PROGRESS` sampai ketiga part bernilai. `AWAITING_GRADING` bila semua section non-Speaking sudah dikirim tetapi Writing belum `GRADED`. `GRADED` bila semua section terpilih non-Speaking `GRADED` (Speaking yang menyertai tidak menahan status attempt; hasil Speaking menyusul di `result`). `ABANDONED` lewat `POST .../abandon`. `attemptCompletedHooks` dipanggil tepat sekali saat attempt pertama kali menjadi `GRADED`.
- Hanya satu attempt `MOCK_TEST` berstatus `IN_PROGRESS` per profil (indeks `attempts_one_active_mock_uq`, SPEC-022). Attempt `AWAITING_GRADING`/`GRADED` tidak menghalangi simulasi baru.

**D7. Pemulihan dan waktu.** Timer otoritatif di server (`attempt_sections.started_at`, `deadline_at = started_at + time_limit_seconds x 1000`). Refresh halaman memulihkan section aktif dan sisa waktu dari `GET /simulations/{id}` (`remaining_seconds` dari `deadline_at - server now`). Kedaluwarsa dievaluasi malas: setiap permintaan yang menyentuh attempt (GET, jawaban, start, submit) lebih dulu memproses section `IN_PROGRESS` dengan `deadline_at < now` menjadi dikirim otomatis (`submitted_at = deadline_at`, `auto_submitted = true` pada DTO), dengan jawaban yang sudah tersimpan. Jawaban baru setelah `deadline_at + 5 detik` ditolak `409 SECTION_EXPIRED`.

**D8. Writing kosong dan LLM tidak tersedia.** Task Writing tanpa submission (kosong, setelah `trim` 0 karakter) dinilai band 0 untuk task itu dan TIDAK dikirim ke LLM; kedua task kosong = Writing band 0. Bila LLM tidak tersedia (`AI_ENABLED=false` atau submission `FALLBACK_SELF_ASSESSMENT`), section tertahan `AWAITING_GRADING` sampai learner mengisi penilaian sendiri (`POST /submissions/{id}/self-assessment`); band dari penilaian sendiri diberi `verified=false` dan label "tidak terverifikasi". Submission `FAILED` dapat diulang (SPEC-012) selama section `AWAITING_GRADING`.

**D9. Skema `attempts.state` untuk `MOCK_TEST` (`schema: "mock.v1"`).**
`{ schema: "mock.v1", rng_seed: string(32 hex), sections: [{ section: "LISTENING"|"READING"|"WRITING"|"SPEAKING", order: int, time_limit_seconds: int|null, parts: [{ part_no: int, bank_set_id: uuid, bank_code: string, passage_no: int|null, passage_markdown: string|null, listening_asset_id: uuid|null, audio_duration_sec: int|null }], questions: [{ position: int, question_id: string, bank_set_id: uuid, part_no: int, skill: string, question_type: string, option_order: string[]|null, question: <Question lengkap termasuk kunci> }] }] }`. Isi `state` tidak pernah dikirim apa adanya; klien menerima DTO publik tanpa kunci.

**D10. Konten rilis minimum dan keadaan saat ini (tanpa mengubah kode).**
| Section | Syarat ditawarkan | Keadaan konten 2026-11-08 |
|---|---|---|
| WRITING | >= 1 soal `TASK1` dan >= 1 soal `TASK2` terpublikasi | TERSEDIA (T1 3 register x 3 soal, T2 9 soal) |
| SPEAKING | >= 4 soal P1, >= 1 P2, >= 4 P3 terpublikasi | TERSEDIA (9/6/6) |
| READING | ada kombinasi (S1, S2, S3) berjumlah tepat 40 soal | BELUM (bank awal: 2 teks x 8 soal) |
| LISTENING | 4 bank S1-S4 beraudio terpublikasi berjumlah 40 soal | BELUM (SPEC-024 hanya mewajibkan S1) |
Konsekuensi: pada DB pemilik saat ini hanya WRITING dan SPEAKING yang dapat dipilih; READING dan LISTENING muncul `available=false`. Logika, fixture sintetis, dan tes tetap dibangun penuh; konten nyata menyusul (AC-C di bawah).

## Technical Flow
1. `GET /api/v1/simulations/options` — server menjalankan `assembleSimulation` percobaan (tanpa menyimpan) per section dan mengembalikan ketersediaan.
2. `POST /api/v1/simulations` body `{ sections }` — dalam satu transaksi `BEGIN IMMEDIATE`: tolak bila ada `MOCK_TEST` `IN_PROGRESS`; rakit soal (D3); buat attempt `MOCK_TEST` (`assessment_set_id` NULL, `assessment_version` 0, `mode='EXAM'`, `state` = `mock.v1`) dan baris `attempt_sections`.
3. Runner: untuk tiap section learner memanggil `POST .../sections/{section}/start` (timer mulai; idempoten), memuat isi dengan `GET .../sections/{section}`, menjawab soal objektif lewat `PUT /api/v1/attempts/{attempt_id}/answers/{question_id}` (mode `EXAM`: tanpa umpan balik instan; hanya diterima untuk section `IN_PROGRESS` sebelum deadline + 5 detik), mengirim Writing lewat `POST /api/v1/submissions/writing` (`attempt_id`, `question_id`, `kind` sesuai `task_kind`), lalu `POST .../sections/{section}/submit`.
4. Submit section: Listening/Reading — nilai otomatis, hitung band, section `GRADED`; Writing — section `AWAITING_GRADING` sampai kedua task bernilai (evaluasi masuk antrean AI dalam proses), task kosong = 0 (D8); setelah submit, `evaluationGradedHooks` memanggil `simulationService.onEvaluationGraded` yang menghitung ulang section dan status attempt.
5. Speaking: `start` membuka kartu prompt per part (tombol "Salin prompt") dan form skor; learner mengirim skor per part lewat `POST /api/v1/submissions/speaking-external` dengan `attempt_id`, `question_id` = `question_id` soal pertama part itu pada state, `kind` = `SPEAKING_PART1|2|3`. Layanan AI diubah agar attempt `MOCK_TEST` berstatus `IN_PROGRESS`, `AWAITING_GRADING`, atau `GRADED` menerima pengiriman Speaking selama section SPEAKING belum `GRADED` (selain itu `409 ATTEMPT_NOT_ACTIVE`), dan membaca soal dari `attempts.state` (SPEC-022).
6. `GET /api/v1/simulations/{attempt_id}/result` — band per section, Overall (D4), status penilaian.

## API Contract
Semua rute `auth: 'user'`, envelope `{ data }` / `{ error }` sesuai `_api-contract.md` bagian 1; `{section}` pada path = `LISTENING|READING|WRITING|SPEAKING` (selain itu `400 VALIDATION_ERROR`). Kepemilikan: attempt milik profil lain atau bukan `MOCK_TEST` -> `404 NOT_FOUND`. Error umum tiap rute: `401 UNAUTHENTICATED`, `403 CSRF_ORIGIN_MISMATCH`/`HOST_NOT_ALLOWED`, `415 UNSUPPORTED_MEDIA_TYPE`.

### GET /api/v1/simulations/options
- **Sukses:** 200.
| Field | Tipe | Null | Keterangan |
|---|---|---|---|
| `data.sections[].section` | string | tidak | 4 nilai, urutan LISTENING, READING, WRITING, SPEAKING |
| `data.sections[].available` | boolean | tidak | |
| `data.sections[].unavailable_reason` | string | ya | `CONTENT_MISSING` bila `available=false` |
| `data.sections[].unavailable_detail` | string | ya | teks Indonesia, mis. "Reading membutuhkan 3 teks dengan total 40 soal." |
| `data.sections[].time_limit_seconds` | int | ya | NULL untuk SPEAKING |
| `data.sections[].question_count` | int | tidak | LISTENING 40, READING 40, WRITING 2, SPEAKING 9 |
| `data.in_progress_attempt_id` | uuid | ya | simulasi `IN_PROGRESS` milik profil |
```json
{ "data": { "sections": [
  { "section": "LISTENING", "available": false, "unavailable_reason": "CONTENT_MISSING", "unavailable_detail": "Listening membutuhkan 4 bagian beraudio dengan total 40 soal.", "time_limit_seconds": null, "question_count": 40 },
  { "section": "READING", "available": false, "unavailable_reason": "CONTENT_MISSING", "unavailable_detail": "Reading membutuhkan 3 teks dengan total 40 soal.", "time_limit_seconds": null, "question_count": 40 },
  { "section": "WRITING", "available": true, "unavailable_reason": null, "unavailable_detail": null, "time_limit_seconds": 3600, "question_count": 2 },
  { "section": "SPEAKING", "available": true, "unavailable_reason": null, "unavailable_detail": null, "time_limit_seconds": null, "question_count": 9 } ],
  "in_progress_attempt_id": null } }
```

### POST /api/v1/simulations
- **Sukses:** 201. Body `z.strictObject`.
| Field | Tipe | Required | Constraint |
|---|---|---|---|
| `sections` | string[] | ya | 1-4 elemen unik dari `LISTENING`,`READING`,`WRITING`,`SPEAKING` |
```json
{ "sections": ["READING", "WRITING"] }
```
**Response (201):**
```json
{ "data": { "attempt_id": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b", "status": "IN_PROGRESS", "mode": "EXAM",
  "sections": [
    { "section": "READING", "order": 1, "status": "NOT_STARTED", "time_limit_seconds": 3600, "question_count": 40 },
    { "section": "WRITING", "order": 2, "status": "NOT_STARTED", "time_limit_seconds": 3600, "question_count": 2 } ] } }
```
`order` mengikuti urutan tetap D2 di antara section terpilih (SPEAKING selalu terakhir pada daftar).
| HTTP | Kode | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `sections` kosong/ >4/duplikat/nilai asing (`details[].code`: `too_small`, `too_big`, `invalid_value`, `duplicate_value`), field asing (`unrecognized_key`) |
| 409 | `SIMULATION_IN_PROGRESS` | Sudah ada `MOCK_TEST` `IN_PROGRESS`; `details[0] = { path: "attempt_id", code: "existing_attempt", message: "<uuid attempt>" }` |
| 422 | `SIMULATION_NOT_ENOUGH_CONTENT` | Ada section terpilih yang tidak dapat dirakit; `details[]` satu entri per section `{ path: "sections.READING", code: "content_missing", message: "Reading membutuhkan 3 teks dengan total 40 soal." }` |

### GET /api/v1/simulations/{attempt_id}
- **Sukses:** 200. Pemulihan state.
| Field | Tipe | Null | Keterangan |
|---|---|---|---|
| `data.attempt_id` | uuid | tidak | |
| `data.status` | string | tidak | `IN_PROGRESS`\|`AWAITING_GRADING`\|`GRADED`\|`ABANDONED` |
| `data.server_now` | ISO waktu | tidak | |
| `data.sections[]` | array | tidak | urut `order` |
| `sections[].section` | string | tidak | |
| `sections[].order` | int | tidak | mulai 1 |
| `sections[].status` | string | tidak | `NOT_STARTED`\|`IN_PROGRESS`\|`AWAITING_GRADING`\|`GRADED` |
| `sections[].time_limit_seconds` | int | ya | |
| `sections[].started_at`, `sections[].deadline_at`, `sections[].submitted_at` | ISO waktu | ya | |
| `sections[].remaining_seconds` | int | ya | `max(0, deadline_at - server_now)` bila `IN_PROGRESS`, selain itu NULL |
| `sections[].auto_submitted` | boolean | tidak | |
| `sections[].answered_count`, `sections[].question_count` | int | tidak | |
| `data.active_section` | string | ya | section `IN_PROGRESS` pertama, atau NULL |
Error: 404 `NOT_FOUND`.

### GET /api/v1/simulations/{attempt_id}/sections/{section}
- **Sukses:** 200. Hanya untuk section `IN_PROGRESS` (setelah `start`) atau yang sudah dikirim (hanya baca).
| Field | Tipe | Null | Keterangan |
|---|---|---|---|
| `data.section`, `data.status`, `data.remaining_seconds`, `data.server_now` | seperti di atas | | |
| `data.parts[]` | array | tidak | `{ part_no: int, passage_markdown: string\|null, listening: { audio_url, mime_type, duration_sec, note }\|null, question_ids: string[] }` |
| `data.questions[]` | `QuestionPublicSchema` | tidak | tanpa kunci jawaban/penjelasan; WRITING_TASK memuat `task_kind`, `min_words`; SPEAKING_TASK memuat `part`, `cue_points`, `external_eval_prompt` (atau NULL) |
| `data.answers[]` | `{ question_id, response }` | tidak | jawaban tersimpan |
| `data.submissions[]` | `{ question_id, kind, submission_id, status }` | tidak | untuk WRITING dan SPEAKING |
Error: `404 NOT_FOUND` (section tidak terpilih), `409 SECTION_NOT_ACTIVE` (belum di-`start`).

### POST /api/v1/simulations/{attempt_id}/sections/{section}/start
- **Sukses:** 200; body kosong atau `{}`. Idempoten: memanggil ulang pada section `IN_PROGRESS` mengembalikan `started_at` yang sama. Respons = bentuk `GET .../sections/{section}`.
| HTTP | Kode | Kapan |
|---|---|---|
| 404 | `NOT_FOUND` | Section tidak terpilih / attempt bukan milik profil |
| 409 | `ATTEMPT_NOT_ACTIVE` | Attempt `ABANDONED` atau (selain SPEAKING) bukan `IN_PROGRESS` |
| 409 | `SECTION_ORDER_VIOLATION` | Ada section terpilih sebelumnya (D2) yang belum dikirim |
| 409 | `SECTION_ALREADY_DONE` | Section sudah dikirim/`GRADED` |
| 409 | `SECTION_EXPIRED` | Waktu section habis (sudah dikirim otomatis) |

### POST /api/v1/simulations/{attempt_id}/sections/{section}/submit
- **Sukses:** 200; body kosong atau `{}`. Idempoten pada section yang sudah dikirim.
**Response (200):** `{ "data": { "section": string, "status": "AWAITING_GRADING"|"GRADED", "band": number|null, "raw_score": number|null, "max_score": number|null, "attempt_status": string } }`
```json
{ "data": { "section": "READING", "status": "GRADED", "band": 7.0, "raw_score": 34, "max_score": 40, "attempt_status": "IN_PROGRESS" } }
```
| HTTP | Kode | Kapan |
|---|---|---|
| 404 | `NOT_FOUND` | Section tidak terpilih / bukan milik profil |
| 409 | `SECTION_NOT_ACTIVE` | Section belum di-`start` |
| 409 | `SECTION_NOT_SUBMITTABLE` | `section` = `SPEAKING` (dinilai lewat skor part, bukan submit) |
| 409 | `ATTEMPT_NOT_ACTIVE` | Attempt tidak `IN_PROGRESS` |

### GET /api/v1/simulations/{attempt_id}/result
- **Sukses:** 200.
| Field | Tipe | Null | Keterangan |
|---|---|---|---|
| `data.attempt_id`, `data.status` | | | |
| `data.selected_sections` | string[] | tidak | |
| `data.sections[].section` | string | tidak | |
| `data.sections[].status` | string | tidak | `NOT_STARTED`\|`IN_PROGRESS`\|`AWAITING_GRADING`\|`GRADED` |
| `data.sections[].band` | number | ya | kelipatan 0.5; NULL sebelum `GRADED` |
| `data.sections[].raw_score`, `max_score` | number | ya | Listening/Reading |
| `data.sections[].verified` | boolean | ya | Writing: false bila dari penilaian sendiri; null untuk section lain |
| `data.sections[].detail` | objek | ya | Writing: `{ task1_band, task2_band }` (0 untuk task kosong); Speaking: `{ part1_band, part2_band, part3_band }` (null bila belum dinilai) |
| `data.overall.status` | string | tidak | `COMPLETE`\|`PARTIAL_SELECTION`\|`PENDING_SECTIONS` |
| `data.overall.band` | number | ya | hanya bila `COMPLETE` |
| `data.overall.indicative_band` | number | ya | D4 |
| `data.overall.label` | string | tidak | teks D4 |
| `data.disclaimer` | string | tidak | selalu "Perkiraan latihan, bukan skor resmi IELTS." |
```json
{ "data": { "attempt_id": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b", "status": "GRADED", "selected_sections": ["READING", "WRITING"],
  "sections": [
    { "section": "READING", "status": "GRADED", "band": 7.0, "raw_score": 34, "max_score": 40, "verified": null, "detail": null },
    { "section": "WRITING", "status": "GRADED", "band": 6.5, "raw_score": null, "max_score": null, "verified": true, "detail": { "task1_band": 6.0, "task2_band": 6.5 } } ],
  "overall": { "status": "PARTIAL_SELECTION", "band": null, "indicative_band": 7.0, "label": "Overall parsial: dipilih 2 dari 4 section" },
  "disclaimer": "Perkiraan latihan, bukan skor resmi IELTS." } }
```
(`indicative_band` contoh = `roundBand((7.0 + 6.5) / 2)` = 7.0 karena 6.75 naik.)
Error: 404 `NOT_FOUND`.

### POST /api/v1/simulations/{attempt_id}/abandon
- **Sukses:** 204 tanpa body. Mengubah attempt `IN_PROGRESS`/`AWAITING_GRADING` menjadi `ABANDONED`. Error: 404 `NOT_FOUND`; `409 ATTEMPT_NOT_ACTIVE` bila sudah `GRADED`/`ABANDONED`.

### Endpoint yang ada (perilaku tambahan untuk `MOCK_TEST`)
- `PUT /attempts/{attempt_id}/answers/{question_id}`: untuk `MOCK_TEST` hanya bila section soal itu `IN_PROGRESS` (selain itu `409 SECTION_NOT_ACTIVE`/`SECTION_EXPIRED`); respons tidak memuat umpan balik benar/salah (mode `EXAM`); soal Writing/Speaking tetap `409 QUESTION_REQUIRES_SUBMISSION`.
- `POST /submissions/writing` dan `/submissions/speaking-external`: lihat Technical Flow langkah 3 dan 5.
- `GET /me/exam-history`: entri `MOCK_TEST` (D5).

## Database Changes
**Tidak ada migrasi struktural baru di spec ini.** Semua perubahan skema yang dibutuhkan sudah dijadwalkan SEKALI di migrasi `0002_spec_022_question_banks` (SPEC-022): `attempts.assessment_set_id` nullable + kolom `attempts.assessment_type` + CHECK + indeks `attempts_one_active_mock_uq`; `attempt_sections` dengan `id` surrogate, `assessment_set_id` nullable, `time_limit_seconds`, `started_at`, `deadline_at`, `submitted_at`, indeks unik `attempt_sections_skill_uq` (`attempt_id`,`skill`) WHERE `assessment_set_id IS NULL`; nilai enum `MOCK_TEST` (TypeScript). Tabel band `READING_GENERAL` SUDAH ada (seed `v1-gt-2026-11`: 30/40 = 6.0, 34/40 = 7.0, 40/40 = 9.0; tepi bawah perkiraan); penggantiannya lewat `npm run band:import` (bukan UI admin). Draf lama menyebut `0010_spec_023_simulation.sql` dan kolom `attempt_sections.section_name`: keduanya DIBATALKAN (kolom `skill` dipakai; tidak ada migrasi). Bila implementasi menemukan kebutuhan tabel lain, ditambah sebagai migrasi aditif bernomor berikutnya (tanpa membangun ulang tabel) dan dicatat di Revision History spec ini.
Pemetaan tulis: `attempts` (`assessment_type='MOCK_TEST'`, `mode='EXAM'`, `assessment_version=0`, `state=mock.v1`, `points_awarded=0`); `attempt_sections` (satu baris per section terpilih: `skill`, `time_limit_seconds`, `started_at`, `deadline_at`, `submitted_at`, `status`, `raw_score`, `max_score`, `band_score`); `attempt_answers` (jawaban objektif, `assessment_set_id` = `bank_set_id` asal soal); `submissions` (`attempt_id` = simulasi).

## UI/UX
Komponen dari `state/knowledge_base/design-system/design-system.md`: Card (5.3), Button (5.1), Badge/Chip/Progress/Toast (5.7), Mode Ujian (5.19), Split-Screen Reading (5.13), Listening Ujian (5.14), Editor Writing (5.15), Perekam/kartu Speaking (5.16, mode prompt eksternal), Kuis (5.12).
- Rute: `/simulasi` (pemilih), `/simulasi/[attempt_id]` (runner), `/simulasi/[attempt_id]/hasil` (hasil). Menu navigasi mendapat tautan "Simulasi tes".
- `/simulasi`: empat Card section dengan kotak centang, ringkasan total waktu (jumlah `time_limit_seconds` section terpilih non-Speaking, ditampilkan menit), tombol "Mulai simulasi"; preset cepat "Lengkap", "Reading + Writing", "Writing saja". Card `available=false` nonaktif dengan alasan (`unavailable_detail`). Bila `in_progress_attempt_id` ada: banner "Lanjutkan simulasi" + tombol "Tinggalkan simulasi" (`abandon`).
- Runner bermode ujian tenang (5.19): timer per section dari server (`remaining_seconds`), tanpa gamifikasi, tanpa umpan balik instan; Listening: empat bagian berurutan, tiap audio diputar sekali, rewind terkunci, catatan sintetis; Reading: Split-Screen; Writing: editor dengan penghitung kata dan petunjuk 20/40 menit; Speaking: kartu prompt per part dengan tombol "Salin prompt" dan form skor 4 kriteria per part. Sebelum section berikutnya dimulai tampil layar konfirmasi "Mulai {Section}? Waktu berjalan setelah ditekan."
- Hasil: band per section (kartu), Overall atau label parsial/menunggu, disclaimer "Perkiraan latihan, bukan skor resmi IELTS." di setiap layar hasil, tautan "Masukkan skor Speaking" bila Speaking belum `GRADED`, label "tidak terverifikasi" bila Writing dari penilaian sendiri.
- State: memuat (kerangka), kosong/nonaktif (section tanpa konten), galat (Toast + "Coba lagi"), timer habis (modal "Waktu habis, jawaban dikirim otomatis"). Teks Indonesia di `src/i18n/id.ts`; ikon + teks.

## Acceptance Criteria
Penanda: **[F]** dibuktikan sekarang dengan fixture sintetis (`tests/fixtures/content/sim-*`: Reading 3 teks 14/13/13 soal, Listening 4 bagian x 10 soal dengan audio nada, Writing, Speaking) di DB uji; **[C]** menunggu konten nyata (D10), bukan syarat selesai build.
- [ ] **AC-1 [F]** **Given** fixture lengkap **When** `POST /simulations {"sections":["READING","WRITING"]}` **Then** 201 dan attempt hanya berisi dua `attempt_sections` (`READING`,`WRITING`); setelah keduanya `GRADED`, `GET .../result` memberi `overall.status='PARTIAL_SELECTION'`, `overall.band=null`, `overall.label="Overall parsial: dipilih 2 dari 4 section"`.
- [ ] **AC-2 [F]** **Given** keempat section dipilih dan Listening/Reading/Writing `GRADED` **When** Speaking belum bernilai **Then** `overall.status='PENDING_SECTIONS'`, `overall.band=null`, label "Menunggu skor Speaking", `indicative_band` terisi; **When** tiga part Speaking dikirim skornya **Then** `overall.status='COMPLETE'` dan `overall.band` terisi sesuai D4.
- [ ] **AC-3 [F]** **Given** jawaban Reading 34 benar dari 40 **Then** band 7.0 dan 30 benar -> 6.0, menggunakan tabel `READING_GENERAL`; 40 benar -> 9.0; Listening memakai tabel `LISTENING`.
- [ ] **AC-4 [F]** **Given** band Task 1 dan Task 2 **Then** Writing = `roundBand((T1 + 2 x T2) / 3)` dengan hasil: (6.0, 6.5) -> 6.5; (6.5, 6.0) -> 6.0; (6.5, 7.0) -> 7.0; (0, 6.0) -> 4.0; (5.5, 5.5) -> 5.5 (uji unit fungsi murni).
- [ ] **AC-5 [F]** **Given** DB dengan bank awal saja (tanpa Reading 40/Listening lengkap) **When** `GET /simulations/options` **Then** LISTENING dan READING `available=false` dengan `unavailable_reason='CONTENT_MISSING'`, WRITING dan SPEAKING `available=true`; `POST /simulations {"sections":["LISTENING","READING"]}` -> `422 SIMULATION_NOT_ENOUGH_CONTENT` dengan `details` berisi `sections.LISTENING` dan `sections.READING`; tidak ada attempt tercipta.
- [ ] **AC-6 [F]** **Given** section `IN_PROGRESS` dengan 3 jawaban tersimpan **When** halaman direfresh (`GET /simulations/{id}` dan `GET .../sections/{section}`) **Then** `active_section` sama, `answers` memuat 3 jawaban, `remaining_seconds` = `deadline_at - server_now` (uji dengan jam terkontrol: 600 detik berlalu -> `remaining_seconds` berkurang 600).
- [ ] **AC-7** Tes unit (perakit, `roundBand`/band gabungan, status attempt), tes integrasi (alur dua section READING+WRITING, 409, 422, pemulihan waktu, kedaluwarsa), dan endpoint-guards (semua rute baru `auth: 'user'`, 401 tanpa cookie) lulus; E2E Playwright Reading + Writing (fixture) lulus.
- [ ] **AC-8 [F]** **Given** `POST /simulations` saat sudah ada `MOCK_TEST` `IN_PROGRESS` **Then** `409 SIMULATION_IN_PROGRESS` dengan `details[0].message` = id attempt itu; setelah `abandon` (204) `POST` berikutnya 201.
- [ ] **AC-9 [F]** **Given** section `IN_PROGRESS` yang `deadline_at`-nya lewat **When** permintaan apa pun menyentuh attempt **Then** section dikirim otomatis (`auto_submitted=true`, jawaban tersimpan dinilai); `PUT .../answers/...` sesudah `deadline_at + 5 detik` -> `409 SECTION_EXPIRED`.
- [ ] **AC-10 [F]** **Given** Writing dengan Task 1 terkirim dan Task 2 kosong **When** section dikirim **Then** Task 2 berband 0 tanpa panggilan LLM (tidak ada `submissions` untuk task kosong; stub LLM dipanggil 1 kali, bukan 2), `detail.task2_band=0`, Writing = `roundBand((T1 + 0)/3)`; kedua task kosong -> Writing band 0 tanpa panggilan LLM.
- [ ] **AC-11 [F]** **Given** `AI_ENABLED=false` **When** Writing dikirim **Then** section `AWAITING_GRADING` sampai penilaian sendiri diisi; hasil `verified=false`.
- [ ] **AC-12 [F]** **Given** urutan LISTENING -> READING -> WRITING terpilih **When** `start` READING sebelum LISTENING dikirim **Then** `409 SECTION_ORDER_VIOLATION`; `start` SPEAKING selalu diterima; `submit` SPEAKING -> `409 SECTION_NOT_SUBMITTABLE`.
- [ ] **AC-13 [F]** **Given** profil sudah menjalani satu simulasi **When** simulasi kedua dirakit dengan stok fixture cukup **Then** tidak ada `question_id` Writing/Speaking/Reading yang sama dengan simulasi pertama; **Given** stok tidak cukup **Then** soal berulang dipakai dan perakitan tidak gagal.
- [ ] **AC-14 [F]** **Given** perakitan Reading **Then** tiga paket berjenis `READING_GT_S1`, `S2`, `S3` dengan urutan itu dan total soal tepat 40; **Given** stok Reading tanpa kombinasi 40 **Then** Reading `available=false`.
- [ ] **AC-15 [F]** **Given** perakitan Speaking **Then** 4 soal part 1, 1 soal part 2, 4 soal part 3; skor per part dikirim lewat `speaking-external` dengan `attempt_id` simulasi diterima selama Speaking belum `GRADED`, ditolak `409 ATTEMPT_NOT_ACTIVE` sesudahnya atau bila attempt `ABANDONED`.
- [ ] **AC-16 [F]** **Given** Listening fixture dengan audio 5+5+5+5 detik **Then** `time_limit_seconds` = 20 + 120 = 140.
- [ ] **AC-17 [F]** **Given** simulasi selesai **Then** baris `user_tier_progress`/`user_module_progress`/`user_sub_module_progress` dan `user_stats` identik dengan sebelum simulasi, `points_awarded=0`, `user_skill_scores` untuk skill yang dijawab terbarui, dan `GET /me/exam-history` memuat entri `MOCK_TEST`.
- [ ] **AC-18 [F]** **Given** respons `GET /simulations/{id}/sections/{section}` dan `GET /attempts/{id}` pada `MOCK_TEST` **Then** teks JSON tidak memuat `correct_answers`, `explanation_id`, atau `rng_seed` (tes negatif).
- [ ] **AC-19 [F]** **Given** hasil mana pun **Then** respons memuat `disclaimer` persis "Perkiraan latihan, bukan skor resmi IELTS." dan UI hasil menampilkannya.
- [ ] **AC-20 [F]** **Given** empat band section (6.0, 6.0, 6.0, 7.0) **Then** Overall 6.5; (6.0, 7.0, 7.0, 7.0) -> 7.0; (6.0, 6.0, 6.0, 6.5) -> 6.0 (S = 49 -> `floor(51/4)` = 12 -> 6.0).
- [ ] **AC-C1 [C]** **Given** DB pemilik setelah konten Reading (>= 3 teks, kombinasi 40 soal) terbit **Then** `options` menampilkan READING `available=true` dan simulasi Reading + Writing dapat dijalankan manual.
- [ ] **AC-C2 [C]** **Given** DB pemilik setelah 4 bank Listening beraudio terbit (SPEC-024 S1-S4) **Then** `options` menampilkan LISTENING `available=true`; simulasi lengkap 4 section dijalankan manual dan Overall tampil setelah Speaking diberi skor.

## Edge Cases & Validation
- Hanya satu simulasi `IN_PROGRESS` per profil (`409 SIMULATION_IN_PROGRESS`).
- Section yang waktunya habis dikirim otomatis; jawaban Writing yang kosong dinilai band 0 untuk task itu dan tidak dikirim ke LLM (D8).
- LLM tidak tersedia: Writing masuk fallback nilai-sendiri; hasil diberi label "tidak terverifikasi".
- Bank soal tidak membentuk 40 soal untuk Reading/Listening: section tidak ditawarkan (`available=false`).
- `sections` berisi nilai ganda atau lebih dari 4 elemen: `400 VALIDATION_ERROR`.
- Audio Listening dengan `duration_sec` NULL pada aset: bank itu dianggap tidak beraudio lengkap (section tidak ditawarkan).
- Attempt `ABANDONED` tidak menerima jawaban/submission (`409 ATTEMPT_NOT_ACTIVE`).
- Dua tab membuka simulasi yang sama: jawaban terakhir menang (UPSERT per soal); timer sama karena otoritatif di server.
- Submission Writing untuk `question_id` yang bukan milik section Writing attempt itu: `404 NOT_FOUND`; `kind` tidak cocok `task_kind`: `409 QUESTION_TYPE_MISMATCH`.
- Perubahan bank sesudah simulasi dirakit tidak memengaruhi attempt (snapshot).

## Status Implementasi
| Area | Status | Catatan |
|---|---|---|
| Fungsi murni: `roundBand`, band gabungan, status attempt/section | not_started | |
| Perakit `assembleSimulation` + fixture sintetis `sim-*` | not_started | |
| Layanan simulasi + 8 endpoint (`options`, `POST`, `GET`, `sections/{section}` GET/start/submit, `result`, `abandon`) | not_started | menunggu `0002` (SPEC-022) |
| Perluasan layanan AI (Writing/Speaking-eksternal untuk `MOCK_TEST`), `evaluationGradedHooks`, riwayat ujian | not_started | |
| UI `/simulasi`, runner, hasil | not_started | |
| Konten Reading 40 soal (3 teks) | not_started | pekerjaan konten (AC-C1) |
| Konten Listening S1-S4 beraudio | not_started | SPEC-024 + konten lanjutan (AC-C2) |
| Tes (unit, integrasi, guards, E2E) | not_started | |

## Keputusan Analyst — perlu konfirmasi human
1. Batas lingkup tanpa konten: Reading/Listening dibangun dan diuji penuh dengan fixture sintetis; pada DB pemilik hanya Writing dan Speaking dapat dipilih sampai konten terbit (D10, AC-C1/C2 menunggu konten).
2. Komposisi Reading: tepat satu paket dari tiap `READING_GT_S1/S2/S3` berjumlah 40 soal; Listening: satu bank tiap S1-S4 berjumlah 40 soal (10 per bagian).
3. Waktu Listening = jumlah durasi audio + 120 detik (menjawab "audio < 30 menit").
4. Komposisi Speaking: 4 + 1 + 4 pertanyaan; skor dikirim per part (3 pengiriman) dan band Speaking = `roundBand` rata-rata tiga part.
5. Aturan pembulatan Writing/Speaking/Overall = SATU aturan `roundBand` (x.25 naik, x.75 naik) dihitung dengan setengah-band bulat.
6. Status attempt: Speaking tidak menahan status `GRADED` attempt kecuali Speaking satu-satunya section; kedaluwarsa dievaluasi malas (saat ada permintaan), bukan oleh pewaktu latar.
7. Endpoint tambahan di luar draf lama: `GET .../sections/{section}` (isi section), `POST .../abandon`; kode error baru `SECTION_NOT_SUBMITTABLE`.
8. Simulasi tidak memberi poin/streak; tampil di Riwayat Ujian.
9. Migrasi `0010` dan kolom `section_name` dibatalkan (digantikan `0002` SPEC-022 dan kolom `skill`).

## Human Approval
- [x] Disetujui human (2026-11-08) — substansi produk
- [ ] Konfirmasi human atas revisi teknis 2026-11-08 (butir "Keputusan Analyst")

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
| 2026-11-08 | Human | Draf disetujui apa adanya (build-feature, depth standard) |
| 2026-11-08 | Analyst | Revisi teknis menyelaraskan SPEC-025/ADR-005 (niat produk tidak diubah): hapus rujukan admin ("dapat diedit admin" -> `band:import`), migrasi Postgres `0008`/`0010` dan tipe Postgres (perubahan skema dipusatkan di `0002` SPEC-022, tanpa migrasi baru di sini); `Depends on` ditambah SPEC-022/024/025; aturan pembulatan SATU (`roundBand`, aritmetika setengah-band) untuk Writing/Speaking/Overall (D4); batas lingkup saat konten Reading/Listening 40 soal belum ada (D10, AC bertanda [F] vs [C], fixture sintetis); perakitan terinci (D3), waktu Listening = jumlah audio + 120 s, komposisi Speaking 4+1+4; status attempt/section (D6), pemulihan dan kedaluwarsa malas (D7), Writing kosong/LLM mati (D8), skema `state` `mock.v1` (D9); API Contract penuh (8 endpoint, kode error `SIMULATION_*`, `SECTION_NOT_SUBMITTABLE`); AC diperluas dari 7 ke 22 (AC-1..AC-7 asli dipertahankan nomornya); tambah Status Implementasi dan "Keputusan Analyst" |
