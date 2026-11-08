# SPEC-023: Simulasi Tes IELTS General Training dengan Pilihan Section

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-004)
- **Created:** 2026-11-08
- **Status:** draft (menunggu persetujuan human)
- **Depends on:** SPEC-006, SPEC-009 (+ tabel band Reading General), SPEC-011, SPEC-012, SPEC-013 (addendum), SPEC-014, SPEC-017, SPEC-022, SPEC-024
- **Prioritas:** P1
- **Cakupan:** Backend (perakit tes, attempt multi-section, penilaian gabungan) + Frontend (pemilih section, runner, hasil) + Konten (bank soal GT per format ujian)

## User Story
Sebagai Learner IELTS General Training, saya ingin memulai simulasi tes dengan memilih section yang saya mau (Listening, Reading, Writing, Speaking, boleh sebagian atau lengkap), sehingga saya dapat berlatih kondisi ujian yang realistis sesuai kebutuhan hari itu, dan mendapat band per section serta Overall bila lengkap.

## Non-Goals / Out of Scope
- Tidak menggantikan Boss Stage (SPEC-014): Boss tetap gerbang Tier; simulasi bebas gerbang dan tidak membuka/mengunci apa pun.
- Tidak ada skor resmi: semua tampilan memuat "Perkiraan latihan, bukan skor resmi IELTS."
- Tidak ada tes Academic (grafik/peta/diagram).
- Tidak ada proctoring atau pembatasan perangkat.
- Speaking tidak dinilai otomatis pada MVP; dinilai lewat prompt AI eksternal dan input skor (SPEC-013 addendum).

## Definisi Tetap
**D1. Section dan format General Training.**
| Section | Isi | Waktu | Penilaian |
|---|---|---|---|
| LISTENING | 4 bagian, 40 soal, audio diputar sekali | 30 menit + 2 menit periksa | otomatis, tabel band Listening |
| READING | 3 section, 40 soal | 60 menit | otomatis, tabel band **Reading General** |
| WRITING | Task 1 (surat, >= 150 kata) + Task 2 (esai, >= 250 kata) | 60 menit total | LLM lokal; band Writing = (Task 1 x 1 + Task 2 x 2) / 3, dibulatkan ke 0,5 |
| SPEAKING | Part 1, 2, 3 | ±11-14 menit | prompt AI eksternal + input skor manual |
**D2. Pilihan section.** Learner memilih himpunan tak kosong dari {LISTENING, READING, WRITING, SPEAKING}. Urutan eksekusi tetap: Listening -> Reading -> Writing; Speaking dilakukan terpisah (kapan saja setelah/sebelum) karena memakai AI pihak ketiga.
**D3. Perakitan soal.** Server merakit tes dari bank soal GT terpublikasi (SPEC-022) sesuai D1, tanpa mengulang soal yang sudah muncul di simulasi sebelumnya milik pengguna bila stok cukup. Reading: tiga teks berurutan makin sulit. Soal dibekukan (snapshot) pada attempt.
**D4. Band.**
- Per section selalu ditampilkan.
- Overall (rata-rata empat band, dibulatkan ke 0,5 terdekat; x.25 naik ke x.5, x.75 naik ke bilangan bulat berikutnya) hanya ditampilkan bila KEEMPAT section selesai dinilai. Selain itu tampil "Overall parsial: dipilih {n} dari 4 section" dan rata-rata indikatif.
- Speaking menunggu input skor; hasil ditampilkan "Menunggu skor Speaking" sampai diisi.
**D5. Dampak ke radar.** Hasil simulasi memperbarui skor skill terkait (SPEC-017) sama seperti latihan, dan tercatat di Riwayat Ujian.
**D6. Pemulihan.** Attempt tersimpan; refresh halaman memulihkan section aktif dan sisa waktu dari server (pola SPEC-014).

## Technical Flow
1. `GET /api/v1/simulations/options` -> section tersedia (ketersediaan konten per section: Listening butuh audio).
2. `POST /api/v1/simulations` body `{ sections: ["READING","WRITING"] }` -> `{ attempt_id, sections: [{ section, time_limit_seconds, question_count }] }`.
3. Runner memakai mesin attempt multi-section (SPEC-014) per section; timer di server.
4. Submit section menilai otomatis (Listening/Reading) atau mengantre LLM (Writing); Speaking membuka kartu prompt + form skor.
5. `GET /api/v1/simulations/{attempt_id}/result` -> band per section, Overall bila lengkap, status penilaian.

## API Contract (ringkas; rinci diisi saat approval)
- `POST /api/v1/simulations` body strictObject `{ sections: SectionName[] }` (1-4 unik). Error: `422 SIMULATION_NOT_ENOUGH_CONTENT` (detail section yang kurang), `409 SIMULATION_IN_PROGRESS`.
- `GET /api/v1/simulations/{attempt_id}` , `.../result`, `POST .../sections/{section}/start|submit`.
- Skor Speaking memakai `POST /submissions/speaking-external` dengan `attempt_id` simulasi.
- Semua rute `auth: 'user'`; masuk tes endpoint-guards.

## Database Changes
- `attempts.assessment_type` + nilai `MOCK_TEST`; `attempts.assessment_set_id` nullable untuk `MOCK_TEST` (snapshot soal di state; wajib diverifikasi terhadap batasan NOT NULL/FK sebelum migrasi).
- `attempt_sections` dipakai ulang (satu baris per section terpilih), ditambah kolom `section_name`.
- `band_table_skill` + nilai `READING_GENERAL`: SUDAH diimplementasikan (migrasi `0008_spec_023_reading_general_band`, seed `v1-gt-2026-11`; jangkar 30/40 = 6.0, 34/40 = 7.0, 40/40 = 9.0; tepi bawah perkiraan dan dapat diedit admin). Semua perhitungan band Reading memakai `READING_BAND_SKILL`.
- Migrasi simulasi: `0010_spec_023_simulation.sql` (belum dibuat).

## UI/UX
- Halaman `/simulasi`: empat kartu section (centang), ringkasan total waktu, tombol "Mulai simulasi"; preset cepat "Lengkap", "Reading + Writing", "Writing saja".
- Runner bermode ujian tenang (design-system 5.19), timer per section, tanpa gamifikasi.
- Hasil: band per section, Overall (atau parsial), disclaimer, tautan "Masukkan skor Speaking".

## Acceptance Criteria
1. Memilih {READING, WRITING} membuat attempt hanya dengan dua section itu; Overall tidak ditampilkan, ada label parsial.
2. Memilih keempat section menampilkan Overall setelah keempatnya bernilai; Speaking tertahan sampai skor dimasukkan.
3. Band Reading memakai tabel `READING_GENERAL`; 34/40 = 7.0 dan 30/40 = 6.0.
4. Band Writing = (T1 + 2 x T2) / 3 dibulatkan ke 0,5.
5. Kekurangan konten memberi `422` dengan daftar section; Listening tidak dapat dipilih sampai ada audio.
6. Refresh memulihkan section dan sisa waktu dari server.
7. Tes unit (perakit, band gabungan), integrasi (alur dua section), dan endpoint-guards lulus.

## Edge Cases & Validation
- Hanya satu simulasi `IN_PROGRESS` per pengguna.
- Section yang waktunya habis dikirim otomatis; jawaban Writing yang kosong dinilai band 0 untuk section itu dan tidak dikirim ke LLM.
- LLM tidak tersedia: Writing masuk fallback nilai-sendiri; hasil diberi label "tidak terverifikasi".
- Bank soal kurang dari 40 soal untuk Reading/Listening: section tidak ditawarkan.

## Human Approval
- [ ] Disetujui human (belum)

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
