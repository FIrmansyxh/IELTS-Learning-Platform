# SPEC-006: Mesin Soal Multi-Format & Active Drill (ASM-01, MAT-04)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-001, SPEC-003, SPEC-004, SPEC-005
- **Prioritas:** P0
- **Cakupan:** Backend (siklus attempt, penilaian, DTO tanpa kunci) + Frontend (komponen soal, Active Drill, kerangka ujian)

## User Story
Sebagai Learner, saya ingin mengerjakan Active Drill 10 soal berwaktu dengan 10 tipe soal objektif, melihat umpan balik dan pembahasan berbahasa Indonesia setiap kali menjawab, lalu melihat skor akhir dan apakah saya lulus (>= 75%), sehingga saya tahu apakah sudah menguasai sub-modul dan dapat melanjutkan ke sub-modul berikutnya.

## Non-Goals / Out of Scope
- Tidak mengimplementasikan Skip Test (SPEC-008), Boss Stage (SPEC-014), Placement (SPEC-015); spec ini membangun mesin attempt generik yang dipakai mereka, tetapi `POST /attempts` hanya MENGAKTIFKAN tipe `ACTIVE_DRILL`. Tipe lain mengembalikan `409 ASSESSMENT_TYPE_NOT_ENABLED` sampai spec masing-masing mendaftarkan handler.
- Tidak mengimplementasikan editor Writing, perekam Speaking, penilaian AI (SPEC-012/013). Soal `WRITING_TASK`/`SPEAKING_TASK` hanya dirender sebagai slot dan dikecualikan dari skor.
- Tidak mengimplementasikan Split-Screen Reading (SPEC-010) dan pemutar Listening terkunci (SPEC-011), walau DTO attempt sudah membawa `passage_markdown` dan `listening`.
- Tidak menghitung poin, mahkota, streak (SPEC-016); spec ini hanya menyimpan data dasar (`time_spent_ms`, `within_target_time`, `speed_streak_len`) dan memanggil hook.
- Tidak ada "kunci jawaban" pada payload mana pun yang dikirim sebelum soal dijawab (mode Latihan) atau sebelum attempt selesai (mode Ujian).
- Tidak ada penghitungan skor di klien; klien tidak mengirim `is_correct`, `score`, `passed`, `points`.
- Tidak ada penghentian paksa Active Drill saat waktu habis (timer Drill bersifat panduan).
- Tidak ada pause/resume waktu pada mode Ujian.

## Definisi Tetap
**D1. Mode.** `ACTIVE_DRILL` -> `mode='PRACTICE'`; semua tipe lain -> `mode='EXAM'`. Mode tidak dipilih klien.

**D2. Deadline.** `PRACTICE`: `deadline_at = NULL` (timer hanya tampilan). `EXAM`: `deadline_at = started_at + time_limit_seconds` (untuk Boss lihat SPEC-014). Toleransi `grace = 5 detik`: jawaban/submit diterima bila `now() <= deadline_at + 5 s`.

**D3. Kadaluarsa.** Attempt `EXAM` `IN_PROGRESS` dengan `now() > deadline_at + 5 s` dianggap `EXPIRED`: pada permintaan berikutnya yang menyentuhnya (start, answer, submit, get), server menilai jawaban tersimpan, menetapkan `status='EXPIRED'`, `submitted_at = deadline_at`, menjalankan handler tipe (gerbang) seperti submit biasa, lalu merespons `409 ATTEMPT_EXPIRED` untuk answer/submit. Attempt `PRACTICE` yang `updated_at` > 24 jam lalu menjadi `ABANDONED` saat `POST /attempts` berikutnya pada set sama.

**D4. Pemilihan soal.** `ACTIVE_DRILL`: bila `question_count > app_settings['drill.question_count']` (default 10), ambil subset acak sebanyak itu (PRNG kuat SHA-256 mode penghitung diseed dari seed rahasia 128-bit CSPRNG yang disimpan di `attempts.state.rng_seed`, TIDAK diturunkan dari `attempt.id`; amandemen F-06-01); jika tidak, semua soal. Urutan soal diacak (PRNG sama) KECUALI set punya `reading_passage_markdown` atau `listening_asset_id` (urutan asli dipertahankan). Urutan, subset, dan semua pemetaan acak disimpan di `attempts.state` sehingga resume identik.

**D5. Pengacakan & ID opak.** Untuk `MCQ_SINGLE`/`MCQ_MULTI`: opsi diacak; tiap opsi diberi `option_id` = `o` + 6 karakter acak base36 (CSPRNG), pemetaan `option_id -> indeks asli` disimpan di `state.served[question_id]`. `TFNG`/`YNNG`: urutan tetap. `MATCHING_*`: daftar `right` diacak, `choice_id` = `c` + 6 karakter acak; `item_id` = `i<indeks left>`. `SENTENCE_REORDER`: `segments` diacak (jika hasil acak sama dengan urutan benar, acak ulang maksimal 5 kali), `segment_id` = `s` + 6 karakter acak. `ERROR_RECOGNITION`: `tokens` tidak diacak, `index` = posisi.

**D6. Normalisasi jawaban teks.** `normalize(s)`: NFKC -> trim -> ganti urutan spasi/tab/newline dengan satu spasi -> `toLowerCase()` -> hapus satu atau lebih karakter `. , ; ! ?` di akhir. Jawaban benar bila `normalize(response.text)` sama persis dengan `normalize(varian)` untuk salah satu varian `correct_answers`. Jumlah kata = banyaknya token hasil pemisahan spasi pada teks ternormalisasi; bila `max_words` ada dan jumlah kata melebihi, jawaban SALAH (tersimpan apa adanya).

**D7. Skor per soal** (`points` = nilai soal):
| Tipe | Aturan |
|---|---|
| `MCQ_SINGLE`, `TFNG`, `YNNG` | benar bila pilihan = jawaban benar -> `points`, selain itu 0 |
| `MCQ_MULTI` | benar bila HIMPUNAN `option_ids` terpilih sama persis dengan himpunan jawaban benar -> `points`, selain itu 0 |
| `FILL_IN_BLANK`, `SHORT_ANSWER` | D6 -> `points` atau 0 |
| `MATCHING_DROPDOWN`, `MATCHING_DRAG` | kredit parsial: `round_half_up(points * pasangan_benar / jumlah_left, 2)`; `is_correct=true` hanya bila semua benar; item tanpa pasangan dianggap salah |
| `SENTENCE_REORDER` | benar bila urutan `segment_ids` memetakan ke urutan asli persis |
| `ERROR_RECOGNITION` | benar bila HIMPUNAN `token_indexes` sama persis dengan `correct_answers` |
| `WRITING_TASK`, `SPEAKING_TASK` | `is_correct = NULL`, `score = 0`, DIKECUALIKAN dari `max_score`/`raw_score` |
`raw_score` = jumlah `score` soal objektif; `max_score` = jumlah `points` soal objektif yang disajikan. `score_percent = round_half_up(raw_score * 100 / max_score, 2)`; bila `max_score = 0`: `score_percent = 0.00`, `passed = false`. Lulus: `raw_score * 100 >= pass_percent * max_score` dihitung dalam bilangan bulat per-sentesimal (tanpa float). `pass_percent = assessment_sets.pass_percent` bila tidak NULL, selain itu `sub_modules.passing_score_percent`.

**D8. Waktu jawaban.** `time_spent_ms = answered_at - max(answered_at jawaban sebelumnya pada attempt, state.last_resume_at, started_at)`; `state.last_resume_at` hanya digeser oleh `POST /attempts` (resume) bila jeda sejak aktivitas terakhir > 60 detik, dan `GET /attempts/{id}` bebas efek samping (amandemen F-06-02) (selisih jam server, bukan klaim klien). `within_target_time = time_spent_ms <= (question.target_time_ms ?? app_settings['speed.default_target_ms'])`. `speed_streak_len` = (`is_correct` DAN `within_target_time`) ? panjang streak jawaban sebelumnya menurut `answered_at` + 1 : 0. Amandemen F-08-06 (SPEC-016): bila `state.last_resume_at` lebih baru daripada `max(answered_at jawaban sebelumnya, started_at)` (basis digeser resume), `time_spent_ms` tetap dihitung seperti di atas tetapi `within_target_time = false` dan `speed_streak_len = 0` sehingga bonus kecepatan tidak dapat direset klien. Pada mode `EXAM` yang mengizinkan jawab-ulang, nilai ini dihitung ulang urut `answered_at` saat submit. Boss (`TIER_BOSS_EXAM`) dikecualikan dari hitung ulang ini (F-14-06).

**D9. Keluaran kunci (WAJIB).** DTO publik dibangun dengan allow-list (di bawah). `correct_answers`, `explanation_id`, `matching.correct_answers`, urutan asli `segments` TIDAK pernah ada di payload sampai: (a) mode `PRACTICE`: setelah jawaban soal itu diterima (hanya soal itu, lewat `feedback`); (b) selesai attempt: `review` sesuai D10. Respons attempt `Cache-Control: private, no-store`.

**D10. Kebijakan review.** `PRACTICE`: `review[]` memuat `correct_answer.display` dan `explanation_id` seluruh soal. `EXAM`: `review[]` hanya memuat `is_correct`, `score`, `max_score`, `response` (tanpa jawaban benar dan tanpa pembahasan).

**D11. Idempotensi.** `PUT answers` = UPSERT pada `(attempt_id, question_id)`. Mode `PRACTICE`: jawaban pertama dikunci setelah umpan balik; permintaan ulang dengan `response` identik -> 200 dan `feedback` identik; `response` berbeda -> 409 `QUESTION_ALREADY_ANSWERED`. Mode `EXAM`: boleh diganti sampai submit/deadline. `submit` pada attempt yang sudah `GRADED`/`EXPIRED`/`SUBMITTED` mengembalikan hasil yang sama (200) tanpa efek ganda.

## Technical Flow
1. Learner menekan "Mulai Latihan"; klien memanggil `POST /api/v1/attempts` dengan `assessment_set_id`.
2. Server memuat set `PUBLISHED`, memeriksa aksesibilitas sub-modul (`assertSubModuleAccessible`) dan `learn_completed_at`, mencari attempt `IN_PROGRESS` untuk `(user, set)`: bila ada, mengembalikannya (`resumed=true`, status 200); bila tidak, membuat attempt baru (status 201) dengan `assessment_version = set.version`, `state` (D4, D5), `mode` (D1), `deadline_at` (D2).
3. Klien menampilkan soal satu per satu dari `questions`, dimulai di `current_index`.
4. Pada tiap "Periksa", klien memanggil `PUT /api/v1/attempts/{attempt_id}/answers/{question_id}` dengan `response`.
5. Server memvalidasi bentuk `response` terhadap soal yang DISAJIKAN, menilai (D6/D7), menghitung D8, melakukan UPSERT `attempt_answers`, dan mengembalikan `feedback` (PRACTICE) atau `null` (EXAM).
6. Klien menampilkan panel umpan balik (benar/salah, jawaban benar, pembahasan) dan tombol "Lanjut".
7. Pada soal terakhir klien memanggil `POST /api/v1/attempts/{attempt_id}/submit`.
8. Server, dalam satu transaksi dengan `SELECT ... FOR UPDATE` pada baris attempt: menilai soal tak terjawab sebagai salah (`attempt_answers` tidak dibuat untuk soal kosong; `review[].is_correct=false`), menghitung ulang D8 bila `EXAM`, mengisi `raw_score`, `max_score`, `score_percent`, `passed`, `status='GRADED'`, `submitted_at`; memanggil handler tipe (untuk `ACTIVE_DRILL`: `GatekeepingService.applyDrillResult`); memanggil `attemptCompletedHooks` berurutan (SPEC-016, SPEC-017 bila terdaftar); lalu mengembalikan `AttemptResultDTO`.
9. Klien menampilkan hasil: skor, ambang 75%, status lulus/gagal, sub-modul terbuka (`progress.unlocked`), tombol "Sub-Modul Berikutnya" (lulus) atau "Ulangi Latihan" dan "Tinjau Materi" (gagal).

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/attempts.ts`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `CSRF_ORIGIN_MISMATCH`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`. Semua endpoint: **Auth: user**. Attempt milik user lain atau tidak ada -> 404 `NOT_FOUND` (tidak pernah 403).

**`QuestionPublicDTO`** (allow-list; tipe Zod `QuestionPublicSchema`):
| Field | Tipe | Nullable | Ada untuk |
|---|---|---|---|
| `question_id` | string | tidak | semua |
| `question_type` | enum 12 nilai | tidak | semua |
| `skill` | `SkillCategory` | tidak | semua |
| `prompt` | string | tidak | semua |
| `points` | int | tidak | semua |
| `target_time_ms` | int | ya | semua |
| `passage_no` | int 1-3 | ya | soal pada set bacaan |
| `section_no` | int 1-4 | ya | soal Listening |
| `options` | `[{option_id: string, text: string}]` | ya (null selain tipe ini) | `MCQ_SINGLE`, `MCQ_MULTI` |
| `choose_count` | int | ya | `MCQ_MULTI` (= jumlah jawaban benar) |
| `fixed_choices` | `string[]` | ya | `TFNG` (`["True","False","Not Given"]`), `YNNG` (`["Yes","No","Not Given"]`) |
| `max_words` | int | ya | `FILL_IN_BLANK`, `SHORT_ANSWER` |
| `matching` | `{left: [{item_id,text}], right: [{choice_id,text}], allow_reuse: boolean}` | ya | `MATCHING_*` |
| `segments` | `[{segment_id, text}]` | ya | `SENTENCE_REORDER` |
| `tokens` | `[{index: int, text: string}]` | ya | `ERROR_RECOGNITION` |
| `ai_task` | `{ kind: "WRITING"\|"SPEAKING", task_kind?: "TASK1"\|"TASK2", min_words?: int, time_limit_minutes?: int, part?: 1\|2\|3, prep_seconds?: int, record_seconds?: int, cue_points?: string[], stimulus_url?: string } ` | ya | `WRITING_TASK`, `SPEAKING_TASK` |

**Bentuk `response` per tipe** (`z.strictObject`; `AnswerResponseSchema` = diskriminasi berdasarkan `question_type` soal):
| Tipe | `response` | Validasi |
|---|---|---|
| `MCQ_SINGLE` | `{ "option_ids": ["k7f2q1"] }` | tepat 1 id milik soal ini |
| `MCQ_MULTI` | `{ "option_ids": ["a1b2c3","d4e5f6"] }` | 1..jumlah opsi id unik milik soal |
| `TFNG`, `YNNG` | `{ "choice": "Not Given" }` | salah satu `fixed_choices` |
| `FILL_IN_BLANK`, `SHORT_ANSWER` | `{ "text": "are sorted" }` | 1-200 karakter setelah trim |
| `MATCHING_DROPDOWN`, `MATCHING_DRAG` | `{ "pairs": [{"item_id":"i0","choice_id":"c8x2m1"}] }` | 1..jumlah `left`; `item_id`/`choice_id` valid; `item_id` unik; `choice_id` unik bila `allow_reuse=false` |
| `SENTENCE_REORDER` | `{ "segment_ids": ["s1","s2","s3"] }` | permutasi lengkap semua `segment_id` |
| `ERROR_RECOGNITION` | `{ "token_indexes": [3] }` | 1-3 indeks unik dalam rentang |
| `WRITING_TASK`, `SPEAKING_TASK` | tidak diterima | 409 `QUESTION_REQUIRES_SUBMISSION` |

**`AttemptDTO`:**
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `id` | uuid | tidak | |
| `assessment_set_id` | uuid | tidak | |
| `assessment_type` | enum `assessment_type` | tidak | |
| `mode` | `"PRACTICE"` \| `"EXAM"` | tidak | D1 |
| `status` | enum `attempt_status` | tidak | |
| `title` | string | tidak | judul set |
| `started_at`, `server_now` | ISO-8601 | tidak | |
| `deadline_at` | ISO-8601 | ya | D2 |
| `remaining_seconds` | int | ya | `max(0, ceil(deadline_at - server_now))`; null bila tanpa deadline |
| `time_limit_seconds` | int | tidak | dari set |
| `pass_percent` | int | ya | untuk tipe bergerbang persen; null bila tidak relevan |
| `question_count` | int | tidak | jumlah soal yang disajikan |
| `answered_count` | int | tidak | |
| `current_index` | int | tidak | indeks (0-based pada `questions`) soal tak terjawab pertama; = `question_count` bila semua terjawab |
| `passage_markdown` | string | ya | `reading_passage_markdown` set (SPEC-010) |
| `listening` | `{audio_url: string, mime_type: string, duration_sec: int}` | ya | bila set punya audio (SPEC-011) |
| `questions` | `QuestionPublicDTO[]` | tidak | urutan `state.order`; `[]` bila attempt sudah selesai |
| `answers` | `[{question_id, response, feedback: FeedbackDTO\|null}]` | tidak | jawaban tersimpan; `feedback` hanya `PRACTICE` |
| `resumed` | boolean | tidak | true bila attempt sudah ada sebelumnya |
| `sections` | array atau null | ya | hanya Boss (SPEC-014) |

**`FeedbackDTO`:** `{ "is_correct": boolean, "score": number, "max_score": number, "correct_answer": { "display": string[] }, "explanation_id": string }`. `correct_answer.display`: MCQ = teks opsi benar; TFNG/YNNG = nilai; FILL/SHORT = semua varian (varian pertama = utama); MATCHING = `"<left> -> <right>"` per butir; REORDER = satu kalimat; ERROR_RECOGNITION = teks token salah.

### POST /api/v1/attempts
- **Success status:** 201 (attempt baru) atau 200 (attempt `IN_PROGRESS` ditemukan, `resumed=true`)
- **Zod:** `StartAttemptRequestSchema`
- **Rate limit:** `attempt_start` (30/jam/user)

| Field | Type | Required | Constraint |
|---|---|---|---|
| `assessment_set_id` | uuid | ya | set `PUBLISHED` |
```json
{ "assessment_set_id": "e5f6a7b8-0001-4000-8000-0000000000d1" }
```
**Response (Success) 201:**
```json
{ "data": { "id": "9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a", "assessment_set_id": "e5f6a7b8-0001-4000-8000-0000000000d1", "assessment_type": "ACTIVE_DRILL", "mode": "PRACTICE", "status": "IN_PROGRESS", "title": "Latihan 2.1.3 Passive Voice", "started_at": "2026-11-03T10:30:00.000Z", "server_now": "2026-11-03T10:30:00.000Z", "deadline_at": null, "remaining_seconds": null, "time_limit_seconds": 300, "pass_percent": 75, "question_count": 10, "answered_count": 0, "current_index": 0, "passage_markdown": null, "listening": null,
  "questions": [
    { "question_id": "Q-213-02", "question_type": "MCQ_SINGLE", "skill": "GRAMMAR", "prompt": "Manakah kalimat yang paling tepat untuk laporan akademik IELTS Writing Task 1?", "points": 1, "target_time_ms": 30000, "passage_no": null, "section_no": null,
      "options": [ { "option_id": "ok7f2q", "text": "The coffee beans are ground in a mechanical grinder." }, { "option_id": "o3x9aw", "text": "People grind the coffee beans in a machine." }, { "option_id": "oh2m5d", "text": "Someone has grinded the coffee beans." }, { "option_id": "o8c1zp", "text": "The coffee beans is grinded in a machine." } ],
      "choose_count": null, "fixed_choices": null, "max_words": null, "matching": null, "segments": null, "tokens": null, "ai_task": null },
    { "question_id": "Q-213-01", "question_type": "FILL_IN_BLANK", "skill": "GRAMMAR", "prompt": "Lengkapi: 'Once the plastic bottles are collected, they _______ (sort) by color.'", "points": 1, "target_time_ms": null, "passage_no": null, "section_no": null,
      "options": null, "choose_count": null, "fixed_choices": null, "max_words": 2, "matching": null, "segments": null, "tokens": null, "ai_task": null } ],
  "answers": [], "resumed": false, "sections": null } }
```
(Contoh dipotong: respons nyata memuat 10 soal.)
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | `assessment_set_id` bukan uuid |
| 403 | LOCKED_CONTENT | Sub-modul pemilik set `LOCKED` |
| 404 | NOT_FOUND | Set tidak ada, bukan `PUBLISHED`, atau sub-modul bukan `AVAILABLE` |
| 409 | LEARN_NOT_COMPLETED | Tipe `ACTIVE_DRILL` dan `learn_completed_at IS NULL`. Pesan: "Selesaikan materi terlebih dahulu." |
| 409 | ASSESSMENT_TYPE_NOT_ENABLED | Tipe set belum punya handler terdaftar |
| 409 | SECTION_NOT_STARTABLE | Tipe `BOSS_SECTION` (hanya lewat Boss induk) |
| 429 | RATE_LIMITED | Bucket `attempt_start` |

### GET /api/v1/attempts/{attempt_id}
- **Success status:** 200 | **Response:** `{ "data": <AttemptDTO> }` (resume; `resumed=true`). Attempt yang sudah selesai: `status` bukan `IN_PROGRESS`, `questions=[]`, klien mengalihkan ke hasil.
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Tidak ada atau bukan milik user |

### PUT /api/v1/attempts/{attempt_id}/answers/{question_id}
- **Success status:** 200 | **Zod:** `SubmitAnswerRequestSchema` | **Rate limit:** `answer_submit` (60/menit/user)

| Field | Type | Required | Constraint |
|---|---|---|---|
| `response` | object | ya | sesuai tabel "Bentuk `response`" untuk tipe soal; field tak dikenal ditolak |
```json
{ "response": { "option_ids": ["ok7f2q"] } }
```
**Response (Success) 200 (PRACTICE):**
```json
{ "data": { "question_id": "Q-213-02", "saved": true, "answered_count": 1,
  "feedback": { "is_correct": true, "score": 1, "max_score": 1, "correct_answer": { "display": ["The coffee beans are ground in a mechanical grinder."] }, "explanation_id": "Bentuk V3 dari 'grind' adalah 'ground', dan subjek jamak membutuhkan 'are'." },
  "next_question": null } }
```
Mode `EXAM`: `feedback = null`. `next_question`: selalu `null` kecuali Placement (SPEC-015).
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Bentuk `response` salah. `details[].code`: `response_shape_invalid`, `unknown_option_id`, `unknown_item_id`, `unknown_choice_id`, `duplicate_ids`, `incomplete_permutation`, `index_out_of_range`, `empty_answer`, `unrecognized_key` |
| 404 | NOT_FOUND | Attempt tidak ada/bukan milik user, atau `question_id` tidak termasuk soal yang disajikan pada attempt ini |
| 409 | ATTEMPT_NOT_ACTIVE | Status bukan `IN_PROGRESS` (`GRADED`, `EXPIRED`, `ABANDONED`, `SUBMITTED`) |
| 409 | ATTEMPT_EXPIRED | `EXAM` dan `now() > deadline_at + 5 s` (sebagai efek samping attempt dinilai/`EXPIRED`) |
| 409 | QUESTION_ALREADY_ANSWERED | `PRACTICE`, soal sudah dijawab dengan `response` berbeda |
| 409 | QUESTION_REQUIRES_SUBMISSION | Soal `WRITING_TASK`/`SPEAKING_TASK` |
| 429 | RATE_LIMITED | Bucket `answer_submit` |

### POST /api/v1/attempts/{attempt_id}/submit
- **Success status:** 200 | **Request body:** tidak ada
**Response (Success) 200** (`AttemptResultDTO`; `PRACTICE`):
```json
{ "data": {
  "attempt": { "id": "9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a", "assessment_set_id": "e5f6a7b8-0001-4000-8000-0000000000d1", "assessment_type": "ACTIVE_DRILL", "mode": "PRACTICE", "status": "GRADED", "started_at": "2026-11-03T10:30:00.000Z", "submitted_at": "2026-11-03T10:34:12.000Z", "raw_score": 8, "max_score": 10, "score_percent": 80.0, "pass_percent": 75, "passed": true, "points_awarded": 0, "band_score": null },
  "per_skill": [ { "skill": "GRAMMAR", "raw_score": 8, "max_score": 10, "score_percent": 80.0 } ],
  "review": [ { "question_id": "Q-213-02", "is_correct": true, "score": 1, "max_score": 1, "response": { "option_ids": ["ok7f2q"] }, "correct_answer": { "display": ["The coffee beans are ground in a mechanical grinder."] }, "explanation_id": "Bentuk V3 dari 'grind' adalah 'ground'..." } ],
  "progress": { "sub_module_id": "7a1b2c3d-0213-4000-8000-000000000213", "status": "COMPLETED", "mastery_crown": "NONE", "best_score_percent": 80, "next_sub_module_code": "2.1.4", "unlocked": [ { "kind": "SUB_MODULE", "id": "7a1b2c3d-0214-4000-8000-000000000214", "label": "2.1.4 Conditional Sentences" } ] },
  "skip": null, "boss": null, "placement": null, "gamification": null } }
```
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `attempt.points_awarded` | int | tidak | 0 sampai SPEC-016 aktif |
| `attempt.band_score` | number | ya | hanya Boss (SPEC-014) |
| `attempt.passed` | boolean | ya | null bila tipe tidak punya ambang persen |
| `review` | array | ya | D10; null bila kebijakan menyembunyikan seluruhnya |
| `review[].correct_answer`, `explanation_id` | object / string | ya | hanya `PRACTICE` |
| `progress` | object | ya | null bila set tidak terkait sub-modul |
| `skip`, `boss`, `placement` | object | ya | diisi SPEC-008, 014, 015 |
| `gamification` | object | ya | diisi SPEC-016 (null sebelum aktif dan untuk tipe selain `ACTIVE_DRILL`/`TIER_BOSS_EXAM`) |
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Attempt tidak ada/bukan milik user |
| 409 | ATTEMPT_EXPIRED | `EXAM` melewati `deadline_at + 5 s` (hasil tersedia lewat `GET .../result`) |
| 409 | ATTEMPT_NOT_ACTIVE | Status `ABANDONED` |
Memanggil `submit` pada attempt `GRADED`/`SUBMITTED` -> 200 dengan hasil yang sama (idempoten).

### GET /api/v1/attempts/{attempt_id}/result
- **Success status:** 200 | **Response:** `{ "data": <AttemptResultDTO> }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Tidak ada/bukan milik user |
| 409 | ATTEMPT_NOT_FINISHED | Status `IN_PROGRESS` |

## Database Changes
Tidak ada tabel/kolom baru. Memakai `attempts`, `attempt_answers`, `attempt_sections` (SPEC-014), `assessment_sets`. Isi `attempts.state` (jsonb, `v: 1`):
```json
{ "v": 1, "order": ["Q-213-02", "Q-213-01"], "last_resume_at": "2026-11-03T10:30:00.000Z",
  "served": { "Q-213-02": { "option_ids": ["ok7f2q", "o3x9aw", "oh2m5d", "o8c1zp"], "option_orig_index": [1, 0, 3, 2] } } }
```
`served[qid]` menyimpan pemetaan acak per tipe (`option_ids` + `option_orig_index`, `right_choice_ids` + `right_orig_index`, `segment_ids` + `segment_orig_index`). `attempts.assessment_version` = `assessment_sets.version` saat mulai. Seed `app_settings`: `drill.question_count` = 10, `speed.default_target_ms` = 20000. Daftar hook: `attemptCompletedHooks: Array<(ctx: { tx, userId, attempt, set, result }) => Promise<void>>` di `src/server/attempts/hooks.ts`; registri handler tipe: `assessmentTypeHandlers: Record<AssessmentType, { start, onFinish }>` di `src/server/attempts/handlers.ts`.

## UI/UX
Rujukan: `design-system.md` 5.12 Kuis/Mesin Soal, 5.19 Mode Ujian, 5.1 Button, 5.3 Card, 5.7 Progress/Toast/Tabs, 6 Interaction & Motion, 8.4 wireframe Soal Active Drill.

**Komponen aplikasi (baru):** `QuestionShell` (nomor "Soal 4 dari 10", Progress tipis, timer, area soal, bar aksi bawah), `QuestionRenderer` (memilih renderer per tipe), `FeedbackPanel`, `ActiveDrill`, `DrillResult`, `ExamShell` (dipakai SPEC-008/014/015), `QuestionNavigatorGrid`, `AiTaskSlot`.

- **Renderer per tipe:** `MCQ_SINGLE`/`MCQ_MULTI`: kartu radio/checkbox min 56px, huruf A-D di kiri (huruf = posisi tampil), `MCQ_MULTI` berteks "Pilih {choose_count} jawaban"; `TFNG`/`YNNG`: tiga tombol segmented sama lebar dengan Tooltip Indonesia ("Not Given = informasi tidak disebutkan dalam teks"); `FILL_IN_BLANK`/`SHORT_ANSWER`: input dengan helper "Maksimal {max_words} kata dan/atau angka", penghitung kata live, error `role="alert"` bila melebihi (tombol Periksa tetap aktif; jawaban dinilai salah oleh server); `MATCHING_*`: toggle antara drag `@dnd-kit` (ambang drag 8px, pengumuman `aria-live`) dan dropdown `<select>` per butir; mobile (< 768px) default dropdown; `SENTENCE_REORDER`: daftar dapat diurut dengan drag handle + tombol "Naik"/"Turun" (keyboard); `ERROR_RECOGNITION`: ketuk token (garis bawah bergelombang + ikon `AlertTriangle` + teks "Ditandai"); `WRITING_TASK`/`SPEAKING_TASK`: `AiTaskSlot` kartu "Tugas dinilai AI. Kerjakan di Tab Terapkan." tanpa blokir tombol Lanjut.
- **Active Drill:** layar pembuka (judul, "10 soal - 5 menit - lulus 75%", Button primary "Mulai"); per soal: Button "Periksa" (disabled sampai ada jawaban; loading "Memeriksa...") lalu "Lanjut"; `FeedbackPanel` slide-up 200 ms (`role="status"`, `aria-live="polite"`): benar = latar `success` subtle + ikon `CheckCircle2` + "Benar!"; salah = latar `error` subtle + ikon `XCircle` + "Kurang tepat" + jawaban benar + pembahasan. Timer per soal menghitung naik dari 0 dan berubah ke warna warning setelah melewati `target_time_ms` (atau 20 dtk); timer total hitung mundur `time_limit_seconds` bersifat panduan: pada 0 tampil Toast "Waktu latihan habis. Anda tetap dapat menyelesaikan." tanpa menghentikan. Pintasan: `Enter` Periksa/Lanjut, `1-4`/`A-D` pilih opsi (dapat dimatikan di `/profil`).
- **`DrillResult`:** skor persen besar, ambang 75% ditandai garis, status "Lulus"/"Belum lulus" (ikon + teks), daftar "Terbuka: ..." dari `progress.unlocked`, mahkota dari SPEC-016 (placeholder tersembunyi bila `points_awarded=0` dan `mastery_crown='NONE'`). Gagal: pesan suportif "Belum lulus. Coba ulangi setelah meninjau materi." + Button primary "Ulangi Latihan", sekunder "Tinjau Materi" (ke tab Pelajari). Daftar tinjauan soal (benar/salah + pembahasan) dalam Accordion.
- **`ExamShell`** (Mode Ujian): tema tenang tanpa navigasi global/gamifikasi; header tipis (judul, timer hitung mundur dengan `aria-live` hanya pada tonggak 10/5/1 menit, Button "Akhiri"); `QuestionNavigatorGrid` (Sheet di mobile) dengan ikon terjawab/ditandai/kosong; `beforeunload` + Dialog "Keluar dari ujian? Jawaban tersimpan, waktu terus berjalan."; Dialog konfirmasi "Akhiri ujian?" menampilkan jumlah soal belum dijawab.
- **State:** loading = Skeleton kerangka soal (tanpa CLS); kesalahan jaringan saat `PUT` = Toast error "Jawaban belum tersimpan. Coba lagi." dengan Button "Coba lagi" (tidak maju); `409 ATTEMPT_EXPIRED` = Dialog "Waktu habis" lalu ke hasil; refresh halaman memuat ulang via `GET /attempts/{id}` pada soal `current_index`.
- Aksesibilitas: grup soal `fieldset/legend`; tombol ikon `aria-label`; konten Inggris `lang="en"`; fokus ke kepala soal pada setiap pindah soal.
- Rute: drill di `/belajar/[sub_module_code]?tab=latihan&attempt={uuid}`; ujian di `/ujian/mulai/[assessment_set_id]` (pra-ujian), `/ujian/[attempt_id]` (berjalan), `/ujian/[attempt_id]/hasil` (hasil).

## Acceptance Criteria
- [ ] **Given** sub-modul dengan `learn_completed_at` terisi dan set drill 10 soal **When** `POST /attempts` **Then** 201, `mode="PRACTICE"`, `deadline_at=null`, `questions.length=10`, `current_index=0`, dan satu baris `attempts` `IN_PROGRESS`.
- [ ] **Given** `learn_completed_at IS NULL` **When** `POST /attempts` **Then** 409 `LEARN_NOT_COMPLETED`, tidak ada baris `attempts`.
- [ ] **Given** attempt `IN_PROGRESS` untuk set yang sama **When** `POST /attempts` lagi **Then** 200, `resumed=true`, `id` sama, urutan soal dan `option_id` identik dengan respons pertama.
- [ ] **Given** set bertipe `SKIP_MODULE_TEST` **When** `POST /attempts` (sebelum SPEC-008) **Then** 409 `ASSESSMENT_TYPE_NOT_ENABLED`; set `BOSS_SECTION` -> 409 `SECTION_NOT_STARTABLE`.
- [ ] **Given** payload `POST /attempts` dan `GET /attempts/{id}` **When** di-serialisasi ke JSON dan dicari kunci `correct_answers`, `explanation_id`, `correct`, `answer`, `accepted` **Then** TIDAK ditemukan (uji serializer terhadap fixture 12 tipe soal) kecuali di dalam `feedback`/`review` yang diizinkan D9.
- [ ] **Given** dua attempt berbeda pada set yang sama **When** dibandingkan **Then** urutan soal dan `option_id` berbeda (peluang acak; uji statistik 20 attempt: >= 15 urutan berbeda).
- [ ] **Given** soal `MCQ_SINGLE` **When** `PUT` jawaban benar **Then** 200, `feedback.is_correct=true`, `score=1`, `explanation_id` terisi, baris `attempt_answers` dibuat dengan `is_correct=true`.
- [ ] **Given** `PUT` dengan `{"response":{"option_ids":["x"]},"is_correct":true}` **When** dikirim **Then** 400 `VALIDATION_ERROR` `unrecognized_key` dan tidak ada baris dibuat.
- [ ] **Given** jawaban `FILL_IN_BLANK` `"  Are   Sorted. "` dan `correct_answers=["are sorted"]` **When** dinilai **Then** benar (D6); jawaban `"were sorted"` salah; jawaban `"are sorted quickly"` dengan `max_words=2` salah.
- [ ] **Given** `MATCHING_DROPDOWN` 4 butir dengan 3 pasangan benar **When** dinilai dengan `points=4` **Then** `score=3.00`, `is_correct=false`.
- [ ] **Given** `MCQ_MULTI` dengan jawaban benar {A,C} **When** dijawab {A} **Then** `score=0`; dijawab {A,C} -> `points`; dijawab {A,C,D} -> 0.
- [ ] **Given** `SENTENCE_REORDER` **When** dijawab urutan benar **Then** benar; urutan tertukar dua elemen salah.
- [ ] **Given** `ERROR_RECOGNITION` dengan `correct_answers=[3]` **When** `token_indexes=[3]` **Then** benar; `[2]` salah; `[3,4]` salah.
- [ ] **Given** soal `WRITING_TASK` **When** `PUT answers` **Then** 409 `QUESTION_REQUIRES_SUBMISSION`.
- [ ] **Given** `PRACTICE` soal sudah dijawab `A` **When** `PUT` dengan `A` lagi **Then** 200 dengan `feedback` sama; dengan `B` -> 409 `QUESTION_ALREADY_ANSWERED` dan baris jawaban tidak berubah.
- [ ] **Given** `question_id` bukan bagian attempt **When** `PUT` **Then** 404 `NOT_FOUND`; attempt milik user lain -> 404.
- [ ] **Given** 8 dari 10 soal benar (1 poin) dengan `pass_percent=75` **When** `submit` **Then** 200, `score_percent=80.0`, `passed=true`, sub-modul `COMPLETED`, `progress.unlocked` memuat sub-modul berikutnya, `status="GRADED"`.
- [ ] **Given** 7 benar dari 10 **When** `submit` **Then** `score_percent=70.0`, `passed=false`, sub-modul tidak `COMPLETED`, dan `best_score_percent` terbarui bila lebih tinggi.
- [ ] **Given** 3 dari 4 poin (75.00 persen persis) **When** `submit` **Then** `passed=true` (batas inklusif, aritmetika bilangan bulat); skor 74.99 -> `passed=false`.
- [ ] **Given** drill berisi 9 soal objektif + 1 `WRITING_TASK` **When** `submit` **Then** `max_score` = jumlah poin 9 soal objektif dan soal AI tidak masuk `raw_score`.
- [ ] **Given** `submit` dipanggil dua kali berturut-turut (termasuk 2 permintaan serentak) **When** diperiksa **Then** keduanya 200 dengan hasil identik, `attempts_count` hanya +1, dan hook dijalankan sekali.
- [ ] **Given** soal tak terjawab saat `submit` **When** dinilai **Then** dihitung salah dan `review[].is_correct=false`.
- [ ] **Given** jam server dimajukan 301 detik pada attempt `EXAM` dengan `time_limit_seconds=300` **When** `PUT answers` **Then** 409 `ATTEMPT_EXPIRED`, attempt `EXPIRED`, jawaban tersimpan sebelum deadline tetap dinilai.
- [ ] **Given** `EXAM` **When** `PUT answers` **Then** `feedback=null`; **When** `GET /attempts/{id}/result` sebelum selesai **Then** 409 `ATTEMPT_NOT_FINISHED`; setelah `submit`, `review[]` tidak memuat `correct_answer` maupun `explanation_id` (D10).
- [ ] **Given** dua jawaban benar berurutan dalam waktu di bawah `target_time_ms` **When** disimpan **Then** `speed_streak_len` = 1 lalu 2, `within_target_time=true`; jawaban salah mereset ke 0 (diuji dengan jam server terkendali).
- [ ] **Given** `time_spent_ms` dihitung **When** klien mengirim field `time_spent_ms` di body **Then** 400 `unrecognized_key` (klien tidak boleh mengirim).
- [ ] **Given** 61 `PUT answers` dalam satu menit **When** permintaan ke-61 **Then** 429 `RATE_LIMITED`.
- [ ] **Given** E2E negatif **When** user membuka set drill sub-modul `LOCKED` lewat `POST /attempts` **Then** 403 `LOCKED_CONTENT`.
- [ ] **Given** E2E Playwright (fixture 10 soal berisi tipe berbeda) **When** user menyelesaikan drill dengan 8 benar **Then** panel umpan balik tampil untuk setiap soal, `DrillResult` menunjukkan "Lulus", tombol "Sub-Modul Berikutnya" aktif; refresh di tengah drill melanjutkan di soal yang benar; pada 375x812 tidak ada scroll horizontal.
- [ ] **Given** keyboard saja **When** user mengerjakan satu soal MCQ, MATCHING (dropdown), dan REORDER (tombol Naik/Turun) **Then** semuanya dapat diselesaikan tanpa mouse.

## Edge Cases & Validation
- [ ] Set dengan satu soal saja: `question_count=1`, tetap berfungsi.
- [ ] Sub-modul memiliki dua set `ACTIVE_DRILL` `PUBLISHED` (data korup): server memakai set dengan `version` tertinggi lalu `id` terkecil dan mencatat `warn`.
- [ ] Set diedit/diarsipkan saat attempt berjalan: attempt memakai `questions_json` saat ini, `assessment_version` snapshot hanya untuk riwayat; admin dicegah menyunting set yang punya attempt `IN_PROGRESS` (SPEC-020).
- [ ] `response.text` hanya spasi: 400 `empty_answer`; `text` > 200 karakter: 400 `VALIDATION_ERROR` (`too_long`).
- [ ] Attempt `PRACTICE` > 24 jam tanpa aktivitas lalu `POST /attempts`: attempt lama `ABANDONED`, attempt baru dibuat (201).
- [ ] Pengguna menutup tab sebelum `submit`: attempt tetap `IN_PROGRESS`; `current_index` mengikuti jawaban tersimpan.
- [ ] Semua tulis ke `attempts`, `attempt_answers`, progres terjadi dalam satu transaksi per permintaan; kegagalan hook membatalkan seluruh `submit` (500 `INTERNAL_ERROR`, attempt tetap `IN_PROGRESS`).

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft |
| 2026-11-03 | Backend Engineer | Amandemen QA W2: D4 seed pengacakan = CSPRNG rahasia di `attempts.state.rng_seed` (F-06-01); D8 `GET /attempts/{id}` tanpa efek samping dan resume menggeser `last_resume_at` hanya bila jeda > 60 detik (F-06-02) |
| 2026-11-03 | Backend Engineer | Amandemen QA W8 (F-08-06, prasyarat SPEC-016): D8 `time_spent_ms` tidak berubah, tetapi `within_target_time` TIDAK dikreditkan (false) dan `speed_streak_len` = 0 bila `state.last_resume_at` menggeser basis melewati jawaban sebelumnya / awal attempt (resume setelah jeda > 60 dtk) sehingga bonus kecepatan bertumpu pada jam server dan tidak dapat direset klien (`answerTiming` di `attempts/engine.ts`). `finalize()` tidak lagi menghitung ulang D8 untuk `TIER_BOSS_EXAM` (F-14-06). Hasil `AttemptResultDTO.gamification` kini terisi (SPEC-016). |
