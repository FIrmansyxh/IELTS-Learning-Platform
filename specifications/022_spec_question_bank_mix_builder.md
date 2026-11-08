# SPEC-022: Bank Soal Modular dan Mix Builder (IELTS General Training)

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-004)
- **Created:** 2026-11-08
- **Status:** draft (menunggu persetujuan human)
- **Depends on:** SPEC-004, SPEC-006, SPEC-017, SPEC-019, SPEC-020
- **Prioritas:** P1
- **Cakupan:** Konten (kontrak bank soal v1.0, bank awal GT) + Backend (impor bank, pemilih soal campuran, attempt campuran) + Frontend (Mix Builder)

## User Story
Sebagai Learner IELTS General Training, saya ingin latihan dari banyak modul soal yang bisa saya pilih dan campur (skill, tipe soal, kesulitan, jumlah), atau dicampur otomatis berdasarkan kelemahan saya, sehingga latihan saya bervariasi dan menyasar area yang paling butuh perbaikan.

## Non-Goals / Out of Scope
- LLM TIDAK membuat soal; semua soal ditulis/dikurasi lalu diimpor (ADR-004). LLM hanya menilai jawaban Writing.
- Tidak ada penilaian otomatis Speaking pada MVP (SPEC-013 ditunda); soal Speaking dilatih lewat prompt AI eksternal (tombol "Salin prompt").
- Tidak ada soal Listening sebelum audio orisinal tersedia (bank Listening ditandai `PENDING_AUDIO`).
- Bank tidak menggantikan Active Drill/Boss; bank adalah sumber tambahan untuk latihan campuran.
- Tidak ada konten Academic (grafik/peta/diagram, AWL) di bank GT.

## Definisi Tetap
**D1. Bank soal** = kumpulan soal bertema satu `bank_kind` untuk satu skill, dengan metadata. `exam_module` selalu `GENERAL_TRAINING`.
**D2. Taksonomi `bank_kind` awal:**
| Skill | `bank_kind` | Isi |
|---|---|---|
| READING | `READING_GT_S1` | Teks sosial sehari-hari (iklan, pengumuman, brosur, jadwal) |
| READING | `READING_GT_S2` | Teks ketenagakerjaan (lowongan, kebijakan, kontrak, pelatihan) |
| READING | `READING_GT_S3` | Teks umum panjang (artikel majalah/surat kabar) |
| WRITING | `WRITING_GT_T1_FORMAL` / `_SEMI` / `_INFORMAL` | Soal surat per register |
| WRITING | `WRITING_GT_T2` | Soal esai (opinion, discussion, problem-solution, two-part) |
| SPEAKING | `SPEAKING_P1` / `P2` / `P3` | Soal wawancara, cue card, diskusi |
| GRAMMAR | `GRAMMAR_GT_REGISTER` | Register surat, frasa pembuka/penutup, tata bahasa untuk surat |
| VOCAB | `VOCAB_GT_EVERYDAY` | Kosakata situasi sehari-hari dan kerja |
| LISTENING | `LISTENING_GT_S1..S4` | `PENDING_AUDIO` |
**D3. Item bank** memakai skema soal yang sama dengan kontrak konten 1.1 (`QuestionSchema`), sehingga mesin soal SPEC-006 tidak berubah. ID soal `Q-<KIND>-<NNN>` (tanpa segmen satu huruf A-C atau `P<n>` agar tidak terbaca sebagai slot variasi paket).
**D4. Reading** : bank membawa `reading_passage_markdown` (pemisah `===PASSAGE===`) dan soal dengan `passage_no`. Menyertakan satu bank Reading ke campuran berarti membawa SELURUH teksnya.
**D5. Mix.** Permintaan campuran = `{ skills[], bank_kinds[], question_types[], difficulty_min/max, count (5-40), mode: MANUAL|AUTO_WEAKNESS, seed? }`.
- `MANUAL`: pemilihan acak seragam dari soal yang cocok.
- `AUTO_WEAKNESS`: bobot skill = (10 - skor radar skill)/jumlah; bobot tipe soal = 1 + tingkat salah 30 hari terakhir (SPEC-017/attempt_answers); soal yang sudah benar 2x berturut-turut diberi bobot 0,3.
- Tidak ada duplikat dalam satu sesi; Writing/Speaking maksimal 1 tiap sesi campuran (dijawab lewat submission, bukan drill).
**D6. Attempt campuran** bertipe `MIX_PRACTICE`: tidak berbatas lulus/gagal, tidak memengaruhi gatekeeping; memberi umpan balik instan, hasil per skill/tipe, dan menulis ke `user_skill_scores` (radar) seperti drill biasa.

## Technical Flow
1. Admin mengimpor paket bank (`question_banks[]`, kontrak bank 1.0) lewat importer SPEC-019 (validasi, pratinjau, publikasi, rollback). Sampai importer diperluas, CLI `npm run bank:validate -- --dir content/gt-bank` memvalidasi berkas.
2. Learner membuka Mix Builder (`/latihan/campur`): memilih skill/tipe/jumlah atau "Campur otomatis".
3. `POST /api/v1/mix-sessions` memilih soal (D5), membekukan snapshot soal ke attempt `MIX_PRACTICE`, mengacak opsi dengan seed CSPRNG rahasia (seperti SPEC-006).
4. Jawaban lewat endpoint attempt yang ada; submit menghasilkan ringkasan dan memperbarui skor skill.
5. Soal Writing di campuran membuka editor dan dikirim ke evaluasi LLM (SPEC-012); soal Speaking menampilkan kartu "Salin prompt" (ADR-004).

## API Contract (ringkas; rinci diisi saat approval)
- `GET /api/v1/banks` -> daftar bank terpublikasi + jumlah soal per tipe (tanpa kunci jawaban).
- `POST /api/v1/mix-sessions` body `{ skills?, bank_kinds?, question_types?, difficulty_min?, difficulty_max?, count, mode }` -> `{ attempt_id, question_count }`. Kesalahan: `422 MIX_NOT_ENOUGH_QUESTIONS` bila bank terpilih kurang dari `count`.
- Admin: impor bank lewat `POST /api/v1/admin/import-batches` (kontrak diperluas), `GET /api/v1/admin/banks`.
Semua rute `auth: 'user'`/`'admin'` eksplisit dan masuk tes endpoint-guards.

## Database Changes
- `assessment_sets.set_type` ditambah nilai `QUESTION_BANK`; kolom `bank_kind text null`, `exam_module text default 'GENERAL_TRAINING'`, `tags text[]`.
- `attempts.assessment_type` ditambah `MIX_PRACTICE`; `attempts.assessment_set_id` boleh `null` untuk `MIX_PRACTICE` dengan snapshot soal di `attempt_state` (backend WAJIB memverifikasi batasan NOT NULL dan FK yang ada sebelum migrasi).
- Migrasi: `0009_spec_022_question_banks.sql` (aditif).

## UI/UX
- Mix Builder: kartu skill, pilihan tipe soal (chip), penggeser jumlah, tombol "Campur otomatis (fokus kelemahan)".
- Hasil: rincian per skill dan tipe soal, saran bank berikutnya.
- Kartu Speaking: tombol "Salin prompt" + disclaimer "Perkiraan latihan, bukan skor resmi IELTS."

## Acceptance Criteria
1. `bank:validate` menerima bank GT awal di `codes/content/gt-bank/` tanpa galat dan menolak: ID duplikat, jawaban di luar opsi, `passage_no` tanpa teks, ID yang terbaca sebagai slot variasi.
2. Bank awal mencakup: Writing T1 (3 register x 3) + T2 x 9, Speaking P1 x 9 + P2 x 6 + P3 x 6, Reading 2 teks x 8 soal, Grammar register >= 16 soal.
3. `POST /mix-sessions` mode `MANUAL` mengembalikan tepat `count` soal unik sesuai filter; mode `AUTO_WEAKNESS` memilih skill terlemah lebih sering (uji statistik dengan seed tetap).
4. Attempt `MIX_PRACTICE` tidak mengubah status gatekeeping/Boss.
5. Kunci jawaban tidak pernah ada di respons bank/mix sebelum soal dijawab.
6. Tes endpoint-guards, unit pemilih campuran, dan integrasi migrasi lulus.

## Edge Cases & Validation
- Filter menghasilkan < `count` soal: `422 MIX_NOT_ENOUGH_QUESTIONS` dengan jumlah tersedia.
- Bank Reading terpilih tetapi tidak muat dalam `count`: teks dibawa utuh dan soal dipotong per teks, bukan dipisah dari teksnya.
- Soal `PENDING_AUDIO` tidak pernah dipilih.
- Pengguna tanpa riwayat: `AUTO_WEAKNESS` memakai bobot seragam.
- Konten bank berstatus bukan `PUBLISHED` tidak muncul bagi learner.

## Human Approval
- [ ] Disetujui human (belum)

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
