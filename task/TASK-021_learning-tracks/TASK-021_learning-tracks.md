# TASK-021 Jalur Belajar (Learning Track) dan Gaya Penyampaian Materi
**Spec:** `specifications/021_spec_learning_tracks.md`
**Priority:** P1
**Wave:** W9 (urutan build ke-3 dari 5)
**Size:** L
**Assigned To:** Developer Agent (Backend + Frontend + Konten)
**Dependencies:** TASK-022 (urutan wajib; mewarisi konvensi migrasi SQLite + konten via CLI); TASK-003 (gatekeeping), TASK-004, TASK-005 (pemutar), TASK-007 (resume); TASK-025d
**Current Status:** not_started

---

## Description
Menambah entitas jalur belajar (4 jalur seed: `GT-STRUCT`, `GT-WRITING`, `GT-READING`, `GT-SPRINT-4W`) yang MERUJUK sub-modul yang sama (progres tunggal), `active_track_id` per profil, gatekeeping per jalur (D5), varian materi per gaya penyampaian (`LEARN_FIRST`, `PRACTICE_FIRST`, `CASE_BASED`) dengan jatuh ke bawaan bila varian tidak ada, serta pemilih jalur di `/peta` dan sakelar "Cara belajar" di pemutar.

## Acceptance Criteria (dirujuk dari SPEC-021)
- [ ] AC-1: seed membuat 4 jalur D2; `GT-STRUCT` memuat 31 sub-modul sesuai urutan SPEC-004.
- [ ] AC-2: profil baru mendapat `GT-STRUCT` aktif; `PUT /me/active-track` mengubahnya tanpa mengubah baris progres.
- [ ] AC-3: menyelesaikan sub-modul S di `GT-WRITING` menandainya `COMPLETED` di `GT-STRUCT` (D4).
- [ ] AC-4: di jalur non-struct, sub-modul berikutnya terbuka hanya sesuai D5; tidak ada pengunci ulang.
- [ ] AC-5: varian materi `PRACTICE_FIRST` dipakai bila tersedia; bila tidak, bawaan dipakai tanpa galat.
- [ ] AC-6: endpoint-guards mencakup semua rute baru; unit gatekeeping per jalur; integrasi migrasi + seed.
- [ ] Edge: sub-modul `COMING_SOON`/belum `PUBLISHED` dilewati dan ditandai "Segera hadir"; jalur aktif diarsipkan -> kembali `GT-STRUCT`; `ORDER_INDEX_TAKEN` pada impor; progres tunggal lintas jalur; resume konsisten dan menampilkan nama jalur (D7).
- [ ] D5: "Checkpoint" (drill gabungan, lulus >= 75%) tiap 4-6 sub-modul pada jalur selain `GT-STRUCT`; tidak ada Boss Stage di jalur tersebut.

## Subtasks

### Konten
1. Kontrak konten 1.2: `learning_tracks[]` (+ `learning_track_items[]`, `is_checkpoint`) dan `learning_materials[].style` pada Zod/validator.
2. Susun daftar sub-modul tiap jalur: `GT-STRUCT` (31, sesuai SPEC-004), `GT-WRITING`, `GT-READING`, `GT-SPRINT-4W` (20 hari). Sertakan keputusan KONTEN yang belum didefinisikan spec (lihat Risiko R2).
3. Berkas `content/` untuk jalur + minimal beberapa varian materi (`PRACTICE_FIRST`, `CASE_BASED`) pada sub-modul uji; `content:validate|import` mendukungnya.

### Backend
1. Migrasi SQLite (nomor mengikuti urutan `drizzle/`, bukan `0008` Postgres): `learning_tracks`, `learning_track_items` (unik `(track_id, sub_module_id)` dan `(track_id, order_index)`), `users.active_track_id` (FK `ON DELETE SET NULL`), `learning_materials.style` + unik `(sub_module_id, style)` (periksa indeks unik lama pada `learning_materials`).
2. Engine gatekeeping per jalur (SPEC-003 diperluas): fungsi status murni menerima konteks jalur; `GT-STRUCT` = perilaku lama utuh; jalur lain = aturan D5 (lihat Risiko R1).
3. Endpoint: `GET /api/v1/tracks`, `PUT /api/v1/me/active-track` (204; `404` bila kode tak ada), `GET /curriculum/tree?track=`, `GET /sub-modules/{code}?style=`; `auth: 'user'`; endpoint-guards.
4. Seleksi varian materi dengan fallback ke bawaan; override gaya per sub-modul oleh pengguna.
5. Checkpoint: penyusun drill gabungan dari soal sub-modul 4-6 sebelumnya (pakai mesin soal/Active Drill; lihat R3).
6. Resume (SPEC-007): sertakan nama jalur aktif tanpa mengubah semantik posisi.
7. Admin `GET/POST/PATCH /admin/tracks` TIDAK dibuat (admin dihapus, SPEC-025); kurasi lewat berkas konten + CLI.
8. Tes: unit gatekeeping per jalur (termasuk tak-ada-pengunci-ulang), integrasi migrasi+seed+progres bersama, guards.

### Frontend
1. `/peta`: pemilih jalur (kartu horizontal di mobile), progres per jalur, chip gaya penyampaian; pohon mengikuti `?track=`.
2. Pemutar: sakelar "Cara belajar" (Belajar dulu / Latihan dulu / Studi kasus) hanya bila varian tersedia; perilaku `PRACTICE_FIRST` (drill dulu, penjelasan sesudah salah/selesai) dan `CASE_BASED`.
3. Penanda Checkpoint dan "Segera hadir"; kartu resume menampilkan nama jalur; teks Indonesia; ikon + teks.
4. Tes komponen dan E2E (ganti jalur, progres tetap).

## File / Area Kode yang Disentuh
- `codes/drizzle/`, `src/db/schema.ts`; `src/server/gatekeeping/*`, `src/server/curriculum/*`, `src/server/content/*` (kontrak/importer/seed)
- `src/app/api/v1/tracks`, `me/active-track`, `curriculum/tree`, `sub-modules/[code]`
- `src/app/(app)/peta/*`, `src/components/map/*`, `src/components/player/*`, `src/i18n/id.ts`
- `content/` (jalur + varian), `scripts/seed*.ts`, `scripts/content-import.ts`
- `tests/unit|integration|e2e`

## Definition of Done
- Semua AC dicentang; typecheck, lint, unit, integrasi, endpoint-guards, E2E hijau; regresi gatekeeping/Boss SPEC-003/014 nol.
- dev_log diisi; QA report; status log diperbarui.

## Risiko / Catatan
- R1 (RISIKO TERBESAR): D5 "terbuka bila sudah terbuka/selesai lewat jalur lain" dapat mem-bypass gerbang Tier/Boss `GT-STRUCT` (mis. menyelesaikan sub-modul Tier 3 lewat `GT-WRITING` tanpa lulus Boss Tier 2). Spec tidak menyatakan apakah gerbang Tier tetap berlaku di jalur lain. Perlu keputusan Analyst/human sebelum implementasi; usul: kunci Tier tetap dievaluasi per sub-modul pada jalur manapun.
- R2: Isi `GT-WRITING`, `GT-READING`, dan `GT-SPRINT-4W` ("relevan", "inti") tidak terdaftar per kode sub-modul; `GT-SPRINT-4W` (4 minggu x 5 hari, "1 sub-modul inti + 1 mini-task") tidak punya model data untuk minggu/hari/mini-task. Butuh keputusan konten.
- R3: "Checkpoint" tidak punya tabel/tipe set di Database Changes (hanya `is_checkpoint`); komposisi soal dan penyimpanan attempt tidak ditentukan.
- R4: Spec menyebut admin `GET/POST/PATCH /admin/tracks` dan "dikurasi admin" padahal admin dihapus (SPEC-025); jalur lewat konten/CLI. Spec butuh koreksi Analyst.
- R5: Kolom Postgres (`enum`, `numeric(2,1)`) dan migrasi `0008` harus dipetakan ke SQLite (D8); nomor `0008` bentrok dengan nama berkas `0008_spec_023_reading_general_band` (Postgres lama sudah dipensiunkan).
- R6: AC-1 mengandalkan "31 sub-modul sesuai urutan SPEC-004"; konten Tier massal (C-01..C-04) mungkin belum lengkap sehingga banyak sub-modul `COMING_SOON`; kriteria "31" harus dibaca sebagai jumlah item yang dirujuk, bukan terpublikasi.
- R7: Dependensi seluruhnya `ready_to_test`, belum `done`; aturan "mulai setelah dependensi done" perlu dispensasi human.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-08 12:00 | pm agent | task created | - |
