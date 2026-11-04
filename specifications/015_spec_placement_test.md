# SPEC-015: Placement Test Adaptif 25 Soal (CUR-04)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-003, SPEC-004, SPEC-006, SPEC-007, SPEC-008
- **Prioritas:** P1
- **Cakupan:** Backend (pemilihan soal adaptif, estimasi tier, penerapan) + Frontend (alur satu-soal, hasil, pilihan tier awal)

## User Story
Sebagai Learner baru yang sudah punya kemampuan bahasa Inggris, saya ingin mengikuti Placement Test adaptif 25 soal berwaktu dan mendapat rekomendasi Tier awal yang dapat saya terima atau turunkan, sehingga saya tidak perlu mengulang materi dasar yang sudah saya kuasai.

## Non-Goals / Out of Scope
- Tidak ada pengulangan Placement Test (satu kali per akun).
- Tidak memberi band estimasi dari Placement (tidak menulis `user_band_predictions`; prediksi band hanya dari SPEC-017).
- Tidak ada soal Writing/Speaking pada Placement (bank hanya soal objektif).
- Tidak ada pembahasan, kunci jawaban, atau kembali ke soal sebelumnya selama tes.
- Tidak membuka Tier lebih tinggi dari rekomendasi; learner hanya boleh memilih rekomendasi atau Tier lebih rendah.
- Tidak ada Placement bagi pengguna yang sudah memiliki progres (sub-modul `COMPLETED`/`SKIPPED`).
- Tidak ada konfigurasi algoritma oleh pengguna.

## Definisi Tetap
**D1. Ketersediaan** (`GET /placement.available=true`): `users.placement_completed_at IS NULL` DAN tidak ada sub-modul `COMPLETED`/`SKIPPED` milik pengguna DAN ada set `PLACEMENT_TEST` `PUBLISHED` (bila lebih dari satu: `version` tertinggi, lalu `id` terkecil) DAN pengguna belum punya attempt Placement selesai. `blocked_reason` (prioritas): `ALREADY_COMPLETED` (placement_completed_at terisi) -> `PROGRESS_EXISTS` -> `NO_PLACEMENT_PUBLISHED` -> `RESULT_PENDING_APPLY` (attempt selesai, belum diterapkan). **Amandemen 2026-11-03 (QA F-15-03):** `POST /attempts` Placement hanya menerima set terpilih D1 (set PUBLISHED lain -> 404) dan ditolak 409 `PLACEMENT_NOT_AVAILABLE` (`details[0].code = ATTEMPT_IN_PROGRESS`) bila pengguna punya attempt Placement `IN_PROGRESS` pada set lain; permintaan mulai Placement diserialkan per pengguna.
**D2. Jumlah soal.** `N = app_settings['placement.question_count']` (default 25). Soal disajikan SATU per satu; `AttemptDTO.question_count = N`.
**D3. Algoritma pemilihan (staircase).** Status: `d` (kesulitan target, awal 3), `served` (daftar soal tersaji). Pilih soal berikutnya: kandidat = soal belum tersaji dengan `difficulty = d`; urutkan `question_id` naik; bila ada, pilih indeks `floor(rand * n)` dengan `rand` dari PRNG `mulberry32` yang diseed dari 8 hex pertama `attempt.id` dan digeser sebanyak jumlah soal tersaji. Bila tidak ada kandidat pada `d`, cari ofset berurutan `+1, -1, +2, -2, +3, -3, +4, -4` (kesulitan `d+ofset` dalam 1..5) dan ambil ofset pertama yang punya kandidat. Setelah jawaban: benar -> `d = min(5, d + 1)`; salah -> `d = max(1, d - 1)`. Tes berakhir saat `answered = N` atau tidak ada soal tersisa.
**D4. Rekomendasi.** `last10` = `difficulty` dari maksimal 10 soal yang **dijawab** terakhir. `ability = round_half_up(mean(last10), 2)` (0 bila tidak ada soal). `correct_count`, `served_count` (= soal dijawab). `tier_ability = 1` bila `correct_count * 100 < 32 * served_count` atau `served_count = 0`; selain itu `clamp(floor(ability), 1, 4)`. **Amandemen 2026-11-03 (QA F-15-01; ADR-003 #30, diputuskan Orchestrator, perlu tinjauan human):** batas bukti `evidence_cap = 1 + floor(3 * served_count / N)` dan `recommended_tier = min(tier_ability, evidence_cap)` (N = `placement.question_count` yang dibekukan saat mulai; N=25: <=8 jawaban maks Tier 1, 9-16 maks Tier 2, 17-24 maks Tier 3, 25 bebas hingga Tier 4). Vektor uji dengan 25 jawaban tidak berubah. Aritmetika bilangan bulat.
**D5. Penerapan.** Hanya lewat `POST /placement/apply` (pilihan learner). Efek = `GatekeepingService.applyPlacementResult({ tierNumber })` (SPEC-003). Sebelum penerapan, tidak ada perubahan progres.
**D6. Waktu.** Attempt `EXAM`, `deadline_at = started_at + set.time_limit_seconds` (SPEC-006 D2); kadaluarsa menghitung rekomendasi dari soal yang sudah dijawab.

**Vektor uji (bank sintetis 30 soal per tingkat = 150 soal, N=25):** semua benar -> kesulitan tersaji `3,4,5,5,...` (23 kali 5), `last10` semua 5 -> `ability=5.00` -> `recommended_tier = clamp(5,1,4) = 4`; semua salah -> `3,2,1,1,...`, `correct_count=0` -> tier 1; mulai benar lalu bergantian salah-benar (`3(benar)->4(salah)->3(benar)->4(salah)...`) -> `last10` bergantian 3 dan 4 -> `ability=3.50`, benar 13 dari 25 -> `recommended_tier=3`; mulai salah lalu bergantian (`3(salah)->2(benar)->3(salah)->2(benar)...`) -> `ability=2.50`, benar 12 -> tier 2; `served=25`, `correct=7` -> `700 < 800` -> tier 1 meskipun `ability` 3.2.

## Technical Flow
1. Pengguna baru membuka `/` dan menekan "Ikut Placement Test" (tombol hanya tampil bila `GET /api/v1/placement` mengatakan `available=true`); klien membuka `/ujian/mulai/{assessment_set_id}`.
2. `GET /exams/{id}/intro` (SPEC-008, tipe `PLACEMENT_TEST`) menampilkan aturan.
3. Learner menekan "Mulai Ujian"; klien memanggil `POST /api/v1/attempts`; handler `PLACEMENT_TEST.start` memeriksa D1 (selain itu 409 `PLACEMENT_NOT_AVAILABLE`), membuat attempt `EXAM` dengan `state.placement = { d: 3, served: [], pending: "<id soal pertama>", history: [] }` dan mengembalikan HANYA soal pertama.
4. Learner menjawab; klien memanggil `PUT /attempts/{id}/answers/{question_id}`.
5. Server menilai soal (SPEC-006 D6-D7), mencatat `history`, memperbarui `d` (D3), memilih soal berikutnya, menyimpannya sebagai `pending` dan mengembalikannya di `next_question` (null bila selesai).
6. Setelah jawaban ke-N (atau `next_question = null`), klien memanggil `POST /attempts/{id}/submit`.
7. Server menghitung D4, menyimpan `attempts.result_json = { recommended_tier, ability, correct_count, served_count, applied: null }`, status `GRADED`, dan mengembalikan `AttemptResultDTO.placement`.
8. Klien menampilkan hasil; learner memilih Tier awal; klien memanggil `POST /api/v1/placement/apply`.
9. Server memvalidasi, memanggil `applyPlacementResult`, menyimpan `result_json.applied`, menulis `audit_log` `PLACEMENT_APPLIED`, dan mengembalikan ringkasan.
10. Klien membuka `/peta`.

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/placement.ts`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `CSRF_ORIGIN_MISMATCH`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`. Semua endpoint **Auth: user**.

### GET /api/v1/placement
- **Success status:** 200 | **Zod:** `PlacementStatusResponseSchema`
**Response (Success):**
```json
{ "data": { "available": true, "blocked_reason": null, "assessment_set_id": "d0cc0001-0001-4000-8000-000000000001", "question_count": 25, "time_limit_seconds": 1500, "completed_at": null, "active_attempt_id": null, "pending_result": null } }
```
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `available` | boolean | tidak | D1 (true juga bila ada `active_attempt_id`) |
| `blocked_reason` | `"ALREADY_COMPLETED"` \| `"PROGRESS_EXISTS"` \| `"NO_PLACEMENT_PUBLISHED"` \| `"RESULT_PENDING_APPLY"` \| null | ya | |
| `assessment_set_id` | uuid | ya | null bila tidak ada set |
| `completed_at` | ISO-8601 | ya | `users.placement_completed_at` |
| `active_attempt_id` | uuid | ya | attempt Placement `IN_PROGRESS` |
| `pending_result` | `{ attempt_id: uuid, recommended_tier: int }` | ya | hanya bila `RESULT_PENDING_APPLY` |
**Response (Error):** hanya kode umum.

### GET /api/v1/exams/{assessment_set_id}/intro (ekstensi `PLACEMENT_TEST`)
Field `placement` terisi: `{ "adaptive": true, "question_count": 25 }`; `threshold = null`; `scope = { "kind": "TIER_PLACEMENT", "id": null, "label": "Penentuan Tier awal" }`; `rules`: ["Soal menyesuaikan jawaban Anda.", "Waktu 25 menit, berjalan terus walau Anda keluar halaman.", "Tidak ada pembahasan dan Anda tidak dapat kembali ke soal sebelumnya.", "Hasilnya adalah rekomendasi; Anda memilih Tier awal."]. `blocked_reason` ∈ {`ALREADY_COMPLETED`, `PROGRESS_EXISTS`, `RESULT_PENDING_APPLY`, null} (arti = D1). Kode error: `NOT_FOUND` (404) bila set tidak `PUBLISHED`.

### POST /api/v1/attempts (kontrak tambahan tipe `PLACEMENT_TEST`)
Bentuk SPEC-006; `AttemptDTO.questions` berisi 1 elemen (soal pertama), `question_count=25`, `current_index=0`, `mode="EXAM"`. Kode error tambahan:
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 409 | PLACEMENT_NOT_AVAILABLE | D1 tidak terpenuhi. `details[0].code` = `ALREADY_COMPLETED` \| `PROGRESS_EXISTS` \| `RESULT_PENDING_APPLY`. Pesan: "Placement Test tidak tersedia untuk akun ini." |

### PUT /api/v1/attempts/{attempt_id}/answers/{question_id} (perilaku tambahan Placement)
Respons sukses memuat `next_question` (`QuestionPublicDTO` soal berikutnya, atau `null` bila tes selesai) dan `feedback=null`:
```json
{ "data": { "question_id": "Q-PL-014", "saved": true, "answered_count": 7, "feedback": null,
  "next_question": { "question_id": "Q-PL-031", "question_type": "MCQ_SINGLE", "skill": "GRAMMAR", "prompt": "She ____ to work every day.", "points": 1, "target_time_ms": null, "passage_no": null, "section_no": null,
    "options": [ { "option_id": "oq1w2e", "text": "goes" }, { "option_id": "or3t4y", "text": "go" }, { "option_id": "ou5i6o", "text": "going" }, { "option_id": "op7a8s", "text": "gone" } ],
    "choose_count": null, "fixed_choices": null, "max_words": null, "matching": null, "segments": null, "tokens": null, "ai_task": null } } }
```
`difficulty` TIDAK ada pada `QuestionPublicDTO`. Kode error tambahan:
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 409 | QUESTION_ALREADY_ANSWERED | Soal sudah dijawab (Placement satu kali jalan; berlaku baik `response` sama maupun berbeda) |
| 409 | QUESTION_NOT_CURRENT | `question_id` tersaji tetapi bukan soal `pending` saat ini (tidak mungkin dijawab di luar urutan) |
| 404 | NOT_FOUND | `question_id` belum tersaji pada attempt ini (bank tidak dapat ditanya sembarang) |

### POST /api/v1/attempts/{attempt_id}/submit (ekstensi hasil `placement`)
```json
{ "placement": { "recommended_tier": 3, "ability": 3.5, "correct_count": 13, "served_count": 25, "applied": false,
  "tier_options": [ { "tier_number": 1, "title": "Foundation", "cefr_level": "A1-A2", "target_band_min": 3.0, "target_band_max": 4.0 }, { "tier_number": 2, "title": "Bridge to Academic", "cefr_level": "B1", "target_band_min": 4.0, "target_band_max": 5.0 }, { "tier_number": 3, "title": "Operational IELTS", "cefr_level": "B2", "target_band_min": 5.5, "target_band_max": 6.5 } ] } }
```
`attempt.passed=null`, `attempt.score_percent` = persentase benar dari soal tersaji, `skip`/`boss` null, `review=null`. `tier_options` = Tier `1..recommended_tier`.

### POST /api/v1/placement/apply
- **Success status:** 200 | **Zod:** `ApplyPlacementRequestSchema`
| Field | Type | Required | Constraint |
|---|---|---|---|
| `attempt_id` | uuid | ya | attempt Placement `GRADED`/`EXPIRED` milik user |
| `tier_number` | int | ya | 1-4 dan <= `recommended_tier` |
```json
{ "attempt_id": "9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a", "tier_number": 3 }
```
**Response (Success) 200:**
```json
{ "data": { "applied": true, "tier_number": 3, "skipped_tiers": [1, 2], "unlocked": [ { "kind": "TIER", "id": "7a1b2c3d-0003-4000-8000-000000000003", "label": "Tier 3 Operational IELTS" }, { "kind": "SUB_MODULE", "id": "7a1b2c3d-0311-4000-8000-000000000311", "label": "3.1.1 Section 1 & 2" } ] } }
```
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body tidak valid atau `tier_number` di luar 1-4 |
| 404 | NOT_FOUND | Attempt tidak ada, bukan milik user, atau bukan tipe Placement |
| 409 | ATTEMPT_NOT_FINISHED | Attempt `IN_PROGRESS` |
| 409 | TIER_ABOVE_RECOMMENDATION | `tier_number > recommended_tier`. Pesan: "Tier awal tidak boleh lebih tinggi dari rekomendasi." |
| 409 | PLACEMENT_ALREADY_APPLIED | `placement_completed_at` terisi atau `result_json.applied` terisi |
| 409 | PLACEMENT_NOT_AVAILABLE | Ada sub-modul `COMPLETED`/`SKIPPED` (progres sudah ada) |

## Database Changes
Tidak ada tabel/kolom baru. Memakai `attempts` (`state`, `result_json`), `attempt_answers`, `users.placement_completed_at`. `attempts.state.placement` (jsonb): `{ "d": 3, "served": ["Q-PL-001"], "pending": "Q-PL-001", "history": [ { "question_id": "Q-PL-001", "difficulty": 3, "correct": true } ] }` (`difficulty` hanya di server). Seed `app_settings`: `placement.question_count` = 25. Mendaftarkan `assessmentTypeHandlers.PLACEMENT_TEST` (`start`, `onFinish`, `intro`, `afterAnswer`). Audit: `PLACEMENT_APPLIED` (`metadata`: `tier_number`, `recommended_tier`, `ability`). Aturan publish tambahan (ditambahkan ke SPEC-004 bagian validasi): `PLACEMENT_TEST` tidak boleh memuat `WRITING_TASK`/`SPEAKING_TASK`.

## UI/UX
Rujukan: `design-system.md` 5.21 Placement Test, 5.19 Mode Ujian, 5.10 (empty state kartu Lanjutkan Belajar), 5.12 (renderer soal), 5.1 Button, 5.3 Card.

- **Titik masuk:** empty state dashboard (SPEC-007) menampilkan Button sekunder "Ikut Placement Test" bila `available`; juga tautan di `/peta` pada pengguna tanpa progres.
- **Intro:** `ExamIntro` (SPEC-008) dengan aturan Placement, Button primary "Mulai Ujian".
- **Berjalan** `/ujian/[attempt_id]`: `ExamShell` mode satu-soal: "Soal 7 dari 25" + Progress, timer total, satu soal per layar (`QuestionRenderer`), Button primary "Jawab" (disabled sampai ada jawaban; loading "Menyimpan...") yang mengirim jawaban lalu langsung memuat `next_question`; TIDAK ada grid navigator, tombol Sebelumnya, atau umpan balik. Tombol "Akhiri" (Dialog: "Akhiri tes sekarang? Hasil dihitung dari soal yang sudah dijawab.").
- **Hasil** `/ujian/[attempt_id]/hasil`: Card "Rekomendasi: Mulai di Tier {n}" (judul Tier, CEFR, target band), ringkasan "{correct} dari {served} benar", Button primary "Mulai di Tier {n}" (memanggil apply dengan `tier_number = recommended_tier`), Button sekunder "Mulai dari Tier 1" (apply 1; disembunyikan bila rekomendasi 1), `Select` "Pilih Tier lain" (Tier 1..rekomendasi) untuk pilihan di antaranya. Dialog konfirmasi menyebut Tier yang akan dilewati: "Tier 1 dan 2 akan ditandai Dilewati." Sukses -> Toast "Tier awal Anda: Tier 3" dan redirect ke `/peta`. Disclaimer "Ini rekomendasi latihan, bukan penilaian resmi."
- **State:** `RESULT_PENDING_APPLY`: halaman `/` menampilkan Card "Hasil Placement Anda menunggu" dengan Button "Lihat Hasil"; jaringan gagal pada jawaban: Toast dengan "Coba lagi" dan soal tidak maju; kadaluarsa: Dialog "Waktu habis" lalu ke hasil.
- Aksesibilitas: fokus ke kepala soal setiap soal baru; pengumuman `aria-live` "Soal 8 dari 25".

## Acceptance Criteria
- [ ] **Given** pengguna baru tanpa progres dan set Placement `PUBLISHED` **When** `GET /placement` **Then** `available=true`, `question_count=25`, `assessment_set_id` terisi.
- [ ] **Given** pengguna dengan satu sub-modul `COMPLETED` **When** `GET /placement` **Then** `available=false`, `blocked_reason="PROGRESS_EXISTS"`; `POST /attempts` pada set Placement -> 409 `PLACEMENT_NOT_AVAILABLE`.
- [ ] **Given** `placement_completed_at` terisi **When** `GET /placement` **Then** `blocked_reason="ALREADY_COMPLETED"`.
- [ ] **Given** tidak ada set `PUBLISHED` **When** `GET /placement` **Then** `available=false`, `blocked_reason="NO_PLACEMENT_PUBLISHED"`.
- [ ] **Given** bank 50 soal **When** `POST /attempts` **Then** 201, `questions.length=1`, `question_count=25`, soal pertama berkesulitan 3 (diverifikasi server-side lewat `state.placement.history`), dan payload tidak memuat `difficulty` atau kunci jawaban.
- [ ] **Given** jawaban benar pada soal berkesulitan 3 **When** `PUT answers` **Then** `next_question` berkesulitan 4 (server-side), `feedback=null`, dan soal tersebut belum pernah tersaji; jawaban salah -> berkesulitan 2.
- [ ] **Given** bank tanpa soal tersisa pada kesulitan target **When** memilih soal **Then** mengambil kesulitan terdekat menurut urutan ofset `+1, -1, +2, -2, ...` (uji unit untuk bank dengan tingkat 5 habis: ofset -1 dipakai).
- [ ] **Given** soal pertama sudah dijawab **When** `PUT` jawaban soal itu lagi (response sama atau beda) **Then** 409 `QUESTION_ALREADY_ANSWERED`; `PUT` untuk soal yang belum tersaji -> 404; untuk soal tersaji yang bukan `pending` -> 409 `QUESTION_NOT_CURRENT`.
- [ ] **Given** bank sintetis 150 soal dan vektor uji D4 (semua benar, semua salah, bergantian benar-salah, bergantian salah-benar, 7 benar dari 25) **When** `submit` **Then** `recommended_tier` = 4, 1, 3, 2, 1 dan `ability` = 5.00, 1.00, 3.50, 2.50, (sesuai) berturut-turut.
- [ ] **Given** hasil dengan `recommended_tier=3` **When** `POST /placement/apply` `tier_number=3` **Then** 200, Tier 1 dan 2 beserta isinya `SKIPPED` (`unlock_source="PLACEMENT"`), Tier 3 `UNLOCKED`, sub-modul pertama Tier 3 `UNLOCKED`, `users.placement_completed_at` terisi, `result_json.applied` terisi, `audit_log` `PLACEMENT_APPLIED`.
- [ ] **Given** `recommended_tier=3` **When** apply `tier_number=2` **Then** 200, hanya Tier 1 `SKIPPED` dan Tier 2 `UNLOCKED`; apply `tier_number=4` -> 409 `TIER_ABOVE_RECOMMENDATION`.
- [ ] **Given** apply sudah dilakukan **When** apply lagi **Then** 409 `PLACEMENT_ALREADY_APPLIED`; `POST /attempts` Placement -> 409 `PLACEMENT_NOT_AVAILABLE` (`ALREADY_COMPLETED`).
- [ ] **Given** attempt `IN_PROGRESS` **When** apply **Then** 409 `ATTEMPT_NOT_FINISHED`; attempt milik user lain -> 404.
- [ ] **Given** hasil selesai tetapi belum apply **When** `GET /placement` **Then** `blocked_reason="RESULT_PENDING_APPLY"` dan `pending_result.recommended_tier` terisi; progres belum berubah.
- [ ] **Given** attempt kadaluarsa setelah 6 jawaban **When** diproses **Then** `served_count` = jumlah soal yang dijawab (F-15-08), rekomendasi dihitung dari jawaban yang ada dan dibatasi batas bukti D4 (6 jawaban -> Tier 1), dan hasil dapat diterapkan; tanpa jawaban sama sekali -> `recommended_tier=1`.
- [ ] **Given** tes diakhiri dini (QA F-15-01) **When** `submit` dengan 1-3 jawaban benar, 8 jawaban, 9, 16, 17, 24, dan 25 jawaban benar kesulitan tinggi **Then** `recommended_tier` = 1 untuk 1-3 dan 8 jawaban, 2 untuk 9 dan 16, 3 untuk 17 dan 24, 4 untuk 25.
- [ ] **Given** dua set Placement `PUBLISHED` (QA F-15-03) **When** `POST /attempts` pada set bukan pilihan D1 **Then** 404; bila attempt pada set lain `IN_PROGRESS` -> 409 `PLACEMENT_NOT_AVAILABLE`; hasil `per_skill` hanya memuat soal yang dijawab (F-15-05).
- [ ] **Given** `GET /attempts/{id}` saat tes berjalan **When** dipanggil **Then** `questions` hanya berisi soal yang telah tersaji (yang dijawab + yang `pending`), tidak ada soal bank lain.
- [ ] **Given** E2E Playwright (bank fixture 50 soal, 25 diserahkan) **When** learner menjawab semua dan memilih "Mulai di Tier {rekomendasi}" **Then** `/peta` menampilkan Tier sebelumnya "Dilewati" dan Tier terpilih terbuka; pada 375x812 tanpa scroll horizontal.
- [ ] **Given** dua perangkat membuka attempt yang sama **When** keduanya menjawab soal `pending` serentak **Then** satu 200 dan satu 409 `QUESTION_ALREADY_ANSWERED` tanpa soal ganda yang tersaji.

## Edge Cases & Validation
- [ ] Bank kurang dari N soal tersisa: tes berakhir lebih awal (`next_question=null`), `served_count < 25`; `question_count` tetap 25 pada DTO awal namun `GET result` memuat `served_count` sebenarnya.
- [ ] Soal berkesulitan di luar 1-5 tidak mungkin (divalidasi SPEC-004).
- [ ] Pengguna menekan "Mulai dari Tier 1": `applyPlacementResult({tierNumber:1})` menandai `placement_completed_at` tanpa melewati Tier mana pun.
- [ ] `tier_number` bukan integer: 400 `VALIDATION_ERROR`.
- [ ] Set Placement diganti versi saat attempt berjalan: attempt memakai soal yang sudah tersaji; soal baru yang dipilih berasal dari data set saat itu.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; pemetaan level A2/D10 (ADR-003 #6) |
| 2026-11-03 | Backend Engineer | Implementasi backend (aditif; tanpa tabel/kolom baru dan tanpa migrasi). Klarifikasi: (1) `attempts.state.placement` = `{ n, d, served[], pending, history[] }` (`n` = `placement.question_count` dibekukan saat mulai); `state.order`/`served` hanya memuat soal tersaji (dijawab + pending), pemetaan opsi diacak per soal dengan seed rahasia. (2) Pemilihan indeks kandidat memakai `mulberry32` yang diseed dari 8 hex pertama `attempt.id` dan digeser sebanyak soal tersaji (D3 apa adanya). (3) `served_count`/`correct_count`/`last10`/`ability` dihitung dari soal yang DIJAWAB (D6, UI "hasil dihitung dari soal yang sudah dijawab"); soal `pending` yang belum dijawab saat tes diakhiri/kedaluwarsa tidak dihitung. (4) `attempt.raw_score/max_score/score_percent` dari soal yang dijawab; `passed`/`band_score` null; `review` null. (5) `result_json` = `{ v, progress, skip, boss, placement, recommended_tier, ability, correct_count, served_count, applied }` (`applied` null sampai apply, lalu `{ tier_number, at }`); `placement.applied` pada DTO menjadi true setelah apply; `placement.tier_options` disimpan saat selesai. (6) Urutan pemeriksaan apply: 404 -> `ATTEMPT_NOT_FINISHED` -> `PLACEMENT_ALREADY_APPLIED` -> `TIER_ABOVE_RECOMMENDATION` -> `PLACEMENT_NOT_AVAILABLE` (`PROGRESS_EXISTS`); attempt `IN_PROGRESS` yang sudah lewat deadline dinilai (EXPIRED) lebih dulu lalu dapat diterapkan; baris `users` dikunci selama apply sehingga apply serentak menghasilkan satu 200 dan satu 409. (7) `apply.unlocked` = entitas yang kini UNLOCKED (TIER, MODULE, SUB_MODULE); entitas yang dilewati dinyatakan lewat `skipped_tiers`. (8) `GET /placement`: `question_count` selalu `placement.question_count`; `time_limit_seconds` null bila tidak ada set; `available=true` bila ada `active_attempt_id` (alasan null); `POST /attempts` pada set Placement selain yang dipilih D1 tetap diperbolehkan selama pengguna memenuhi D1. (9) `GET /exams/{id}/intro` Placement: `time_limit_seconds` set, `question_count` = N, `cooldown` = `{ null, 0, 1 }`. (10) Zod aditif: `src/contracts/placement.ts` (`PlacementStatusSchema`, `ApplyPlacementRequestSchema`, `ApplyPlacementResponseSchema`, `PlacementResultSchema`). Kode error baru terdaftar di server: `PLACEMENT_NOT_AVAILABLE`, `QUESTION_NOT_CURRENT`, `TIER_ABOVE_RECOMMENDATION`, `PLACEMENT_ALREADY_APPLIED`. |
| 2026-11-03 | Backend Engineer | Perbaikan QA W7 (diputuskan Orchestrator, perlu tinjauan human): (1) F-15-01 amandemen D4 (batas bukti `1 + floor(3*dijawab/N)`; ADR-003 #30); (2) F-15-03 amandemen D1 (set terpilih D1 dan satu attempt aktif lintas set); (3) F-15-05 `per_skill` hanya soal yang dijawab; (4) F-15-04 `POST /placement/apply` mengunci progres sebelum memeriksa `PROGRESS_EXISTS`; (5) F-15-08 AC: `served_count` = soal dijawab. Ditunda: F-15-02 (seed rahasia D3), F-15-06, F-15-07, F-15-09. Kontrak: tanpa perubahan bentuk. |
