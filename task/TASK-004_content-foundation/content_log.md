# Content Log TASK-004: Golden Sample (GS-1..GS-6)

Tanggal: 2026-11-03 | Lokasi paket: `codes/content/golden-sample/` | Status: DRAFT, menunggu aset dan tinjauan pemilik.

## Hasil validator
- `npm run content:validate -- content/golden-sample` -> exit 0: `OK: valid | modules 0 | sub_modules 3 | drill 3 | assessment_sets 6 | assets 4` (tanpa peringatan).
- `content:import --dir content/golden-sample --dry-run` (DB dev) -> `modules +0 ~0 =0 | sub_modules +0 ~3 =0 | assessment_sets +9 ~0 =0 | assets +4` (3 sub-modul seed menjadi UPDATE; 9 set = 3 drill + Placement + Skip + Boss induk + 3 section). Tidak ada penulisan DB, tidak ada publikasi.
- Varian lengkap (dengan bagian Boss Listening dan `listening_asset_code` GS-3, memakai audio senyap uji di scratchpad, bukan bagian repo): valid, 7 set, 6 aset. Jadi patch pending sudah teruji strukturnya.

## Isi yang dibuat
| ID | Isi | Hitungan |
|---|---|---|
| GS-1 | Sub-modul 2.1.3 Passive Voice | artikel ID ~1.100 kata (tabel x2, `:::tips-examiner` x1, `:::kesalahan-umum` x1, contoh Inggris); drill 10 soal: FILL x3, MCQ_SINGLE x4, SENTENCE_REORDER x1, ERROR_RECOGNITION x1, MATCHING_DROPDOWN x1 (pembahasan Indonesia tiap soal); 3 slide WebP 1280x720; 1 PDF cheatsheet; mini_task `AI_SHORT_WRITING` |
| GS-2 | Sub-modul 3.2.1 Reading TFNG | bacaan orisinal 724 kata (1 bagian, paragraf berlabel A-G); 10 soal: TFNG x6, MCQ_MULTI x1, MATCHING_DROPDOWN x1, SHORT_ANSWER x2 (`max_words` 3); artikel ~360 kata; mini_task SELF_CHECK |
| GS-3 | Sub-modul 3.1.1 Listening | 10 soal: FILL x5 (`max_words` 2), MCQ_SINGLE x3, MATCHING_DRAG x1, SHORT_ANSWER x1; artikel ~310 kata; mini_task SELF_CHECK; naskah audio di `pending/` |
| GS-4 | Placement Test | 1 set, 30 soal (MCQ 15, FILL 10, ERROR 5), tepat 6 per difficulty 1-5, 1500 dtk |
| GS-5 | Skip Test Modul 2.1 | 1 set, 12 soal objektif campuran, 900 dtk |
| GS-6 | Boss Tier 1 | TIER_BOSS_EXAM induk + BOSS_SECTION READING (bacaan 360 kata, 10 soal), WRITING (TASK2, min 150 kata, 30 menit, rubrik mandiri di `explanation_id`), SPEAKING (Part 2, 3 `cue_points`, rubrik mandiri). Section LISTENING (10 soal, 3 `section_no`) ada di `pending/boss-t1-listening.section.json` |

Catatan penomoran: spec 004 memberi GS-4 = Placement, GS-5 = Skip, GS-6 = Boss; prompt Writing Task 2 dan cue card Speaking Part 2 berada di Boss Tier 1 (GS-6) sesuai spec.
Sumber dan lisensi: semua teks orisinal; `origin=AI_GENERATED_REVIEWED`, `source_code=OWN`; 4 aset berkas `rights_status=OWN_ORIGINAL`, `source_code=OWN`. Tidak ada salinan dari buku/tes/band descriptors; rubrik penilaian mandiri adalah parafrase orisinal tanpa angka band. Teks Reading GS-2 bersifat fiksi latihan (lembaga dan angka karangan).
Pembangkit: `src/build.mjs` (content.json + file pending), `src/gen-assets.mjs` (slide WebP via sharp, PDF tulis tangan), sumber Markdown di `src/`. `content.json` adalah hasil build; ubah sumbernya lalu jalankan ulang.

## Yang BELUM / pending dari pemilik (detail di `codes/content/golden-sample/pending/PENDING.md`)
1. **Audio rekaman pemilik (2 berkas)**: GS-3 (3-5 menit) dan Boss T1 Listening. Tidak ada audio dibuat. Akibatnya AC berikut belum dapat dipenuhi: GS-3 `listening_asset_code`; "TIER_BOSS_EXAM dengan 4 BOSS_SECTION" (di paket utama baru 3 section: Reading, Writing, Speaking; section Listening wajib `listening_asset_code` sehingga tidak dapat ada tanpa aset). Naskah, kunci, dan langkah penambahan sudah disiapkan.
2. **Video YouTube GS-1 (C-08)**: `videos` dikosongkan; syarat GS-1 "`videos` >= 1" belum terpenuhi. ID tidak dikarang. Setelah pemilik menambah ID, video menjadi `UNVERIFIED` dan harus diverifikasi (SPEC-018) sebelum publikasi.
3. **Tinjauan manusia**: tidak ada yang ditandai disetujui; semua DRAFT. Pemilik perlu membaca artikel, bacaan, soal/kunci/pembahasan, naskah audio.
4. **Publikasi (`--publish`)**: tidak dijalankan. Akan terhalang `ASSET_UNVERIFIED` (setelah video ditambah), `NO_QUESTIONS`/`BOSS_SECTIONS_MISSING` untuk Boss tanpa Listening, dan Placement baru lolos karena 30 soal (>= 25, 6/tingkat).
5. Hitungan AC "set ACTIVE_DRILL = 3, PLACEMENT = 1, SKIP = 1, TIER_BOSS_EXAM = 1 + 4 BOSS_SECTION" terpenuhi kecuali section Listening (item 1). AC "/peta menampilkan GS-1 UNLOCKED" tergantung publikasi dan belum diuji.
6. `ffprobe` tidak terpasang di mesin pengembangan; durasi audio MP3/OGG akan kosong saat impor (peringatan).
