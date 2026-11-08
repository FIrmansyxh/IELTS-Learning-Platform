# QA Report TASK-021: Jalur Belajar (Learning Track) dan Gaya Penyampaian Materi

Tanggal: 2026-11-08; dikoreksi pasca-audit 2026-11-09  
Spec: `specifications/021_spec_learning_tracks.md`  
Task: `task/TASK-021_learning-tracks/TASK-021_learning-tracks.md`  
Hasil Akhir: **TIDAK SELURUHNYA TERBUKTI** (13 AC PASS, 6 AC SEBAGIAN; lihat tabel)

> Koreksi 2026-11-09: versi awal laporan ini memakai penomoran AC yang tidak sama dengan spec, menyebut tiga jalur `GT-SPRINT-30`/`GT-BAND7-FOCUSED` yang tidak ada, dan menandai semua AC PASS padahal tidak ada tes yang merujuk AC-6, 8, 9, 13, 14, 15, 19. Tabel di bawah ditulis ulang mengikuti AC-1..AC-19 di spec. Aturan: PASS hanya bila ada tes yang merujuk (berkas: nama tes); bagian tanpa tes ditulis "tidak terbukti".

---

## 1. Ringkasan
Fitur diimplementasikan di backend dan frontend. Jalur bawaan ada EMPAT (`GT-STRUCT`, `GT-WRITING`, `GT-READING`, `GT-SPRINT-4W`), dari `codes/content/gt-tracks/tracks.json`, disemai modul seed `learning-tracks` di `codes/scripts/seed.ts` lewat `codes/src/server/content/tracks-import.ts`. (Tidak ada `codes/src/server/seeds/learning-tracks.ts`.)

Pasca-audit ditemukan dan diperbaiki 3 bug (rincian di `dev_log.md`, bagian "Tes tambahan pasca-audit"): validator konten tidak menerapkan aturan jalur (AC-14), drill PRACTICE_FIRST menyelesaikan sub-modul tanpa belajar (AC-15), `content:import` pada folder `content/gt-tracks` selalu gagal (AC-19).

---

## 2. Matriks Verifikasi Acceptance Criteria (nomor AC = nomor di spec)

Singkatan: `T` = `codes/tests/integration/tracks.itest.ts`, `TA` = `codes/tests/integration/tracks-ac.itest.ts`, `U` = `codes/tests/unit/learning-tracks.test.ts`, `UA` = `codes/tests/unit/learning-tracks-ac.test.ts`.

| AC | Inti kriteria | Status | Bukti (berkas: nama tes) / yang tidak terbukti |
|---|---|---|---|
| AC-1 | 4 jalur berurutan, total_sub_modules 31/15/7/20, checkpoint_count 0/3/2/4 | PASS | T: `AC-1 & AC-17: GET /api/v1/tracks > mengembalikan tepat 4 jalur PUBLISHED...`. Catatan: urutan item GT-STRUCT dan ketiadaan `3.3.1`/`4.1.1` hanya terbukti lewat jumlah 31, tidak dicek per kode |
| AC-2 | ganti jalur 204, progres identik, kode tak dikenal 404 | PASS | T: `AC-2: PUT /api/v1/me/active-track...`; TA: `AC-2: PUT /me/active-track tidak mengubah baris progres sub-modul profil itu` |
| AC-3 | progres bersama antar jalur | PASS | TA: `AC-3: seed + progres bersama ... menyelesaikan 2.2.2 saat GT-WRITING aktif...` |
| AC-4 | sekuensial `2.1.4` walau `2.1.3` belum, tetap UNLOCKED saat ganti ke GT-STRUCT | SEBAGIAN | U: `membuka sub-modul berikutnya di jalur saat sub-modul sebelumnya selesai...` (logika generik, fixture sintetis). Tidak terbukti: skenario `2.1.2`->`2.1.4` lewat `recomputeStatuses` DB dan "tidak mengunci ulang" setelah ganti jalur |
| AC-5 | `?style=` dengan varian, fallback tanpa varian, pewarisan bagian kosong | PASS | TA: `AC-5: ?style=PRACTICE_FIRST dengan varian...`, `AC-5: gaya diminta tanpa varian...`. Catatan: respons memakai `data.material` (spec menulis `data.learn`) |
| AC-6 | 5 rute 401 tanpa cookie; unit `trackStatus`; integrasi migrasi 0003 + seed + progres bersama; E2E Playwright | SEBAGIAN | TA: `AC-6: kelima rute baru menolak tanpa cookie dengan 401`; UA: `AC-6: ... dibungkus withApi({ auth: 'user' })` (5 tes); UA: `AC-6: gatekeeping per jalur (trackStatus)...`; TA: `AC-6: migrasi 0003 aditif...`; TA: `AC-3: seed + progres bersama...`. Tidak terbukti: E2E Playwright "ganti jalur, progres tetap" (tidak ada di `tests/e2e`; setara tingkat API: TA `AC-2: ...`) |
| AC-7 | Tier 2 LOCKED: pohon TIER_LOCKED, GET 403, status tersimpan LOCKED | PASS | TA: `AC-7: Tier 2 LOCKED di GT-WRITING...`; U: `AC-7 & D5: Tier LOCKED menahan sub-modul tetap LOCKED di semua jalur`; T: `AC-7: Tier 2 LOCKED menahan item 2.1.1...` |
| AC-8 | Boss Tier 1 lulus -> `2.1.1` UNLOCKED di jalur manapun; item pertama Tier terkunci di SPRINT/READING LOCKED | PASS | TA: `AC-8: jalur aktif %s...` (4 jalur), `AC-8: GT-SPRINT-4W dan GT-READING: item pertama yang berada di Tier terkunci tetap LOCKED (TIER_LOCKED)` |
| AC-9 | `boss.*`/`skip_test.*` identik antar jalur; tanpa item Boss/Skip di `track.items` | PASS | TA: `AC-9: boss.* dan skip_test.* pada data.tiers identik...`, `AC-9: setelah Boss Tier 1 lulus, boss.* tetap identik di semua jalur` |
| AC-10 | Checkpoint: 201, 10 soal dari 4 sub-modul (2-3 per sub-modul), lulus >= 8, points 0, progres tidak berubah | SEBAGIAN | T: `AC-10: bila sub-modul selesai dan kolam cukup, startCheckpoint mengembalikan 201 dengan 10 soal` (question_count, pass_percent, covers). Tidak terbukti: sebaran 2-3 soal per sub-modul, tanpa duplikat, submit >= 8 benar -> `passed=true`/PASSED/`best_percent`, `points_awarded=0`, baris progres gatekeeping tidak berubah |
| AC-11 | 409 NOT_READY, 422 kolam < 5 (`max_available:<n>`), 404, ATTEMPTED tidak mengubah status | SEBAGIAN | T: `menolak memulai checkpoint bila sub-modul yang dicakup belum selesai (409 CHECKPOINT_NOT_READY)`, `menolak bila item_id bukan checkpoint milik jalur itu (404 NOT_FOUND)`. Tidak terbukti: 422 `CHECKPOINT_NOT_ENOUGH_QUESTIONS` dengan `details[0].code`, dan "ATTEMPTED tidak mengubah status sub-modul" |
| AC-12 | COMING_SOON berlabel, tidak memblokir, bukan predecessor | SEBAGIAN | U: `AC-12: item COMING_SOON dilewati dan tidak memblokir item sesudahnya`. Tidak terbukti: label `content_state='COMING_SOON'` pada respons pohon jalur |
| AC-13 | GT-SPRINT-4W: layout SPRINT, 20 slot unik menaik, 4 CP sesudah hari ke-5 | PASS | TA: `AC-13: layout SPRINT, 20 SUB_MODULE ...`; UA: `AC-13: tracks.json memuat 20 SUB_MODULE ...` |
| AC-14 | tiap kode galat validator dihasilkan tepat satu fixture negatif; fixture positif lolos | PASS | UA: `AC-14: fixture negatif menghasilkan <kode> (dan hanya kode itu)` (17 tes), `AC-14: daftar fixture negatif mencakup persis...`, `AC-14: fixture positif sintetis...`, `AC-14: berkas jalur nyata content/gt-tracks/tracks.json lolos validator` (setelah perbaikan bug validator) |
| AC-15 | PRACTICE_FIRST melewati LEARN_NOT_COMPLETED; LEARN_FIRST tetap 409; tidak COMPLETED sebelum belajar | PASS | TA: lima tes `AC-15: ...` (override profil, default GT-READING, LEARN_FIRST 409, varian tidak ada 409, tidak COMPLETED sebelum belajar lalu COMPLETED setelah `applyLearnCompleted`) (setelah perbaikan bug) |
| AC-16 | override gaya `USER_OVERRIDE`, `null` -> `TRACK_DEFAULT` | PASS | T: `AC-5 & AC-16 ... PUT /sub-modules/{code}/style mengubah override gaya dan dapat direset ke null` (memakai PRACTICE_FIRST, bukan CASE_BASED; setara) |
| AC-17 | jalur aktif non-PUBLISHED atau NULL -> GT-STRUCT aktif | SEBAGIAN | T: `AC-1 & AC-17 ... GT-STRUCT aktif secara default` (kasus `active_track_id` NULL). Tidak terbukti: jalur aktif berstatus tidak PUBLISHED |
| AC-18 | `active_track` pada kartu resume; semantik resume tidak berubah | PASS | TA: `AC-18: kartu resume memuat active_track = jalur aktif...`; regresi: `tests/integration/resume.itest.ts` (13 tes). T: `AC-18` bersifat bersyarat (`if (res.json.data)`), tidak dihitung |
| AC-19 | import/seed dua kali NOOP; 4 jalur / 51 item (0/18/9/24) | PASS | TA: `AC-19: applyTracks pada DB seed: run kedua NOOP...`, `AC-19: proses db:seed dua kali dan content:import --dir content/gt-tracks dua kali pada DB baru...` (setelah perbaikan bug) |

Ringkas: PASS 13 (AC-1, 2, 3, 5, 7, 8, 9, 13, 14, 15, 16, 18, 19), SEBAGIAN 6 (AC-4, 6, 10, 11, 12, 17). Frontend (komponen jalur, sakelar gaya, kartu checkpoint): tidak ada tes komponen khusus selain `U` (`track-utils`); `next build`/`tsc` hanya bukti kompilasi, bukan bukti AC UI.

---

## 3. Hasil Pengujian Otomatis (2026-11-09)
- `npx tsc --noEmit`: tidak ada galat pada berkas TASK-021; 1 galat pada `codes/vitest.coverage.config.ts` (berkas baru di luar TASK-021).
- `npx vitest run`: 70 berkas / 895 tes lulus (di dalamnya `learning-tracks-ac.test.ts` 28 tes, `learning-tracks.test.ts` 7 tes, `tests/security/endpoint-guards.test.ts`).
- `npx vitest run -c vitest.integration.config.ts`: seluruh berkas terkait TASK-021 lulus (`tracks.itest.ts` 12 tes, `tracks-ac.itest.ts` 23 tes, `gatekeeping`, `resume`, `attempts`, `player`, `content`, `bank-cli`). Pada run terakhir 3 tes `simulation-ac.itest.ts` (SPEC-023, berkas pekerjaan lain yang sedang diubah) gagal; tidak terkait TASK-021.
- Kinerja `GET /curriculum/tree`: 10 query SQL, p95 sekitar 2-7 ms (`gatekeeping.itest.ts`).

---

## 4. Kesimpulan QA
Perilaku inti D5 (gerbang Tier/Boss/Skip berlaku di semua jalur), progres bersama, seed idempoten, validator konten, dan gaya PRACTICE_FIRST kini terbukti oleh tes. Belum terbukti: bagian AC-4, AC-6 (E2E), AC-10, AC-11, AC-12, AC-17 sebagaimana tercantum, serta perilaku UI. Disarankan menambah tes untuk bagian tersebut sebelum Gate Code Review menyatakan AC terpenuhi penuh.
