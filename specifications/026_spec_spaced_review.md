# SPEC-026: Ulangi Soal yang Salah (Pengulangan Berjarak)

Status: Draft (diimplementasikan atas permintaan human 2026-11-11, backlog C-29). Bergantung pada SPEC-006 (mesin soal) dan SPEC-022 (Mix Builder).

## 1. Latar

Tinjauan Dunlosky dkk. (2013) menilai dua teknik belajar berutilitas tinggi: latihan soal dan latihan berjarak. Platform sudah kuat di latihan soal, tetapi soal yang dijawab salah tidak pernah dijadwalkan muncul lagi. Spec ini menambahkan penjadwalan ulang otomatis untuk soal objektif yang dijawab salah.

## 2. Keputusan

**D1. Sumber.** Jawaban ber-`is_correct` (bukan NULL) dari attempt bertipe `ACTIVE_DRILL` dan `MIX_PRACTICE`, dibaca saat attempt selesai (`GRADED`/`EXPIRED`) lewat `attemptCompletedHooks`. Tipe ujian (Boss, Skip, Placement, Simulasi, Checkpoint) tidak dijadwalkan agar soal ujian tidak bocor ke latihan.

**D2. Soal yang bisa diulang (mandiri).** Soal memenuhi semua syarat: set asalnya tidak punya `reading_passage_markdown` dan tidak punya `listening_asset_id`; `skill` soal bukan `LISTENING`, `WRITING`, `SPEAKING`; `passage_no` kosong. Soal yang bergantung pada bacaan atau audio tidak dijadwalkan pada versi ini.

**D3. Penjadwal Leitner 5 kotak.** Interval kotak 1..5 = 1, 3, 7, 14, 30 hari.
- Jawaban salah: kotak = 1, `due_at = sekarang + 1 hari`, `lapses + 1`, `mastered_at = NULL` (berlaku juga untuk soal yang sudah dikuasai).
- Jawaban benar, soal terjadwal, dan `sekarang >= due_at`: kotak 5 menjadi dikuasai (`mastered_at = sekarang`, `due_at = NULL`); kotak lain naik satu dan `due_at = sekarang + interval kotak baru`.
- Jawaban benar sebelum jatuh tempo: jadwal tidak berubah (jeda adalah intinya).
- Jawaban benar untuk soal yang belum pernah salah: tidak membuat jadwal.
- Kunci jadwal: `(user_id, assessment_set_id, question_id)`.

**D4. Sesi ulang.** `POST /api/v1/mix-sessions` dengan `mode: "REVIEW_DUE"` membuat attempt `MIX_PRACTICE` berisi soal jatuh tempo (`due_at <= sekarang`, belum dikuasai), urut `due_at` naik lalu `question_id`, paling banyak `count` soal. `count` di mode ini adalah batas atas, bukan syarat minimum; filter lain diabaikan. Soal diambil dari set asalnya versi sekarang; jadwal yang soalnya sudah tidak ada atau setnya tidak `PUBLISHED` dihapus saat itu. Tanpa soal jatuh tempo: `MIX_NOT_ENOUGH_QUESTIONS` dengan `max_available:0`.

**D5. Ringkasan.** `GET /api/v1/me/reviews` mengembalikan `{ due_count, scheduled_count, mastered_count, next_due_at }`.

**D6. UI.** Kartu "Ulangi soal yang salah" di Latihan campur: jumlah jatuh tempo, jumlah terjadwal, jumlah dikuasai, tombol "Ulangi N soal" (maks. 20 per sesi). Bila tidak ada yang jatuh tempo, tombol nonaktif dan kartu menampilkan kapan soal berikutnya jatuh tempo.

## 3. Data

Tabel baru `question_reviews` (migrasi `0004_spec_026_question_reviews`): `id`, `user_id` (FK users, cascade), `assessment_set_id` (FK assessment_sets, cascade), `question_id`, `skill`, `box` (1..5), `due_at`, `lapses`, `last_answered_at`, `mastered_at`, `created_at`, `updated_at`. Indeks unik `(user_id, assessment_set_id, question_id)`; indeks `(user_id, due_at)`.

## 4. Acceptance Criteria

- [ ] Menjawab salah soal mandiri di Active Drill lalu submit membuat jadwal kotak 1 jatuh tempo +1 hari; soal ber-bacaan, Writing, dan Speaking tidak dijadwalkan.
- [ ] Menjawab benar soal terjadwal setelah jatuh tempo menaikkan kotak (1 -> 2 -> 3 -> 4 -> 5 -> dikuasai) dengan interval 3, 7, 14, 30 hari; menjawab benar sebelum jatuh tempo tidak mengubah jadwal.
- [ ] Menjawab salah lagi mengembalikan soal ke kotak 1 dan menambah `lapses`.
- [ ] `GET /me/reviews` menghitung jatuh tempo, terjadwal, dikuasai, dan `next_due_at` dengan benar.
- [ ] `POST /mix-sessions {mode:"REVIEW_DUE"}` hanya berisi soal jatuh tempo, paling banyak `count`; tanpa soal jatuh tempo mengembalikan `MIX_NOT_ENOUGH_QUESTIONS`.
- [ ] Attempt ujian (Boss, Simulasi, Checkpoint) tidak membuat jadwal.

## 5. Batasan versi ini

- Hanya soal mandiri (D2); Reading ber-bacaan dan Listening belum.
- Penjadwal Leitner tetap, bukan FSRS; tidak menyesuaikan diri per pengguna.
- Jawaban pada attempt yang ditinggalkan (`ABANDONED`) tidak dihitung.
