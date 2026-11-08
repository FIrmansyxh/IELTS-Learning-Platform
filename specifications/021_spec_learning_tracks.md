# SPEC-021: Jalur Belajar (Learning Track) dan Gaya Penyampaian Materi

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-004)
- **Created:** 2026-11-08
- **Status:** draft (menunggu persetujuan human)
- **Depends on:** SPEC-003, SPEC-004, SPEC-005, SPEC-007
- **Prioritas:** P1 (setelah MVP evaluasi Writing GT)
- **Cakupan:** Backend (entitas jalur, gatekeeping per jalur, varian materi) + Frontend (pemilih jalur di peta belajar) + Konten (varian materi)

## User Story
Sebagai Learner IELTS General Training, saya ingin memilih jalur belajar dengan susunan materi dan cara penyampaian yang berbeda (terstruktur, intensif per skill, sprint berbatas waktu), sehingga saya belajar dengan cara yang paling cocok untuk saya tanpa kehilangan progres yang sudah ada.

## Non-Goals / Out of Scope
- Tidak menyalin sub-modul: jalur hanya MERUJUK sub-modul yang sama (satu progres, bukan satu progres per jalur).
- Tidak ada pembuatan jalur oleh learner (jalur dikurasi admin/konten).
- Tidak mengubah kurikulum Tier 1-4 yang ada; jalur "Terstruktur" adalah kurikulum itu sendiri.
- Tidak ada jadwal/penagih harian otomatis (notifikasi di luar scope).

## Definisi Tetap
**D1. Jalur** = daftar berurutan rujukan sub-modul + metadata (`code`, `title`, `description`, `delivery_style_default`, `target_band_min/max`, `recommended_for`).
**D2. Jalur awal (seed):**
| Kode | Nama | Isi | Gaya default |
|---|---|---|---|
| `GT-STRUCT` | Terstruktur Tier 1-4 | Semua sub-modul sesuai Tier, gerbang Boss Stage berlaku | `LEARN_FIRST` |
| `GT-WRITING` | Intensif Writing GT | Sub-modul Writing/Grammar/Vocab yang relevan lintas Tier: surat formal/semi-formal/informal, esai Task 2, register, kohesi | `CASE_BASED` |
| `GT-READING` | Intensif Reading GT | Teks sehari-hari, ketenagakerjaan, teks umum; taktik TFNG/matching/summary | `PRACTICE_FIRST` |
| `GT-SPRINT-4W` | Sprint 4 Minggu | 4 minggu x 5 hari; tiap hari 1 sub-modul inti + 1 mini-task, target band 6.0-6.5 | `PRACTICE_FIRST` |
**D3. Gaya penyampaian** (`delivery_style`): `LEARN_FIRST` (artikel -> drill -> terapkan), `PRACTICE_FIRST` (drill dulu, penjelasan muncul setelah salah/selesai, lalu terapkan), `CASE_BASED` (contoh jawaban model + analisis, lalu menulis sendiri). Satu sub-modul boleh menyediakan satu varian materi per gaya; bila varian tidak ada, jatuh ke materi bawaan (`LEARN_FIRST`).
**D4. Progres bersama.** `user_sub_module_progress` tetap satu per (user, sub-modul). Menyelesaikan sub-modul di satu jalur dihitung selesai di semua jalur.
**D5. Gatekeeping per jalur.** Pada `GT-STRUCT` aturan SPEC-003 berlaku utuh (termasuk gerbang Tier). Pada jalur lain: sub-modul N+1 terbuka bila sub-modul N pada JALUR itu `COMPLETED`/`SKIPPED`, ATAU sub-modul itu sudah terbuka/selesai lewat jalur lain (tidak pernah mengunci ulang). Tidak ada Boss Stage di jalur selain `GT-STRUCT`; diganti "Checkpoint" (drill gabungan, kelulusan >= 75%) tiap 4-6 sub-modul.
**D6. Jalur aktif.** Tiap pengguna punya paling banyak satu `active_track_id`; default `GT-STRUCT`. Mengganti jalur tidak menghapus progres.
**D7. Resume (SPEC-007)** tidak berubah: tetap menunjuk posisi terakhir lintas jalur; kartu menampilkan nama jalur aktif.

## Technical Flow
1. Admin/konten memuat jalur lewat paket konten (kontrak 1.2: `learning_tracks[]`, `material_variants`).
2. Learner membuka `/peta`, memilih jalur (dropdown/kartu), sistem menyimpan `active_track_id`.
3. `GET /curriculum/tree?track=<code>` mengembalikan pohon yang difilter/diurutkan sesuai jalur, status dihitung oleh mesin gatekeeping (D5).
4. Pemutar (SPEC-005) memilih varian materi menurut `delivery_style` jalur aktif (atau override pengguna per sub-modul).

## API Contract (ringkas; rinci diisi saat approval)
- `GET /api/v1/tracks` -> `[{ code, title, description, delivery_style_default, target_band_min, target_band_max, total_sub_modules, completed_sub_modules }]`
- `PUT /api/v1/me/active-track` body `{ track_code }` -> 204; `404 NOT_FOUND` bila kode tidak ada.
- `GET /api/v1/curriculum/tree?track=GT-WRITING` (parameter opsional; tanpa parameter = jalur aktif).
- `GET /api/v1/sub-modules/{code}?style=PRACTICE_FIRST` (opsional; tanpa parameter = gaya jalur aktif).
- Admin: `GET/POST/PATCH /api/v1/admin/tracks` (kurasi urutan).
Kode error baru: `TRACK_NOT_FOUND` (404 via NOT_FOUND), `STYLE_NOT_AVAILABLE` tidak dibuat (jatuh ke bawaan, D3).

## Database Changes
- `learning_tracks(id uuid pk, code text unique, title, description, delivery_style_default enum, target_band_min numeric(2,1), target_band_max numeric(2,1), review_status, created_at)`.
- `learning_track_items(track_id fk, sub_module_id fk, order_index int, is_checkpoint bool default false, unique(track_id, sub_module_id), unique(track_id, order_index))`.
- `users.active_track_id uuid null fk -> learning_tracks.id on delete set null`.
- `learning_materials.style enum null` + unique `(sub_module_id, style)` untuk varian; `null` = bawaan.
- Migrasi: `0008_spec_021_learning_tracks.sql` (aditif, tanpa mengubah data lama).

## UI/UX
- `/peta`: pemilih jalur di atas pohon (kartu horizontal di mobile), tampilkan progres per jalur dan chip gaya penyampaian.
- Pemutar: sakelar gaya "Cara belajar" (Belajar dulu / Latihan dulu / Studi kasus) bila varian tersedia.
- Teks UI berbahasa Indonesia; ikon + teks, bukan warna saja.

## Acceptance Criteria
1. Seed membuat 4 jalur pada D2; `GT-STRUCT` memuat 31 sub-modul sesuai urutan SPEC-004.
2. Pengguna baru mendapat `GT-STRUCT` sebagai jalur aktif; `PUT /me/active-track` mengubahnya dan tidak mengubah baris progres.
3. Menyelesaikan sub-modul S di `GT-WRITING` menandainya `COMPLETED` di `GT-STRUCT` (D4).
4. Di jalur non-struct, sub-modul berikutnya terbuka hanya sesuai D5; tidak ada pengunci ulang.
5. Varian materi `PRACTICE_FIRST` dipakai bila tersedia; bila tidak, bawaan dipakai tanpa galat.
6. Tes endpoint-guards mencakup semua rute baru (auth eksplisit); tes unit gatekeeping per jalur; tes integrasi migrasi + seed.

## Edge Cases & Validation
- Jalur berisi sub-modul `COMING_SOON`/belum `PUBLISHED`: dilewati dan ditandai "Segera hadir" tanpa memblokir urutan.
- Menghapus/mengarsipkan jalur yang sedang aktif: `active_track_id` otomatis kembali ke `GT-STRUCT`.
- Dua jalur memuat sub-modul yang sama: progres tunggal (D4); resume tetap konsisten.
- `order_index` ganda dalam satu jalur ditolak saat impor (`ORDER_INDEX_TAKEN`).

## Human Approval
- [ ] Disetujui human (belum)

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
