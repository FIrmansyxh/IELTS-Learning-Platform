# SPEC-022: Bank Soal Modular dan Mix Builder (IELTS General Training)

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-004); direvisi teknis oleh Analyst 2026-11-08 (menyelaraskan dengan SPEC-025/ADR-005)
- **Created:** 2026-11-08
- **Status:** approved (human, 2026-11-08, via /build-feature: disetujui apa adanya); revisi teknis 2026-11-08: butir Keputusan Analyst 1, 2, 3, 5 dikonfirmasi human; butir 4 dan 6 menunggu konfirmasi
- **Depends on:** SPEC-004, SPEC-006, SPEC-017, SPEC-025. (SPEC-019/020 SUPERSEDED oleh SPEC-025: pengganti = CLI `bank:validate` dan `content:import`.) Dependensi berstatus `ready_to_test` dianggap cukup (dispensasi human).
- **Prioritas:** P1
- **Urutan build:** KE-1 dari 4 (022 -> 021 -> 024 -> 023). Spec ini memiliki SATU-SATUNYA migrasi pembangunan-ulang tabel (`0002`), dipakai juga oleh 021, 023.
- **Cakupan:** Konten (kontrak bank soal v1.0, bank awal GT) + Backend (impor bank lewat CLI, pemilih soal campuran, attempt campuran, migrasi SQLite) + Frontend (Mix Builder)

## User Story
Sebagai Learner IELTS General Training (profil lokal), saya ingin latihan dari banyak modul soal yang bisa saya pilih dan campur (skill, tipe soal, kesulitan, jumlah), atau dicampur otomatis berdasarkan kelemahan saya, sehingga latihan saya bervariasi dan menyasar area yang paling butuh perbaikan.

## Non-Goals / Out of Scope
- LLM TIDAK membuat soal; semua soal ditulis/dikurasi lalu diimpor lewat berkas (ADR-004). LLM hanya menilai jawaban Writing.
- Tidak ada panel/endpoint admin, tidak ada kurasi lewat UI, tidak ada pratinjau/rollback impor lewat UI (SPEC-025). Bank dimuat lewat berkas `content/gt-bank/*.json` + `npm run bank:validate` + `npm run content:import`.
- Tidak ada penilaian otomatis Speaking pada MVP (SPEC-013 ditunda); soal Speaking dilatih lewat prompt AI eksternal (tombol "Salin prompt").
- Bank Listening (`LISTENING_GT_S1..S4`) dikenali oleh kontrak dan validator (konten dibuat di SPEC-024) tetapi TIDAK dapat dipilih di Mix Builder (runner campuran tidak punya pemutar audio ujian). Listening dilatih lewat drill sub-modul dan simulasi (SPEC-023).
- Bank tidak menggantikan Active Drill/Boss; bank adalah sumber tambahan untuk latihan campuran.
- Tidak ada konten Academic (grafik/peta/diagram, AWL) di bank GT.
- Tidak ada poin, mahkota, atau streak harian dari sesi campuran (lihat D6).
- Tidak ada endpoint untuk menambah/mengubah bank dari UI atau HTTP.

## Definisi Tetap
**D1. Bank soal** = kumpulan soal bertema satu `bank_kind` untuk satu skill, dengan metadata. `exam_module` selalu `GENERAL_TRAINING`. Satu bank = satu baris `assessment_sets` dengan `assessment_type='QUESTION_BANK'`.

**D2. Taksonomi `bank_kind`:**
| Skill | `bank_kind` | Isi |
|---|---|---|
| READING | `READING_GT_S1` | Teks sosial sehari-hari (iklan, pengumuman, brosur, jadwal) |
| READING | `READING_GT_S2` | Teks ketenagakerjaan (lowongan, kebijakan, kontrak, pelatihan) |
| READING | `READING_GT_S3` | Teks umum panjang (artikel majalah/surat kabar) |
| WRITING | `WRITING_GT_T1_FORMAL` / `_SEMI` / `_INFORMAL` | Soal surat per register (kind pengiriman `WRITING_TASK1`) |
| WRITING | `WRITING_GT_T2` | Soal esai (opinion, discussion, problem-solution, two-part) (kind `WRITING_TASK2`) |
| SPEAKING | `SPEAKING_P1` / `P2` / `P3` | Soal wawancara, cue card, diskusi |
| GRAMMAR | `GRAMMAR_GT_REGISTER` | Register surat, frasa pembuka/penutup, tata bahasa untuk surat |
| VOCAB | `VOCAB_GT_EVERYDAY` | Kosakata situasi sehari-hari dan kerja |
| LISTENING | `LISTENING_GT_S1` .. `LISTENING_GT_S4` | Satu bank per bagian Listening; wajib beraudio (D7) |
`BANK_KINDS` dan `BANK_KIND_SKILL` di `src/contracts/question-bank.ts` ditambah empat nilai `LISTENING_GT_S1..S4` (skill `LISTENING`).

**D3. Item bank** memakai skema soal yang sama dengan kontrak konten 1.1 (`QuestionSchema`), sehingga mesin soal SPEC-006 tidak berubah. ID soal `Q-<KIND>-<NNN>`, unik GLOBAL lintas semua bank (tanpa segmen satu huruf A-C atau `P<n>` agar tidak terbaca sebagai slot variasi paket). `bank_code` mengikuti `^GT-[A-Z0-9]+(-[A-Z0-9]+)*$`, unik, panjang 4-40.

**D4. Reading.** Bank membawa `reading_passage_markdown` (pemisah `===PASSAGE===`) dan soal dengan `passage_no` (1-3). Satuan Reading = "paket teks" = pasangan (bank, `passage_no`): teks + SEMUA soal dengan `passage_no` itu, berurutan menurut urutan dalam bank. Memasukkan satu soal Reading ke campuran berarti membawa teksnya utuh.

**D5. Mix.** Permintaan campuran = `{ skills?, bank_kinds?, question_types?, difficulty_min?, difficulty_max?, count (5-40), mode: MANUAL|AUTO_WEAKNESS, seed? }`.
Aturan seleksi (deterministik; fungsi murni `selectMix(pool, request, radar, history, rng)` di `src/server/mix/select.ts`):
1. **Kumpulan kandidat (pool).** Soal dari bank berstatus `PUBLISHED` dan `exam_module='GENERAL_TRAINING'`, tidak termasuk skill `LISTENING`, yang cocok DENGAN SEMUA filter yang diberikan (AND): `skills` (default: GRAMMAR, VOCAB, READING, WRITING, SPEAKING), `bank_kinds` (default: semua), `question_types` (default: semua), `difficulty_min..difficulty_max` (default 1..5; soal tanpa `difficulty` dianggap 3).
2. **Batas AI.** Writing dan Speaking masing-masing maksimal 1 soal per sesi (dijawab lewat submission, bukan drill). Kapasitas efektif pool = jumlah soal objektif + min(1, jumlah soal Writing) + min(1, jumlah soal Speaking). Bila kapasitas efektif < `count` -> `422 MIX_NOT_ENOUGH_QUESTIONS`.
3. **Penarikan tanpa pengembalian,** satu soal per iterasi sampai terkumpul `count` soal (atau lebih, hanya karena paket Reading utuh, butir 4). Tanpa duplikat `question_id` dalam satu sesi.
   - `MANUAL`: soal ditarik acak seragam dari sisa pool.
   - `AUTO_WEAKNESS`: dua tahap. Tahap skill: bobot `W_skill = max(gap, 0.5)` dengan `gap = 9.0 - user_skill_scores.estimated_band` skill itu. Skill tanpa baris `user_skill_scores` atau dengan `estimated_band` NULL memakai `gap` = rata-rata `gap` skill-skill yang punya nilai; bila tidak ada satu pun yang punya nilai, semua skill berbobot 1 (seragam). Tahap soal dalam skill terpilih: bobot `T_q = (1 + salah_tipe_30h) x (0.3 jika benar 2x berturut-turut else 1)`. `salah_tipe_30h` = (jawaban salah)/(jawaban berisi `is_correct` non-NULL) pada `attempt_answers` profil ini dengan `question_type` sama, `answered_at` dalam 30 hari terakhir, attempt berstatus `GRADED`/`EXPIRED`; 0 bila tidak ada jawaban. "Benar 2x berturut-turut" = dua baris `attempt_answers` terbaru (urut `answered_at` menurun) profil ini untuk `question_id` itu keduanya `is_correct=true`. Untuk skill WRITING dan SPEAKING (tanpa `is_correct`), `T_q = 1`. Skill yang kandidatnya habis dikeluarkan dari tahap skill.
   - Pengguna tanpa riwayat apa pun: semua bobot 1 (seragam).
4. **Paket Reading.** Bila soal terpilih adalah soal Reading, seluruh paket teksnya (D4: teks utuh + SEMUA soal `passage_no` itu, berurutan) ikut dimasukkan; paket tidak pernah dipotong atau dipisah dari teksnya (D4 menang). Akibatnya jumlah soal akhir = `count` bila tidak ada paket Reading; bila ada paket Reading, jumlah soal akhir = jumlah soal yang terkumpul saat `count` tercapai atau terlampaui oleh paket terakhir yang masuk (jadi dapat melebihi `count` paling banyak ukuran paket - 1). Soal paket yang sudah masuk tidak ditarik lagi. Paket yang sama tidak dimasukkan dua kali. Hitungan Writing/Speaking maksimal 1 tetap berlaku.
5. **Urutan akhir** = urutan penarikan; soal satu paket Reading selalu berurutan.
6. **Seed.** `seed` (opsional, string `^[A-Za-z0-9_-]{1,64}$`) HANYA menentukan penarikan (PRNG `mulberry32` dari hash SHA-256 `seed` dipotong 32 bit); tanpa `seed`, server memakai angka acak CSPRNG. Urutan opsi jawaban selalu diacak dengan seed CSPRNG rahasia (`newRngSeed()`, disimpan di `attempts.state.rng_seed`, tidak pernah dikirim ke klien), seperti SPEC-006.

**D6. Attempt campuran** bertipe `MIX_PRACTICE` (`mode='PRACTICE'`): tidak berbatas lulus/gagal (`passed` NULL, `band_score` NULL), tidak memengaruhi gatekeeping/Boss, `points_awarded = 0` (tanpa poin, mahkota, streak harian; Keputusan Analyst), memberi umpan balik instan per jawaban, hasil per skill/tipe, dan menulis ke `user_skill_scores` (radar) lewat `skillScoreHook` yang ada (skill diambil dari `attempt_answers.skill`, sehingga tidak perlu kode radar baru). Hanya satu attempt `MIX_PRACTICE` berstatus `IN_PROGRESS` per profil: memulai sesi baru otomatis mengubah sesi `IN_PROGRESS` lama menjadi `ABANDONED` dalam transaksi yang sama (Keputusan Analyst).

**D7. Bank Listening (kontrak untuk SPEC-024).** Field tambahan opsional pada `QuestionBankSchema`: `listening_asset_code` (string, `ASSET_CODE_RE`) dan `pending_audio` (boolean, default false). Aturan validator (`bank:validate` dan `content:import`):
- Bank ber-`bank_kind` `LISTENING_GT_S*` WAJIB tepat satu dari: `listening_asset_code` terisi, ATAU `pending_audio: true`. Keduanya/tidak satu pun -> galat `listening_asset_required`.
- Bank non-Listening dengan salah satu field itu -> galat `listening_field_not_allowed`.
- `listening_asset_code` harus terdaftar: ada di `assets.manifest.json` paket (kind `AUDIO_LISTENING`) ATAU sudah ada di `content_assets.asset_code` dengan `kind='AUDIO_LISTENING'` dan `rights_status` `OWN_ORIGINAL` atau `VERIFIED_OPEN`; kalau tidak -> galat `listening_asset_unregistered`.
- Bank `pending_audio: true` diimpor dengan `status='DRAFT'` dan `listening_asset_id` NULL, dan `--publish` melewatinya (tidak pernah `PUBLISHED`). "PENDING_AUDIO" = kondisi ini, bukan nilai enum DB.

**D8. Impor bank (pengganti importer admin).** `npm run content:import -- --dir <dir>` mengimpor `question_banks[]` ke `assessment_sets` (`QUESTION_BANK`), idempoten per `bank_code` lewat `content_hash` (SHA-256 JSON kanonik): hash sama = NOOP; hash beda = UPDATE dan `version + 1`; bank baru = INSERT berstatus `DRAFT`. Opsi `--publish` memublikasikan bank non-`pending_audio` yang lolos validasi dan penghalang (`v_publish_blockers`). Penulisan `audit_log` `CONTENT_IMPORTED_CLI` seperti SPEC-004. Pembaruan bank yang soalnya sedang dipakai attempt `IN_PROGRESS` aman karena attempt membekukan snapshot (D6, Technical Flow 3).

## Technical Flow
1. Penulis konten membuat/ubah `codes/content/gt-bank/*.json` (kontrak bank 1.0), lalu menjalankan `npm run bank:validate -- --dir content/gt-bank` (validasi lokal tanpa DB) dan `npm run content:import -- --dir content/gt-bank --publish` (menulis ke SQLite lokal).
2. Learner membuka Mix Builder (`/latihan/campur`): UI memanggil `GET /api/v1/banks`, lalu learner memilih skill/tipe/jumlah, atau menekan "Campur otomatis (fokus kelemahan)".
3. `POST /api/v1/mix-sessions` (dalam satu transaksi `BEGIN IMMEDIATE`): mengubah attempt `MIX_PRACTICE` `IN_PROGRESS` lama (bila ada) menjadi `ABANDONED`; membaca radar dan riwayat; menjalankan `selectMix` (D5); membuat attempt `MIX_PRACTICE` dengan `assessment_set_id = NULL`, `assessment_version = 0`, `mode = 'PRACTICE'`, `state` berisi snapshot (skema `mix.v1` di bawah).
4. Jawaban lewat endpoint attempt yang ada (`GET /attempts/{id}`, `PUT /attempts/{id}/answers/{question_id}`, `POST /attempts/{id}/submit`, `GET /attempts/{id}/result`). Untuk attempt dengan `assessment_set_id` NULL, layanan attempt mengambil daftar soal, kunci, dan teks Reading dari `attempts.state`, dan memilih handler berdasarkan `attempts.assessment_type` (BUKAN `assessment_sets.assessment_type`). `attempt_answers.assessment_set_id` diisi `bank_set_id` asal soal.
5. Soal Writing di campuran membuka editor dan dikirim lewat `POST /api/v1/submissions/writing` dengan `attempt_id`, `question_id`, dan `kind` yang cocok dengan `task_kind` soal (`TASK1` -> `WRITING_TASK1`, `TASK2` -> `WRITING_TASK2`) lalu masuk antrean AI dalam proses (SPEC-012). Soal Speaking menampilkan kartu "Salin prompt" (`external_eval_prompt`, atau prompt otomatis bila kosong) dan form skor lewat `POST /api/v1/submissions/speaking-external` dengan `attempt_id`, `question_id`, dan `kind` `SPEAKING_PART<part soal>`. Layanan AI (`src/server/ai/service.ts`: pembuatan submission Writing dan Speaking-eksternal) WAJIB diubah: bila `attempts.assessment_set_id` NULL, soal dicari di `attempts.state.questions[]` (bukan `assessment_sets.questions_json`). Pengiriman hanya diterima selama attempt `IN_PROGRESS` (`409 ATTEMPT_NOT_ACTIVE` selain itu): item Writing/Speaking yang belum dikirim saat `submit` dianggap dilewati. `PUT .../answers/{question_id}` untuk soal Writing/Speaking tetap `409 QUESTION_REQUIRES_SUBMISSION`.
6. `POST /attempts/{id}/submit`: menilai soal objektif saja (`rawScore/maxScore/scorePercent` dari soal objektif; Writing/Speaking tidak dihitung), menetapkan status `GRADED`, menjalankan `attemptCompletedHooks` (gamifikasi dilewati karena `MIX_PRACTICE` tidak memberi poin; `skillScoreHook` berjalan). Evaluasi Writing/Speaking yang menyusul tetap masuk radar lewat `evaluationGradedHooks` yang ada.

**Skema `attempts.state` untuk `MIX_PRACTICE` (`schema: "mix.v1"`):**
`{ schema: "mix.v1", mode: "MANUAL"|"AUTO_WEAKNESS", rng_seed: string(32 hex), filters: {skills, bank_kinds, question_types, difficulty_min, difficulty_max}, passages: [{ bank_set_id: uuid, passage_no: int, markdown: string }], questions: [{ position: int(1..count), question_id: string, bank_set_id: uuid, bank_code: string, bank_version: int, skill: string, question_type: string, passage_no: int|null, option_order: string[]|null, question: <objek Question lengkap termasuk kunci jawaban> }] }`. Isi `state` TIDAK PERNAH dikirim ke klien apa adanya; DTO publik memakai `QuestionPublicSchema` (tanpa `correct_answers`/`explanation_id` sebelum soal dijawab).

## API Contract
Semua rute `auth: 'user'`, envelope `{ data }` / `{ error }` sesuai `_api-contract.md` bagian 1. Tidak ada endpoint `/admin/*`.

### GET /api/v1/banks
- **Auth:** user (cookie sesi profil). **Sukses:** 200. Hanya bank `PUBLISHED`; tanpa kunci jawaban.
- **Query:** tidak ada.
**Response (200):**
| Field | Tipe | Null | Keterangan |
|---|---|---|---|
| `data[].bank_code` | string | tidak | mis. `GT-RD-S1-EVERYDAY` |
| `data[].bank_kind` | string | tidak | salah satu `BANK_KINDS` |
| `data[].title` | string | tidak | 1-200 |
| `data[].skill` | string | tidak | `GRAMMAR`\|`VOCAB`\|`LISTENING`\|`READING`\|`WRITING`\|`SPEAKING` |
| `data[].question_count` | int | tidak | jumlah soal |
| `data[].question_types` | `[{ question_type: string, count: int }]` | tidak | urut menurun `count`, lalu nama |
| `data[].has_passage` | boolean | tidak | true bila bank Reading |
| `data[].selectable_in_mix` | boolean | tidak | false untuk skill `LISTENING` |
```json
{ "data": [
  { "bank_code": "GT-RD-S1-EVERYDAY", "bank_kind": "READING_GT_S1", "title": "Reading S1: Teks sehari-hari", "skill": "READING",
    "question_count": 8, "question_types": [{ "question_type": "TFNG", "count": 3 }, { "question_type": "MCQ_SINGLE", "count": 2 }, { "question_type": "SHORT_ANSWER", "count": 2 }, { "question_type": "FILL_IN_BLANK", "count": 1 }],
    "has_passage": true, "selectable_in_mix": true },
  { "bank_code": "GT-GR-REGISTER", "bank_kind": "GRAMMAR_GT_REGISTER", "title": "Grammar: register surat", "skill": "GRAMMAR",
    "question_count": 16, "question_types": [{ "question_type": "MCQ_SINGLE", "count": 12 }, { "question_type": "ERROR_RECOGNITION", "count": 2 }, { "question_type": "FILL_IN_BLANK", "count": 2 }],
    "has_passage": false, "selectable_in_mix": true } ] }
```
| HTTP | Kode | Kapan |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Tanpa cookie sesi profil |

### POST /api/v1/mix-sessions
- **Auth:** user. **Sukses:** 201. Body `z.strictObject`; klien tidak mengirim `user_id`, skor, atau urutan opsi.
**Request:**
| Field | Tipe | Required | Constraint |
|---|---|---|---|
| `skills` | string[] | tidak | 1-5 elemen unik dari `GRAMMAR`,`VOCAB`,`READING`,`WRITING`,`SPEAKING`; `LISTENING` ditolak |
| `bank_kinds` | string[] | tidak | 1-12 elemen unik dari `BANK_KINDS` selain `LISTENING_GT_S*` |
| `question_types` | string[] | tidak | 1-13 elemen unik dari tipe soal kontrak 1.1 (`MCQ_SINGLE`, `MCQ_MULTI`, `TFNG`, `YNNG`, `FILL_IN_BLANK`, `SHORT_ANSWER`, `MATCHING_DROPDOWN`, `MATCHING_DRAG`, `SENTENCE_REORDER`, `ERROR_RECOGNITION`, `WRITING_TASK`, `SPEAKING_TASK`) |
| `difficulty_min` | int | tidak | 1-5; default 1 |
| `difficulty_max` | int | tidak | 1-5; default 5; harus >= `difficulty_min` |
| `count` | int | ya | 5-40 |
| `mode` | string | ya | `MANUAL` \| `AUTO_WEAKNESS` |
| `seed` | string | tidak | regex `^[A-Za-z0-9_-]{1,64}$` (hanya memengaruhi penarikan soal) |
```json
{ "skills": ["READING", "GRAMMAR"], "question_types": ["TFNG", "MCQ_SINGLE"], "difficulty_min": 1, "difficulty_max": 4, "count": 12, "mode": "MANUAL", "seed": "uji-2026-11-08" }
```
**Response (201):**
| Field | Tipe | Keterangan |
|---|---|---|
| `data.attempt_id` | uuid | attempt `MIX_PRACTICE` baru |
| `data.question_count` | int | sama dengan `count`, kecuali ada paket Reading: jumlah soal sebenarnya (>= `count`, D5.4) |
| `data.mode` | string | `MANUAL`\|`AUTO_WEAKNESS` |
| `data.passage_count` | int | jumlah paket teks Reading yang dibawa (>= 0) |
| `data.ai_item_count` | int | 0-2 (Writing + Speaking) |
```json
{ "data": { "attempt_id": "5b3a8d52-0f0e-4f43-9d1c-77c1f9a1c0de", "question_count": 12, "mode": "MANUAL", "passage_count": 1, "ai_item_count": 0 } }
```
| HTTP | Kode | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body melanggar tabel di atas; `details[].code` mis. `unrecognized_key`, `difficulty_range_invalid`, `too_small`, `too_big`, `invalid_value` |
| 401 | `UNAUTHENTICATED` | Tanpa cookie sesi profil |
| 403 | `CSRF_ORIGIN_MISMATCH` / `HOST_NOT_ALLOWED` | Origin/Host asing |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Bukan `application/json` |
| 422 | `MIX_NOT_ENOUGH_QUESTIONS` | Kapasitas efektif pool (D5.2) < `count`; `details[0] = { path: "count", code: "max_available:<n>", message: "Hanya <n> soal tersedia untuk filter ini." }` |

### GET /api/v1/mix-sessions/active (ditambahkan 2026-11-08, atas permintaan Frontend)
- **Auth:** user. **Sukses:** 200. `data` = `{ attempt_id: uuid, mode: "MANUAL"|"AUTO_WEAKNESS", question_count: int, answered_count: int, started_at: ISO }` bila profil punya attempt `MIX_PRACTICE` `IN_PROGRESS`, selain itu `data: null`. Skema Zod: `ActiveMixSessionResponseSchema` (`src/contracts/mix.ts`).

### Endpoint attempt yang ada (perilaku tambahan untuk `MIX_PRACTICE`)
- `GET /api/v1/attempts/{attempt_id}`: respons sama dengan SPEC-006, ditambah `passages[]` (`{ passage_no, bank_set_id, markdown }`) bila ada soal Reading, dan tiap soal membawa `bank_code` serta `passage_index` (indeks 0-based ke `passages[]`; null bila bukan Reading). `passages[]` berurutan menurut kemunculan pertama pada `questions[]`. `assessment_set_id` NULL, `time_limit_seconds` = 0, `title` = "Latihan campur: N soal (Skill, ...)" atau "Latihan campur otomatis: N soal". Tanpa `rng_seed`, tanpa kunci.
- `GET /api/v1/attempts/{attempt_id}/result`: untuk `MIX_PRACTICE` menambah `data.mix`:
| Field | Tipe | Keterangan |
|---|---|---|
| `mix.per_skill[]` | `{ skill, answered: int, correct: int, percent: number(0-100, 2 desimal) }` | hanya soal objektif yang dijawab |
| `mix.per_question_type[]` | `{ question_type, answered, correct, percent }` | sama |
| `mix.ai_items[]` | `{ question_id, skill: "WRITING"\|"SPEAKING", submission_id: uuid\|null, status: string\|null }` | `submission_id` NULL bila belum dikirim; `status` = `submissions.status` |
| `mix.suggested_banks[]` | `{ bank_code, title, bank_kind, reason: "SKILL_TERLEMAH" }` | maksimal 2 bank `PUBLISHED` dari skill dengan `percent` terendah di sesi ini (minimal 2 soal dijawab; seri = urutan skill `GRAMMAR`,`VOCAB`,`READING`); utamakan bank yang tidak dipakai sesi ini |
`passed`, `band_score` NULL; `points_awarded` 0.
- Semua kode error SPEC-006 (`ATTEMPT_NOT_ACTIVE`, `ATTEMPT_EXPIRED`, `QUESTION_REQUIRES_SUBMISSION`, `NOT_FOUND` untuk attempt milik profil lain) berlaku apa adanya.

## Database Changes
Semua dalam SATU migrasi SQLite baru `codes/drizzle/0002_spec_022_question_banks.sql`, dibuat dengan `drizzle-kit generate` setelah `src/db/schema.ts` diubah, lalu DITINJAU. Tipe mengikuti SPEC-025 D8 (uuid=TEXT, timestamp=INTEGER ms, jsonb/array=TEXT JSON, enum=TEXT).

**Nilai enum baru (hanya TypeScript, tanpa DDL; enum tidak punya CHECK di DB):** `assessmentType` += `QUESTION_BANK`, `MIX_PRACTICE`, `MOCK_TEST`, `TRACK_CHECKPOINT` (tiga nilai terakhir dipakai SPEC-023/021 tetapi didaftarkan SEKALI di sini).

**Tabel yang DIBANGUN ULANG di `0002` (satu-satunya migrasi rebuild; SPEC-021/023 tidak boleh membangun ulang tabel ini lagi):**
1. `assessment_sets` (alasan: CHECK `assessment_sets_scope_chk` harus menerima `QUESTION_BANK`). Semua kolom lama dipertahankan; kolom baru:
   - `bank_code TEXT NULL` + indeks unik parsial `assessment_sets_bank_code_uq` ON (`bank_code`) WHERE `bank_code IS NOT NULL`
   - `bank_kind TEXT NULL` + indeks `assessment_sets_bank_idx` ON (`bank_kind`, `status`) WHERE `bank_kind IS NOT NULL`
   - `exam_module TEXT NOT NULL DEFAULT 'GENERAL_TRAINING'` (bermakna hanya untuk `QUESTION_BANK`)
   - `tags TEXT NOT NULL DEFAULT '[]'` (JSON array string, maksimal 10 elemen, tiap elemen 1-40 karakter)
   - CHECK scope ditambah cabang: `assessment_type = 'QUESTION_BANK' AND bank_code IS NOT NULL AND bank_kind IS NOT NULL AND sub_module_id IS NULL AND module_id IS NULL AND tier_id IS NULL AND parent_set_id IS NULL`
   - Pemetaan impor bank -> kolom: `skill_category`=`skill`, `time_limit_seconds`=0, `questions_json`=`questions`, `question_count`=jumlah soal, `reading_passage_markdown`, `listening_asset_id` (dari `listening_asset_code`), `origin`, `source_id`, `attribution_text`, `content_hash`, `version`, `status`.
2. `attempts` (alasan: `assessment_set_id` harus nullable; kolom baru). Perubahan:
   - `assessment_set_id TEXT NULL` (FK ke `assessment_sets.id`, `ON DELETE RESTRICT` tetap)
   - TAMBAH `assessment_type TEXT NOT NULL` (sebelumnya tipe hanya diturunkan dari set); backfill saat salin data: `assessment_type` = `assessment_sets.assessment_type` dari join set attempt itu
   - `assessment_version INTEGER NOT NULL` tetap NOT NULL (diisi 0 untuk attempt tanpa set)
   - CHECK baru `attempts_set_required_chk`: `assessment_set_id IS NOT NULL OR assessment_type IN ('MIX_PRACTICE','MOCK_TEST','TRACK_CHECKPOINT')`
   - indeks unik `attempts_one_active_uq` (`user_id`,`assessment_set_id`) WHERE `status='IN_PROGRESS' AND assessment_set_id IS NOT NULL`
   - indeks unik parsial baru: `attempts_one_active_mix_uq` (`user_id`) WHERE `status='IN_PROGRESS' AND assessment_type='MIX_PRACTICE'`; `attempts_one_active_mock_uq` (`user_id`) WHERE `status='IN_PROGRESS' AND assessment_type='MOCK_TEST'`; `attempts_one_active_checkpoint_uq` (`user_id`) WHERE `status='IN_PROGRESS' AND assessment_type='TRACK_CHECKPOINT'`
   - indeks `attempts_user_started_idx`, `attempts_user_set_idx`, CHECK `attempts_band_chk` dipertahankan.
3. `attempt_sections` (alasan: PK `(attempt_id, assessment_set_id)` tidak cocok untuk section tanpa set milik SPEC-023). Perubahan:
   - kolom baru `id TEXT PRIMARY KEY` (default UUID SQL seperti tabel lain; baris lama mendapat id baru saat salin)
   - `assessment_set_id TEXT NULL`
   - kolom baru: `time_limit_seconds INTEGER NULL`, `started_at INTEGER NULL`, `deadline_at INTEGER NULL`, `submitted_at INTEGER NULL`
   - indeks unik `attempt_sections_set_uq` (`attempt_id`,`assessment_set_id`) WHERE `assessment_set_id IS NOT NULL`; indeks unik `attempt_sections_skill_uq` (`attempt_id`,`skill`) WHERE `assessment_set_id IS NULL`
   - Koreksi terhadap draf lama SPEC-023: kolom `section_name` TIDAK dibuat (sama dengan `skill`).
   - Semua kode yang memakai target konflik PK komposit lama (`onConflict` pada `attempt_sections`, termasuk `src/server/exams/boss.ts`) WAJIB diubah ke indeks `attempt_sections_set_uq`.
4. Tabel `attempt_answers` TIDAK dibangun ulang: `assessment_set_id` tetap NOT NULL, diisi `bank_set_id` asal soal.

**Aturan migrasi rebuild (wajib, karena migrator saat ini membungkus tiap berkas dalam `BEGIN` dan `PRAGMA foreign_keys` tidak berlaku di dalam transaksi, sehingga `DROP TABLE` memicu `ON DELETE CASCADE` pada anak):**
- Migrator `src/server/db-migrate.ts` diperluas: bila baris pertama berkas migrasi adalah `-- migrator: foreign_keys=off`, ia (a) menyalin berkas DB ke `data/backups/pre-<tag>-<epoch_ms>.db` (`VACUUM INTO`), (b) menjalankan `PRAGMA foreign_keys=OFF` SEBELUM `BEGIN`, (c) menjalankan `PRAGMA foreign_key_check` sebelum `COMMIT` dan `ROLLBACK` + galat bila ada baris hasil, (d) menjalankan `PRAGMA foreign_keys=ON` di blok `finally`.
- `0002` diawali baris penanda itu. Urutan di dalamnya: `DROP VIEW v_publish_blockers`; buat `__new_*` -> `INSERT ... SELECT` -> `DROP` tabel lama -> `ALTER TABLE ... RENAME` -> buat ulang indeks; buat ulang view `v_publish_blockers` (isi sama dengan `0001_publish_blockers_view.sql`).
- Pernyataan `PRAGMA foreign_keys=OFF/ON` yang dibuat drizzle-kit di dalam berkas dihapus (tidak berfungsi dalam transaksi).
- Migrasi diuji pada DB berisi data nyata: baris `attempts`, `attempt_answers`, `attempt_sections`, `assessment_sets`, `submissions` sebelum dan sesudah identik (hitungan dan isi kolom lama).

## UI/UX
Komponen dari `state/knowledge_base/design-system/design-system.md`: Card (5.3), Chip/Badge/Progress/Toast (5.7), Button (5.1), Input/Form (5.2), Kuis/Mesin Soal (5.12), Split-Screen Reading (5.13), Editor Writing (5.15), Radar kategori skill (2.4).
- Halaman `/latihan/campur`: kartu skill (5 kartu: Grammar, Vocab, Reading, Writing, Speaking; bisa multi-pilih), chip tipe soal, penggeser jumlah (5-40, default 10), penggeser kesulitan (1-5, rentang), tombol "Campur otomatis (fokus kelemahan)" (mode `AUTO_WEAKNESS` dengan semua skill dan jumlah terpilih), tombol "Mulai latihan" (mode `MANUAL`). Menu navigasi mendapat tautan "Latihan campur".
- State: memuat (kerangka kartu saat `GET /banks`), kosong (tidak ada bank terbit: teks "Belum ada bank soal. Tambahkan lewat berkas konten."), galat `MIX_NOT_ENOUGH_QUESTIONS` (pesan "Hanya N soal tersedia untuk pilihan ini." dan penggeser dikunci ke N), galat jaringan (Toast + tombol "Coba lagi").
- Runner: pakai ulang runner SPEC-006; bank Reading memakai `ReadingWorkspace`; soal Writing membuka editor penulisan (batas kata 150/250 ditampilkan sebagai petunjuk, tidak memblokir).
- Hasil: rincian per skill dan per tipe soal, daftar "Bank yang disarankan", item AI ("Menunggu penilaian" / "Belum dikirim"). Kartu Speaking: tombol "Salin prompt" + teks "Perkiraan latihan, bukan skor resmi IELTS."
- Teks Indonesia di `src/i18n/id.ts`; ikon + teks, bukan warna saja.

## Acceptance Criteria
Dibuktikan sekarang = dapat diuji otomatis dengan konten yang sudah ada (`codes/content/gt-bank/`) dan fixture.
- [ ] **AC-1** **Given** berkas `codes/content/gt-bank/*.json` **When** `npm run bank:validate -- --dir content/gt-bank` **Then** keluar kode 0 tanpa galat; dan **Given** fixture berisi (a) `question_id` duplikat, (b) `correct_answers` di luar opsi, (c) soal ber-`passage_no` pada bank tanpa `reading_passage_markdown`, (d) `question_id` yang cocok pola slot variasi (`-A`..`-C` atau `-P<n>` di segmen akhir), **Then** keluar kode non-0 dengan galat berturut-turut `duplicate_question_id`, `answer_not_in_options`, `passage_without_text`, `id_reads_as_variant_slot`.
- [ ] **AC-2** **Given** `content/gt-bank/` **When** dihitung per `bank_kind` **Then** ada: Writing T1 3 bank (formal, semi, informal) x 3 soal + T2 9 soal, Speaking P1 9 + P2 6 + P3 6 soal, Reading 2 bank (`READING_GT_S1`, `READING_GT_S2`) x 8 soal, Grammar register >= 16 soal (`question_count` per bank terverifikasi oleh tes).
- [ ] **AC-3** **Given** DB uji berisi bank awal terpublikasi **When** `POST /api/v1/mix-sessions` `{"skills":["GRAMMAR"],"count":10,"mode":"MANUAL","seed":"a1"}` **Then** 201 dan attempt berisi tepat 10 `question_id` unik, semuanya `skill='GRAMMAR'`; dan **Given** `seed` sama dua kali **Then** daftar `question_id` identik.
- [ ] **AC-4** **Given** fungsi `selectMix` dengan pool sintetis (GRAMMAR 50 soal, VOCAB 50 soal MCQ), radar GRAMMAR `estimated_band=4.0` dan VOCAB `estimated_band=8.0`, `count=10`, mode `AUTO_WEAKNESS` **When** dijalankan untuk seed `1..200` **Then** proporsi soal GRAMMAR di seluruh hasil berada di [0,75; 0,92] (harapan teoretis 5/6 = 0,833); dan bila radar kosong proporsi GRAMMAR berada di [0,45; 0,55].
- [ ] **AC-5** **Given** bobot soal **When** satu soal sudah dijawab benar pada dua attempt terakhir profil **Then** bobotnya = 0,3 x bobot normal (diuji unit pada `T_q`), dan `salah_tipe_30h` mengabaikan jawaban lebih lama dari 30 hari (jam uji dikontrol).
- [ ] **AC-6** **Given** `selectMix` dengan pool berisi 1 soal Writing dan 1 Speaking lagi banyak soal objektif, `count=40` **Then** hasil memuat maksimal 1 soal `WRITING_TASK` dan maksimal 1 `SPEAKING_TASK`; **Given** pool hanya berisi 5 soal Writing dan `count=5` **Then** `422 MIX_NOT_ENOUGH_QUESTIONS` dengan `details[0].code = "max_available:1"`.
- [ ] **AC-7** **Given** profil dengan status gatekeeping tertentu (snapshot `user_*_progress`) **When** attempt `MIX_PRACTICE` dibuat, dijawab, dan di-submit **Then** seluruh baris `user_tier_progress`, `user_module_progress`, `user_sub_module_progress` identik dengan sebelumnya, `points_awarded=0`, `passed` NULL, `user_skill_scores` untuk skill yang dijawab (>= 1 soal objektif) terbarui.
- [ ] **AC-8** **Given** respons `GET /api/v1/banks`, `POST /mix-sessions`, `GET /attempts/{id}` (soal belum dijawab) **Then** teks JSON respons tidak memuat string `correct_answers`, `explanation_id`, atau `rng_seed` (tes negatif pada teks JSON respons); `explanation_id` dan hasil benar/salah baru muncul pada respons `PUT .../answers/{question_id}` setelah soal itu dijawab.
- [ ] **AC-9** **Given** pool hanya berisi bank Reading `GT-RD-S1-EVERYDAY` (satu paket, 8 soal) dan `count=5` **When** sesi dibuat **Then** attempt berisi SEMUA 8 soal paket itu (`question_count=8`, lebih besar dari `count` karena paket tidak dipotong, D4) dan `passages[]` memuat teks utuh paket (pemisah `===PASSAGE===` tidak ikut tampil); `passage_count=1`. **Given** pool berisi dua paket Reading (8 + 8 soal) dan `count=12` **Then** paket ke-2 masuk utuh bila soalnya terpilih, `question_count` ∈ {8, 16} sesuai paket yang terbawa, dan `passage_count` = jumlah paket terbawa (1 atau 2); setiap `question_id` Reading dalam attempt memiliki teks paketnya di `passages[]`.
- [ ] **AC-10** **Given** bank berstatus `DRAFT`, atau bank Listening berstatus `PUBLISHED` **When** `GET /banks` dan `POST /mix-sessions` **Then** bank `DRAFT` tidak muncul/tidak terpilih; bank Listening muncul dengan `selectable_in_mix=false` dan tidak pernah terpilih.
- [ ] **AC-11** **Given** fixture bank Listening **When** `bank:validate` **Then** (a) tanpa `listening_asset_code` dan tanpa `pending_audio` -> `listening_asset_required`; (b) `listening_asset_code` tak terdaftar -> `listening_asset_unregistered`; (c) `pending_audio:true` valid dan setelah `content:import --publish` barisnya `status='DRAFT'`; (d) bank non-Listening ber-`pending_audio` -> `listening_field_not_allowed`.
- [ ] **AC-12** **Given** `content:import` dijalankan dua kali tanpa perubahan berkas **Then** run kedua melaporkan semua bank `NOOP`; **Given** satu soal diubah **Then** bank itu `UPDATE` dan `assessment_sets.version` naik 1.
- [ ] **AC-13** **Given** satu attempt `MIX_PRACTICE` `IN_PROGRESS` **When** `POST /mix-sessions` kedua dipanggil **Then** attempt lama berstatus `ABANDONED` dan hanya ada satu `IN_PROGRESS` (indeks `attempts_one_active_mix_uq` menolak yang kedua bila transaksi dilanggar).
- [ ] **AC-14** **Given** DB hasil migrasi `0001` berisi data attempt/jawaban/submission/section **When** `0002` diterapkan **Then** hitungan baris tabel `attempts`, `attempt_answers`, `attempt_sections`, `assessment_sets`, `submissions`, `user_last_learned_state` tidak berubah, `PRAGMA foreign_key_check` kosong, file cadangan `data/backups/pre-0002_spec_022_question_banks-*.db` ada, dan `attempts.assessment_type` terisi sama dengan tipe set asalnya.
- [ ] **AC-15** Tes endpoint-guards memuat `GET /api/v1/banks` dan `POST /api/v1/mix-sessions` (tanpa cookie -> 401); unit `selectMix`, integrasi migrasi, dan integrasi alur mix (MANUAL dan AUTO_WEAKNESS) lulus; E2E Playwright satu alur MANUAL + satu alur AUTO lulus.
- [ ] **AC-16** **Given** sesi dengan 1 soal Writing **When** `POST /api/v1/submissions/writing` dengan `attempt_id`, `question_id`, `kind` sesuai bank **Then** 202 (SPEC-012) dan item muncul di `mix.ai_items` dengan `submission_id` terisi; `kind` yang tidak cocok dengan `task_kind` soal -> `409 QUESTION_TYPE_MISMATCH`; pengiriman setelah `POST /attempts/{id}/submit` -> `409 ATTEMPT_NOT_ACTIVE`.

## Edge Cases & Validation
- Filter menghasilkan kapasitas < `count`: `422 MIX_NOT_ENOUGH_QUESTIONS`, `details[0].code = "max_available:<n>"`.
- `skills` memuat `LISTENING` atau `bank_kinds` memuat `LISTENING_GT_S*`: `400 VALIDATION_ERROR`, `details[].code = "invalid_value"`.
- `difficulty_min > difficulty_max`: `400 VALIDATION_ERROR`, `details[0].code = "difficulty_range_invalid"`.
- `count` di luar 5-40 atau non-integer: `400 VALIDATION_ERROR`, `details[0].code = "too_small"`/`"too_big"`/`"invalid_type"`.
- Bank Reading terpilih tetapi tidak muat dalam `count`: paket tetap dibawa utuh (teks + semua soal paketnya) dan jumlah soal akhir dapat melebihi `count` (D5.4); paket tidak pernah dipotong.
- Bank non-`PUBLISHED` atau `pending_audio` tidak pernah terpilih.
- Pengguna tanpa riwayat/radar: `AUTO_WEAKNESS` memakai bobot seragam (D5.3).
- Attempt `MIX_PRACTICE` milik profil lain diakses: `404 NOT_FOUND`.
- Bank diperbarui (versi naik) saat attempt `IN_PROGRESS`: attempt memakai snapshot di `state`, tidak terpengaruh.
- Submit sesi tanpa satu pun jawaban objektif: tetap `GRADED` dengan `scorePercent=0`; radar tidak berubah.
- Skor Writing/Speaking tidak masuk `scorePercent` attempt; menyusul lewat `evaluationGradedHooks`.

## Status Implementasi
| Area | Status | Catatan |
|---|---|---|
| Kontrak bank (Zod `question-bank.ts`: kind Listening, `listening_asset_code`, `pending_audio`) | not_started | |
| `bank:validate` (4 aturan AC-1 + aturan Listening D7) | not_started | skrip dan `src/server/content/bank-validate.ts` sudah ada dari ADR-004; perlu audit terhadap AC-1 |
| `content:import` untuk `question_banks[]` | not_started | |
| Migrator diperluas + migrasi `0002` | not_started | |
| `src/server/mix/*` (pemilih, layanan, handler `MIX_PRACTICE`) | not_started | |
| `GET /banks`, `POST /mix-sessions`, perluasan endpoint attempt | not_started | |
| UI `/latihan/campur`, hasil, kartu Speaking | not_started | |
| Konten bank awal (AC-2) | in_progress | berkas ada dari ADR-004; belum diaudit terhadap AC-2 |
| Tes (unit, integrasi, guards, E2E) | not_started | |

## Keputusan Analyst (butir 1, 2, 3, 5 disetujui human 2026-11-08; butir 4 dan 6 MENUNGGU konfirmasi human)
1. Sesi `MIX_PRACTICE` tidak memberi poin/mahkota/streak (`points_awarded=0`).
2. Memulai sesi campuran baru otomatis mem-`ABANDON` sesi campuran `IN_PROGRESS` lama (bukan error).
3. Bank Listening tidak dapat dipilih di Mix Builder pada versi ini.
4. [menunggu konfirmasi human] Bobot `AUTO_WEAKNESS`: `W_skill = max(9.0 - estimated_band, 0.5)`; skill tanpa skor memakai rata-rata gap skill lain; tipe non-objektif (Writing/Speaking) berbobot tipe 1.
5. Soal tanpa `difficulty` dianggap tingkat 3 untuk filter kesulitan.
6. [menunggu konfirmasi human; konsekuensi teknis] Kolom `attempts.assessment_type` ditambahkan (draf lama menganggapnya sudah ada), dan `attempt_sections.section_name` tidak dibuat (diganti `skill`).

## Human Approval
- [x] Disetujui human (2026-11-08) — substansi produk
- [x] Human mengonfirmasi butir "Keputusan Analyst" apa adanya (2026-11-08, via AskUserQuestion); koreksi AC-9 vs D4: D4 menang

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
| 2026-11-08 | Human | Draf disetujui apa adanya (build-feature, depth standard) |
| 2026-11-08 | Backend | Aditif (permintaan Frontend, change-management): `GET /mix-sessions/active`; `passage_index` pada soal publik; judul bermakna dan `time_limit_seconds = 0` terdokumentasi pada `GET /attempts/{id}` `MIX_PRACTICE`; kode galat validasi `mix-sessions` dipetakan ke token spec (`too_small`/`too_big`/`invalid_value`/`difficulty_range_invalid`); kode validator `variant_slot_id` diganti `id_reads_as_variant_slot` dan ditambah `passage_without_text` (AC-1) |
| 2026-11-08 | Analyst | Revisi teknis menyelaraskan SPEC-025/ADR-005 (niat produk tidak diubah): hapus rujukan `/admin/*` dan importer admin (diganti CLI `bank:validate` + `content:import`); `Depends on` SPEC-019/020 diganti SPEC-025; migrasi Postgres `0009` diganti `0002` SQLite dengan rebuild tabel `assessment_sets`, `attempts`, `attempt_sections` (dijadwalkan SEKALI di sini untuk 021/023) dan aturan migrator `foreign_keys=off`; tipe Postgres (`text[]`, enum) dipetakan ke SQLite; tambah `attempts.assessment_type`; definisi AUTO_WEAKNESS lengkap (bobot skill tanpa skor, tipe non-objektif), paket Reading, batas Writing/Speaking, skema `state` `mix.v1`; API Contract penuh (`GET /banks`, `POST /mix-sessions`, perluasan attempt); kontrak bank Listening (`listening_asset_code`, `pending_audio`) untuk SPEC-024; AC diperluas dari 6 ke 16 (pemetaan: AC lama 1 -> AC-1, 2 -> AC-2, 3 -> AC-3/4/6, 4 -> AC-7, 5 -> AC-8, 6 -> AC-15); tambah Status Implementasi dan "Keputusan Analyst" |
| 2026-11-08 | Analyst | Atas keputusan human: butir "Keputusan Analyst" disetujui apa adanya (label diubah); AC-9 vs D4 diselesaikan dengan D4 menang: paket Reading selalu utuh (teks + semua soal `passage_no`), tidak dipotong; jumlah soal akhir dapat melebihi `count`, `passage_count` = jumlah paket terbawa; D5.4, `question_count` pada respons, AC-9, dan edge case disesuaikan. Tidak ada perubahan path/field pada `_api-contract.md` (hanya semantik `question_count`) |
| 2026-11-08 | Orchestrator | Koreksi catatan persetujuan: hanya butir 1, 2, 3, 5 yang ditampilkan dan disetujui human; butir 4 (bobot AUTO_WEAKNESS) dan 6 (skema) menunggu konfirmasi |
