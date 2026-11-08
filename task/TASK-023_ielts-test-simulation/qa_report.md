# QA Report TASK-023: Simulasi Tes IELTS GT dengan Pilihan Section

Spec: `specifications/023_spec_ielts_test_simulation.md`
Tanggal Uji: 2026-11-09 (dikoreksi pasca-audit 2026-11-09)
Hasil Akhir: **PASS BERSYARAT** (semua AC [F] kecuali butir yang diberi tanda SEBAGIAN/TIDAK TERBUKTI di bawah; [C] tetap HOLD)

> Koreksi pasca-audit: versi sebelumnya menandai PASS untuk AC-5, 6, 9, 10, 11, 13, 14, 15 hanya dengan "terverifikasi di service.ts" (membaca kode), tanpa tes yang merujuknya. Pembuktian dengan tes nyata ditambahkan (`tests/integration/simulation-ac.itest.ts`, `tests/unit/simulation-assemble-ac.test.ts`, fixture `tests/fixtures/sim-banks.ts`) dan MENEMUKAN beberapa cacat nyata (lihat dev_log.md bagian "Tes tambahan pasca-audit"). Aturan tabel di bawah: **PASS hanya bila ada tes yang merujuknya** (berkas: nama tes); selain itu SEBAGIAN atau TIDAK TERBUKTI beserta alasannya.

---

## 1. Ringkasan Eksekutif
Fitur SPEC-023 berfungsi untuk alur utama, tetapi pembuktian awal lemah. Setelah tes pasca-audit ditambahkan, tujuh AC yang sebelumnya hanya "dibaca" kini terbukti oleh tes, dan tes tersebut mengungkap delapan cacat (semuanya sudah diperbaiki; rinciannya di dev_log). Yang masih belum terbukti: UI hasil menampilkan disclaimer (AC-19, bagian UI), E2E Playwright Reading + Writing (AC-7, bagian E2E), dan `next build` tidak dijalankan ulang pada audit ini.

---

## 2. Matriks Penerimaan Kriteria (Acceptance Criteria)

Singkatan berkas: `SIM` = `codes/tests/integration/simulation.itest.ts`; `AC` = `codes/tests/integration/simulation-ac.itest.ts`; `UNIT-AC` = `codes/tests/unit/simulation-assemble-ac.test.ts`; `UNIT-SC` = `codes/tests/unit/simulation-scoring.test.ts`.

| ID | Status | Bukti (berkas: nama tes) / Alasan |
|---|---|---|
| AC-1 | **PASS** | `SIM`: "AC-1 & AC-19: alur 2 section (READING + WRITING) -> PARTIAL_SELECTION ..." |
| AC-2 | **PASS** | `SIM`: "AC-2: 4 section -> PENDING_SECTIONS sampai Speaking dinilai, lalu COMPLETE ..." |
| AC-3 | **PASS** | `SIM`: "AC-1 & AC-19 ..." (34/40 = 7.0) dan "AC-3: Pembuktian skor Reading 34/40 ... 30/40 ..." (30/40 = 6.0); `AC`: "AC-3: Reading 40/40 -> 9.0 dan Listening memakai tabel LISTENING ..." (40/40 = 9.0 dan Listening 34/40 sama dengan pencarian tabel `LISTENING` aktif) |
| AC-4 | **PASS** | `UNIT-SC`: "AC-4: band Writing = roundBand((T1 + 2*T2)/3) ..." |
| AC-5 | **PASS** | `AC`: "AC-5: GET /simulations/options -> ...", "AC-5: POST {LISTENING, READING} -> 422 ... tidak ada attempt tercipta", "AC-5: bank awal tetap bisa merakit WRITING + SPEAKING ..." (bank awal sintetis: Reading 2 teks x 8 soal, tanpa Listening) |
| AC-6 | **PASS** | `AC`: "AC-6: refresh memulihkan active_section, 3 jawaban, dan remaining_seconds = deadline_at - server_now (600 detik berlalu -> berkurang 600)" dengan `setClockForTest`; `AC`: "AC-6: start idempoten ..." |
| AC-7 | **SEBAGIAN** | Terbukti: tes unit perakit/scoring (`UNIT-AC`, `UNIT-SC`), tes integrasi alur 2 section, 409, 422, pemulihan waktu, kedaluwarsa (`SIM`, `AC`), guard statis semua `route.ts` memakai `withApi` (`tests/security/endpoint-guards.test.ts`, otomatis mencakup rute simulasi) dan `AC`: "AC-7: 401 UNAUTHENTICATED tanpa sesi pada kedelapan rute simulasi". **Tidak terbukti: E2E Playwright Reading + Writing (`tests/e2e/` tidak memuat berkas simulasi)**; `next build` pada klaim lama tidak dijalankan ulang pada audit ini. |
| AC-8 | **PASS** | `SIM`: "AC-8: Satu simulasi IN_PROGRESS per profil ..." |
| AC-9 | **PASS** | `AC` (7 tes, semuanya dengan jam terkontrol): "AC-9: GET sesudah deadline -> section dikirim otomatis (auto_submitted=true, submitted_at=deadline_at) ... attempt GRADED"; "AC-9: PUT jawaban sesudah deadline_at + 5 detik -> 409 SECTION_EXPIRED ..."; "AC-9: batas toleransi 5 detik ..." (+4 s diterima, +6 s ditolak); "AC-9: start pada section yang waktunya habis ..."; "AC-9: submit sesudah deadline ..."; "AC-9: GET isi section sesudah deadline ..."; "AC-9: Writing yang kedaluwarsa tanpa submission ..." |
| AC-10 | **PASS** | `AC`: "AC-10: Task 1 terkirim dan Task 2 kosong -> hanya 1 submission/1 job LLM, task2_band=0 ..." (jumlah panggilan LLM dibuktikan lewat 1 baris `submissions` dan 1 job `GRADE_WRITING`, bukan lewat spy pada stub) dan "AC-10: kedua task kosong -> Writing band 0 tanpa submission dan tanpa job LLM"; juga `SIM` AC-1 (kedua task kosong = band 0) |
| AC-11 | **PASS** | `AC`: "AC-11: AI_ENABLED=false -> section AWAITING_GRADING sampai kedua task dinilai sendiri; hasil verified=false ..." (tes ini GAGAL pada kode lama: section tertahan selamanya), "AC-11: hanya Task 1 dikirim lalu dinilai sendiri ...", pembanding "AC-11 (pembanding): LLM tersedia (mock) -> ... verified=true" |
| AC-12 | **PASS** | `SIM`: "AC-12: Urutan tetap LISTENING -> READING -> WRITING ..." |
| AC-13 | **PASS** | `UNIT-AC`: "AC-13: dengan stok melimpah ..." (25 seed), "AC-13: stok tepat minimum -> soal berulang dipakai dan perakitan tidak gagal", "AC-13: stok sebagian ...", "AC-13: Reading dengan semua kombinasi sudah dilihat ...", "AC-13: Writing menghindari soal terlihat ..."; `AC`: "AC-13: stok melimpah -> simulasi kedua tidak memakai question_id ... yang sama", "AC-13: stok tidak cukup (tepat minimum) ...", "AC-13: simulasi yang ABANDONED tidak dihitung ..." |
| AC-14 | **PASS** | `UNIT-AC`: "AC-14: tiga paket S1, S2, S3 berurutan ... total tepat 40 soal", "AC-14: hanya kombinasi berjumlah tepat 40 ...", "AC-14: satu bank berisi beberapa teks ...", "AC-14: tanpa kombinasi tepat 40 (total 39/41/30) ... gagal", "AC-14: salah satu jenis (S2) tidak punya paket ..."; `AC`: "AC-14: Reading dirakit dari tiga paket S1, S2, S3 berurutan ... (14+13+13)", "AC-14: stok Reading tanpa kombinasi 40 soal ... available=false dan POST -> 422" |
| AC-15 | **PASS** | `UNIT-AC`: "AC-15: tepat 4 soal part 1, 1 soal part 2, 4 soal part 3 ..." (25 seed) dan tes kekurangan stok; `AC`: "AC-15: Speaking dirakit 4 soal part 1, 1 soal part 2, 4 soal part 3", "AC-15: skor tiap part diterima selama Speaking belum GRADED; ... ditolak 409 ATTEMPT_NOT_ACTIVE", "AC-15: attempt ABANDONED menolak skor ...", "AC-15: attempt sudah GRADED karena section non-Speaking selesai ... masih diterima", "AC-15: attempt AWAITING_GRADING ... tetap menerima skor Speaking" (tes pengiriman ulang part menemukan cacat run lama dipakai, sudah diperbaiki) |
| AC-16 | **PASS** | `SIM`: "AC-16: Listening fixture durasi 20 detik menghasilkan time_limit_seconds = 140" (via `options`); `UNIT-AC`: "AC-16: Listening 4 bagian x 10 soal audio 5+5+5+5 -> time_limit_seconds = 20 + 120 = 140" (state hasil rakitan) |
| AC-17 | **PASS** | `AC`: "AC-17: tabel progres tier/modul/sub-modul dan user_stats identik sebelum-sesudah, points_awarded=0, radar READING terbarui, riwayat memuat MOCK_TEST". Catatan: tes lama `SIM` AC-17 hanya memeriksa `points_awarded` dan riwayat (judul tes lama menyebut radar tetapi tidak memeriksanya). |
| AC-18 | **PASS** | `SIM`: "AC-18: Respons GET detail section ..." dan `AC`: "AC-18: GET /attempts/{id} dan GET /attempts/{id}/result pada MOCK_TEST tidak memuat correct_answers, explanation_id, rng_seed (sebelum dan sesudah selesai)". Tes `AC` menemukan GET /attempts/{id} untuk MOCK_TEST berstatus 500 pada kode lama (sudah diperbaiki). |
| AC-19 | **SEBAGIAN** | Terbukti untuk DTO: `SIM` "AC-1 & AC-19 ..." (teks `disclaimer` persis). **Tidak terbukti: UI hasil menampilkannya** (tidak ada tes komponen `simulation-result`). |
| AC-20 | **PASS** | `UNIT-SC`: "AC-20 & D4: Overall 4 section dengan pembulatan setengah-band" (ketiga contoh) |
| AC-C1 | **HOLD** | Menunggu konten Reading nyata (D10). |
| AC-C2 | **HOLD** | Menunggu konten Listening nyata (D10). |

---

## 3. Temuan yang TIDAK diperbaiki (di luar AC yang diaudit)
1. `GET /simulations/{id}/result`: status section yang belum dimulai berupa `IN_PROGRESS` (bukan `NOT_STARTED` seperti kontrak) karena status baris `attempt_sections` dibuat `IN_PROGRESS` sejak POST. `GET /simulations/{id}` sudah benar (memakai `started_at`).
2. Penilaian jawaban objektif simulasi (`attempts/service.ts`, cabang `isMock`) hanya memahami respons string (`selected`/`choice`/`text`) dan jalur `option_ids` yang menafsirkan nomor id sebagai indeks opsi ASLI (padahal id berurutan menurut urutan acak). Tipe soal lain (MCQ_MULTI, matching, TFNG berbentuk lain) belum teruji; risiko salah nilai saat konten nyata Reading/Listening terbit. Tidak ada tes yang membuktikan benar/salahnya; perlu keputusan Analyst/Dev.
3. Spec D3 menyebut `assembleSimulation(pool, selection, seenQuestionIds, rng)`; implementasi aslinya bergantung DB. Pada audit ini inti murni diekstrak sebagai `assembleFromPool(banks, sections, seenIds, seed)` (tanpa mengubah perilaku) agar dapat diuji unit; `assembleSimulation(db, ...)` tetap sebagai pembungkus.

## 4. Hasil Verifikasi Teknis (pasca-audit)
- `npx tsc --noEmit`: 0 error.
- `npx vitest run` (unit): 70 berkas, 895 tes lulus (21 tes baru dari `simulation-assemble-ac.test.ts`).
- `npx vitest run -c vitest.integration.config.ts` (integrasi): 23 berkas, 347 tes lulus (31 tes baru dari `simulation-ac.itest.ts`).
- `eslint --max-warnings=0` pada seluruh berkas yang diubah: bersih.
- `next build` dan E2E Playwright: tidak dijalankan pada audit ini.

## 5. Rekomendasi
Selesaikan butir SEBAGIAN (E2E Reading + Writing, tes komponen disclaimer pada UI hasil) dan putuskan temuan nomor 2 sebelum konten Reading/Listening nyata diterbitkan. Setelah itu status `ready_to_test` dapat dipertahankan.
