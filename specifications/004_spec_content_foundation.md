# SPEC-004: Fondasi Konten (Kontrak Konten v1.1, Seed Struktur Tier 1-4, Golden Sample)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-000
- **Prioritas:** P0
- **Cakupan:** Backend (library konten + CLI + seed) dan konten (Golden Sample). Tidak ada UI baru; hasilnya terlihat di `/peta` (SPEC-003).

## User Story
Sebagai Admin (pemilik platform), saya ingin struktur kurikulum 4 Tier lengkap (13 modul, 31 sub-modul) tersedia sejak awal dan satu paket Golden Sample konten nyata dapat divalidasi, diimpor, dan dipublikasikan lewat satu perintah, sehingga semua fitur platform dapat dibangun dan diuji dengan konten yang mewakili seluruh variasi format data.

## Non-Goals / Out of Scope
- Tidak ada UI unggah/pratinjau/rollback impor (SPEC-019), unggah aset lewat UI (SPEC-018), atau kurasi status lewat UI (SPEC-020). Spec ini hanya library, seed, dan CLI.
- Tidak mengisi konten Tier 1-4 massal; hanya Golden Sample. Pengisian massal adalah pekerjaan konten (backlog C-01..C-04).
- Tidak mengunduh atau menyalin materi berhak cipta; Golden Sample WAJIB orisinal (pemilik/AI yang direviu) atau berlisensi terbuka dengan atribusi.
- Tidak mengambil aset dari URL (`fetch`) saat impor (anti-SSRF). Aset disediakan sebagai berkas lokal pada direktori paket.
- Tidak mendukung Excel (.xlsx).
- Tidak memvalidasi keberadaan video YouTube secara daring.
- Konten fixture sintetis untuk CI (`tests/fixtures/content/`) BUKAN bagian Golden Sample dan tidak pernah dimuat ke DB produksi.

## Technical Flow
1. Developer menjalankan `npm run db:seed`; modul seed `curriculum-structure` menulis 4 Tier, 13 Modul, 31 Sub-Modul (status `DRAFT`) dari tabel di bawah dengan `ON CONFLICT DO NOTHING`.
2. Pemilik menyiapkan direktori paket `content/golden-sample/` (struktur di bawah).
3. Pemilik menjalankan `npm run content:validate -- --dir content/golden-sample`; CLI memuat `content.json` dan `assets.manifest.json`, memvalidasi dengan Zod (skema di bawah), memeriksa silang rujukan, dan memeriksa berkas aset (magic bytes, ukuran).
4. Pemilik menjalankan `npm run content:import -- --dir content/golden-sample`; CLI membangun rencana (CREATE/UPDATE/NOOP per item lewat `content_hash`), lalu menerapkannya dalam SATU transaksi: membuat `content_assets` (file disalin ke storage lewat `StorageDriver`), `modules`, `sub_modules`, `learning_materials`, `assessment_sets`, dan `content_revisions`, semua berstatus `DRAFT`.
5. CLI menulis `audit_log` `CONTENT_IMPORTED_CLI` (`actor_user_id` NULL, `metadata` berisi hitungan) dan mencetak ringkasan.
6. Dengan `--publish`, CLI memanggil `PublishService.publish` untuk tiap entitas berurutan: aset (tidak berubah), set Drill/Skip/Placement/Boss section, set Boss induk, sub-modul, modul. Bila ada penghalang (`v_publish_blockers`), tidak ada yang dipublikasikan (transaksi dibatalkan) dan exit code 2.
7. Pemilik memverifikasi aset yang `UNVERIFIED` (video YouTube dan sejenisnya) lewat UI SPEC-018, lalu mengulang langkah 6 sampai tidak ada penghalang.
8. Learner membuka `/peta` dan melihat sub-modul yang `PUBLISHED` berstatus tersedia dan sisanya "Segera hadir".

## Seed Struktur (modul seed `curriculum-structure`)
**Tiers** (kolom `tiers`):
| tier_number | title | cefr_level | target_band_min | target_band_max | boss_gate_type | boss_gate_value | skip_threshold_percent | skip_time_limit_seconds |
|---|---|---|---|---|---|---|---|---|
| 1 | Foundation | A1-A2 | 3.0 | 4.0 | PERCENT | 80.0 | 85 | NULL |
| 2 | Bridge to Academic | B1 | 4.0 | 5.0 | BAND | 5.0 | 85 | NULL |
| 3 | Operational IELTS | B2 | 5.5 | 6.5 | BAND | 6.0 | 85 | NULL |
| 4 | Band 7.0+ Mastery | C1 | 7.0 | 7.5 | BAND | 7.0 | 85 | NULL |
`skip_time_limit_seconds` TIDAK dipakai (batas waktu Skip = `assessment_sets.time_limit_seconds`).

**Modul** (`status='DRAFT'`; `order_index` = angka setelah titik pada `module_code`):
| module_code | tier | skill_category | title |
|---|---|---|---|
| 1.1 | 1 | GRAMMAR | Core Sentence Architecture |
| 1.2 | 1 | VOCAB | Survival Vocabulary & Pronunciation |
| 1.3 | 1 | READING | Basic Comprehension (Listening & Reading) |
| 2.1 | 2 | GRAMMAR | Complex Grammar & Sentence Combining |
| 2.2 | 2 | WRITING | Paragraphing & Paraphrasing |
| 2.3 | 2 | READING | Intermediate Listening & Reading Mechanics |
| 3.1 | 3 | LISTENING | IELTS Listening Mastery |
| 3.2 | 3 | READING | IELTS Academic Reading Hacks |
| 3.3 | 3 | WRITING | IELTS Writing Blueprint |
| 3.4 | 3 | SPEAKING | IELTS Speaking Fluency |
| 4.1 | 4 | VOCAB | Advanced Lexical Resource & Collocations |
| 4.2 | 4 | WRITING | High-Scoring Writing & Grammatical Range |
| 4.3 | 4 | READING | Speed, Stamina & Trap Evasion |

**Sub-modul** (`status='DRAFT'`, `passing_score_percent=75`, `content_version=1`; `order_index` = angka terakhir kode):
| Kode | Judul |
|---|---|
| 1.1.1 | Nouns, Pronouns, Articles (a/an/the), & Plurals |
| 1.1.2 | Present Simple vs. Present Continuous |
| 1.1.3 | Past Simple vs. Present Perfect |
| 1.1.4 | Modals of Ability, Obligation & Possibility (can, must, should, might) |
| 1.2.1 | 1.000 Kata Inti (Oxford A1-A2) dalam Konteks Kalimat |
| 1.2.2 | Fonetik Dasar, Bunyi Vokal Panjang/Pendek, & Word Stress |
| 1.3.1 | Mendengarkan Angka, Ejaan Nama, Waktu, & Alamat |
| 1.3.2 | Menangkap Ide Pokok & Informasi Spesifik pada Teks Pendek |
| 2.1.1 | Conjunctions & Discourse Markers (however, although, despite, therefore, whereas) |
| 2.1.2 | Relative Clauses (who, which, that, whose, where) |
| 2.1.3 | Passive Voice untuk Deskripsi Proses & Laporan Ilmiah |
| 2.1.4 | Conditional Sentences (Zero, First, Second, Third) untuk Argumen Esai |
| 2.2.1 | Anatomi Paragraf Akademik: Topic Sentence + Explanation + Concrete Example |
| 2.2.2 | Teknik Paraphrasing (Sinonim, Word Form, Aktif-Pasif) |
| 2.3.1 | Teknik Skimming (Ide Utama) vs. Scanning (Kata Kunci, Nama, Tahun) |
| 2.3.2 | Mengenali Distractors (Koreksi Informasi & Jebakan Sinonim dalam Audio) |
| 3.1.1 | Section 1 & 2: Form/Note Completion, Multiple Choice, & Map/Plan Labeling |
| 3.1.2 | Section 3 & 4: Diskusi Akademik Multi-Pembicara & Monolog Kuliah Universitas |
| 3.2.1 | Taktik True / False / Not Given & Yes / No / Not Given |
| 3.2.2 | Strategi Matching Headings, Matching Information, & Summary Completion |
| 3.3.1 | Task 1 Academic: Analisis Tren Grafik, Perubahan Peta, & Diagram Proses |
| 3.3.2 | Task 2 Essay: Kerangka 4 Paragraf untuk Opinion, Discussion, Problem-Solution, Two-Part Questions |
| 3.4.1 | Part 1: Menjawab Lugas dengan Rumus Direct Answer + Reason + Short Example |
| 3.4.2 | Part 2 (Cue Card): Strategi Mencatat 1 Menit & Berbicara 2 Menit Penuh |
| 3.4.3 | Part 3: Menjawab Pertanyaan Abstrak & Analitis (Speculating, Comparing, Evaluating) |
| 4.1.1 | Penguasaan Academic Word List (AWL) & Kolokasi Topik Utama |
| 4.1.2 | Eliminasi Kosakata B1/B2 Repetitif menuju Kosakata Presisi Level C1 |
| 4.2.1 | Penggunaan Inversion, Participle Clauses, & Nominalization secara Alami |
| 4.2.2 | Advanced Cohesion (Transisi Antar-Ide Tanpa Linking Words yang Kaku) |
| 4.3.1 | Menyelesaikan 3 Reading Passages (40 Soal) dalam 50 Menit dengan Akurasi >= 30/40 |
| 4.3.2 | Latihan Shadowing, Intonasi Natural, & Idiomatic Expressions untuk Speaking Band 7.0+ |
Jumlah per Tier: T1 = 8, T2 = 8, T3 = 9, T4 = 6 sub-modul (total 31).

## Kontrak Konten v1.1 (Zod di `src/contracts/content.ts`; dipakai CLI dan SPEC-019)
`contract_version` diterima: `"1.1"` dan `"1.0"` (contoh PRD 7.3 apa adanya). Semua objek memakai `z.strictObject` (field tak dikenal = galat `unrecognized_key`). Kunci `__proto__`, `constructor`, `prototype` pada kedalaman berapa pun = galat `forbidden_key`. Kedalaman JSON maksimum 10. String dinormalisasi NFC dan dipangkas; karakter kontrol (kecuali `\n`, `\t`) = galat `control_char`.

### Berkas paket
```
content/golden-sample/
  content.json            # ContentPackage
  assets.manifest.json    # AssetManifest (opsional bila paket tidak memakai aset berkas)
  assets/**               # berkas yang dirujuk manifest (path relatif ke direktori ini)
```
`ContentPackage` = `{ contract_version, modules?: ModuleItem[], sub_modules?: SubModuleItem[], assessment_sets?: AssessmentSetItem[] }`; minimal satu array tidak kosong. Batas: <= 2.000 item total, berkas <= 5 MB.

### AssetManifest
`{ contract_version, assets: AssetRegistration[] }` (<= 500 entri).
| Field | Tipe | Wajib | Constraint |
|---|---|---|---|
| `asset_code` | string | ya | regex `^[a-z0-9][a-z0-9/_-]{2,79}$`; unik |
| `kind` | enum | ya | `SLIDE_IMAGE` \| `DOCUMENT` \| `AUDIO_LISTENING` \| `IMAGE` (kind eksternal tidak lewat manifest) |
| `title` | string | ya | 1-200 |
| `source_code` | string | ya | `content_sources.code` yang ada |
| `rights_status` | enum | ya | `OWN_ORIGINAL` \| `VERIFIED_OPEN` \| `UNVERIFIED` (`EMBED_ONLY`/`LINK_ONLY` ditolak: `rights_not_storable`) |
| `file` | string | ya | path relatif di bawah `assets/`; tanpa `..`, tanpa `\`, tanpa path absolut |
| `attribution_text` | string | tidak | <= 500; wajib bila sumber `share_alike` atau lisensi `CC_BY*` |
Aturan berkas (security 4.2): `SLIDE_IMAGE`/`IMAGE`: magic bytes `image/webp|png|jpeg`, <= 5 MB, di-re-encode `sharp` (buang EXIF); `DOCUMENT`: `application/pdf` atau DOCX valid tanpa `vbaProject.bin`, <= 25 MB; `AUDIO_LISTENING`: `audio/mpeg|ogg|wav`, <= 50 MB, durasi dibaca `ffprobe` ke `duration_sec`. SVG ditolak (`svg_not_allowed`). Duplikat `sha256` dengan aset berbeda `asset_code` = galat `duplicate_file`.

### ModuleItem
| Field | Tipe | Wajib | Constraint |
|---|---|---|---|
| `tier_number` | int | ya | 1-4 |
| `module_code` | string | ya | `^[1-4]\.\d{1,2}$`, angka depan = `tier_number` |
| `module_category` | enum | ya | `GRAMMAR` \| `VOCAB` \| `LISTENING` \| `READING` \| `WRITING` \| `SPEAKING` |
| `title` | string | ya | 1-150 |
| `order_index` | int | tidak | >= 1; default = angka setelah titik |

### SubModuleItem
| Field | Tipe | Wajib | Constraint |
|---|---|---|---|
| `tier_number` | int | ya | 1-4 |
| `module_code` | string | ya | harus ada di DB atau di `modules` paket |
| `module_category` | enum | ya (v1.0) | harus sama dengan `skill_category` modul bila modul sudah ada |
| `sub_module_code` | string | ya | `^[1-4]\.\d{1,2}\.\d{1,2}$`, dua angka depan = `module_code` |
| `sub_module_title` | string | ya | 1-200 |
| `passing_score_percent` | int | tidak | 1-100, default 75 |
| `order_index` | int | tidak | default = angka terakhir kode |
| `origin` | enum | v1.1: ya; v1.0: default `ORIGINAL_AUTHORED` | `ORIGINAL_AUTHORED` \| `AI_GENERATED_REVIEWED` \| `OPEN_LICENSED_ADAPTED` |
| `source_code` | string | wajib bila `origin=OPEN_LICENSED_ADAPTED` | `content_sources.code`; galat `source_required` bila kosong |
| `attribution_text` | string | tidak | <= 500; wajib bila sumber `share_alike` atau `CC_BY*` (`attribution_required`) |
| `materials.article_markdown` | string | ya | 1-100.000 karakter; tidak boleh mengandung HTML mentah (`<` diikuti huruf selain di blok kode) dan tidak boleh memuat skema `javascript:`/`data:` pada tautan |
| `materials.videos[]` | array <= 10 | tidak | `{ video_id (^[A-Za-z0-9_-]{11}$), title (1-200), instructor_channel (<=100, opsional), language ("ID"\|"EN"), start_sec (int 0-21600), end_sec (int > start_sec, <= 21600) }`; `video_id` literal `YOUTUBE_VIDEO_ID` = galat `placeholder_video` |
| `materials.slides[]` | array <= 40 | tidak | `{ order (int >=1, unik), asset_code ATAU image_url, caption (1-300), alt (<=300, default = caption) }` |
| `materials.attachments[]` | array <= 10 | tidak | `{ title (1-200), file_type ("PDF"\|"DOCX"), asset_code ATAU file_url }` |
| `materials.mini_task` | object | tidak | `{ task_type ("AI_SHORT_WRITING"\|"AI_SHORT_SPEAKING"\|"SELF_CHECK"), prompt (1-2000), ai_rubric_criteria (1-1000) }` |
| `active_drill` | object | tidak (wajib agar dapat `PUBLISHED`) | `{ time_limit_seconds (30-3600), pass_percent (1-100, opsional), questions: Question[1..50] }` |

**Penerjemahan v1.0 -> aset (D9):** `image_url`/`file_url` diubah menjadi `asset_code` dengan aturan: hapus awalan `/storage/`, hapus ekstensi terakhir. Contoh `/storage/tier2/slides/passive-diagram-flow.webp` -> `tier2/slides/passive-diagram-flow`. Aset dengan kode itu harus ada (DB atau manifest) atau galat `asset_not_found` (path: `materials.slides[0].image_url`). `videos[]` otomatis membuat/menemukan `content_assets` `kind='VIDEO_EMBED'`, `storage_backend='EXTERNAL'`, `external_ref=video_id`, `external_url='https://www.youtube.com/watch?v=<video_id>'`, `source`=`YOUTUBE`, `rights_status='UNVERIFIED'` (menunggu verifikasi manusia; ADR-003 #14), `title` dari item; pencarian berdasarkan `external_ref`.

### AssessmentSetItem
| Field | Tipe | Wajib | Constraint |
|---|---|---|---|
| `set_type` | enum | ya | `SKIP_MODULE_TEST` \| `SKIP_TIER_TEST` \| `TIER_BOSS_EXAM` \| `BOSS_SECTION` \| `PLACEMENT_TEST` (drill ditulis di `sub_modules[].active_drill`) |
| `title` | string | ya | 1-200 |
| `module_code` | string | wajib bila `SKIP_MODULE_TEST` | |
| `tier_number` | int | wajib bila `SKIP_TIER_TEST`, `TIER_BOSS_EXAM`, `BOSS_SECTION` | 1-4 |
| `skill_category` | enum | wajib bila `BOSS_SECTION` | `LISTENING` \| `READING` \| `WRITING` \| `SPEAKING` |
| `time_limit_seconds` | int | ya (opsional untuk `TIER_BOSS_EXAM`: dihitung = jumlah anak) | 30-14400 |
| `pass_percent` | int | tidak | 1-100 |
| `reading_passage_markdown` | string | tidak | <= 60.000; maks 3 bagian dipisah baris tunggal `===PASSAGE===` |
| `listening_asset_code` | string | tidak | aset `AUDIO_LISTENING` |
| `origin`, `source_code`, `attribution_text` | | | seperti SubModuleItem |
| `questions` | Question[] | ya | 0-200 (`TIER_BOSS_EXAM` induk: wajib `[]`) |

**Kunci alami set** (untuk UPDATE/NOOP): `ACTIVE_DRILL` = `sub_module_code`; `SKIP_MODULE_TEST` = `module_code`; `SKIP_TIER_TEST` = `tier_number`; `TIER_BOSS_EXAM` = `tier_number`; `BOSS_SECTION` = `tier_number` + `skill_category`; `PLACEMENT_TEST` = konstanta `PLACEMENT`. Maksimal satu set per kunci alami yang tidak `ARCHIVED`.

### Question (discriminated union pada `question_type`)
Field umum (semua tipe): `question_id` (`^Q-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$`, <= 40, unik dalam set; untuk `BOSS_SECTION` unik di semua anak Boss yang sama), `question_type`, `skill` (`SkillCategory`), `prompt` (1-2000), `explanation_id` (1-2000; wajib untuk tipe objektif, opsional untuk Writing/Speaking), `points` (int 1-20, default 1), `target_time_ms` (int 1000-600000, opsional), `difficulty` (int 1-5; wajib untuk `PLACEMENT_TEST`), `passage_no` (int 1-3, opsional; hanya bila set punya `reading_passage_markdown`; <= jumlah bagian), `section_no` (int 1-4, opsional; Listening).

| `question_type` | Field khusus | Aturan silang |
|---|---|---|
| `MCQ_SINGLE` | `options` (string[2..8], unik, 1-500 char), `correct_answers` (string[1]) | `correct_answers[0]` harus salah satu `options` |
| `MCQ_MULTI` | `options` (string[3..8], unik), `correct_answers` (string[2..options-1], unik) | semua jawaban benar ada di `options` |
| `TFNG` | `correct_answers` (string[1]) | nilai salah satu `True`, `False`, `Not Given` |
| `YNNG` | `correct_answers` (string[1]) | nilai salah satu `Yes`, `No`, `Not Given` |
| `FILL_IN_BLANK` | `correct_answers` (string[1..20] varian yang diterima, 1-100 char), `max_words` (int 1-10, opsional) | |
| `SHORT_ANSWER` | `correct_answers` (string[1..20]), `max_words` (int 1-10, wajib) | |
| `MATCHING_DROPDOWN`, `MATCHING_DRAG` | `matching: { left: string[2..15], right: string[2..15] (unik), allow_reuse: boolean (default false) }`, `correct_answers` (int[] panjang = `left.length`, tiap elemen indeks `right`) | tanpa `allow_reuse` indeks tidak boleh berulang dan `right.length >= left.length`; `points` = jumlah butir (kredit parsial = benar/total) |
| `SENTENCE_REORDER` | `segments` (string[3..12], urutan = urutan BENAR) | tidak boleh seluruhnya identik |
| `ERROR_RECOGNITION` | `tokens` (string[3..40]), `correct_answers` (int[1..3] indeks `tokens`, unik) | indeks dalam [0, tokens.length) |
| `WRITING_TASK` | `task_kind` ("TASK1"\|"TASK2"), `min_words` (int 20-500; default 150 untuk TASK1, 250 untuk TASK2), `time_limit_minutes` (int 5-90; default 20/40), `stimulus_asset_code` (opsional, aset `IMAGE`) | tanpa `correct_answers` |
| `SPEAKING_TASK` | `part` (1\|2\|3), `prep_seconds` (int 0-120; default 60 untuk part 2 dan 0 lainnya), `record_seconds` (int 15-180; default 120 part 2, 45 lainnya), `cue_points` (string[0..6], 1-200 char) | tanpa `correct_answers` |

Penyimpanan `questions_json`: setiap elemen disimpan persis seperti item (setelah normalisasi), ditambah tidak ada field baru. `assessment_sets.question_count` = jumlah elemen. `assessment_sets.content_hash` = SHA-256 hex dari JSON kanonik (kunci diurutkan) item yang dinormalisasi.

**Validasi tingkat set/paket (galat `path` `$`):** `PLACEMENT_TEST` untuk `PUBLISHED` wajib >= 25 soal dan >= 5 soal per `difficulty` 1-5; `ACTIVE_DRILL` boleh berisi `WRITING_TASK`/`SPEAKING_TASK` (dinilai AI, dikecualikan dari skor gerbang, SPEC-006); `BOSS_SECTION` skill `LISTENING` wajib `listening_asset_code`; skill `READING` wajib `reading_passage_markdown`; skill `WRITING` hanya `WRITING_TASK`; skill `SPEAKING` hanya `SPEAKING_TASK`; `TIER_BOSS_EXAM` untuk `PUBLISHED` wajib anak `LISTENING` dan `READING` berstatus `PUBLISHED`.

## Golden Sample (paket `content/golden-sample/`)
Wajib mewakili semua variasi format. Pembuat: pemilik dibantu AI; setiap teks `origin` = `ORIGINAL_AUTHORED` atau `AI_GENERATED_REVIEWED` (direviu pemilik). Dilarang menyalin dari Cambridge IELTS 10-19, Murphy, Azar, daftar Oxford, dan IELTS Liz.

| ID | Isi | Syarat terukur |
|---|---|---|
| GS-1 | Sub-modul `2.1.3` (Passive Voice) lengkap | artikel >= 600 kata berisi >= 1 tabel dan >= 1 callout `:::tips-examiner` dan >= 1 `:::kesalahan-umum`; `videos` >= 1 (ID nyata yang dipilih pemilik, `start_sec`/`end_sec` valid); `slides` >= 3 (WebP orisinal); `attachments` >= 1 (PDF cheatsheet orisinal); `active_drill` 10 soal dengan komposisi tepat: `FILL_IN_BLANK` x3, `MCQ_SINGLE` x4, `SENTENCE_REORDER` x1, `ERROR_RECOGNITION` x1, `MATCHING_DROPDOWN` x1; `mini_task` bertipe `AI_SHORT_WRITING` |
| GS-2 | Sub-modul `3.2.1` (T/F/NG) Reading | `active_drill` dengan `reading_passage_markdown` orisinal 650-800 kata (1 bagian), 10 soal: `TFNG` x6, `MCQ_MULTI` x1, `MATCHING_DROPDOWN` x1, `SHORT_ANSWER` x2 (`max_words` 3) |
| GS-3 | Sub-modul `3.1.1` Listening | `active_drill` dengan `listening_asset_code` (audio orisinal 3-5 menit, direkam pemilik), 10 soal: `FILL_IN_BLANK` x5 (`max_words` 2), `MCQ_SINGLE` x3, `MATCHING_DRAG` x1, `SHORT_ANSWER` x1 |
| GS-4 | Placement Test | 1 set `PLACEMENT_TEST`, 30 soal, tepat 6 soal per `difficulty` 1-5, campuran `MCQ_SINGLE`, `FILL_IN_BLANK`, `ERROR_RECOGNITION`, `time_limit_seconds` 1500 |
| GS-5 | Skip Test Modul `2.1` | 1 set `SKIP_MODULE_TEST`, 12 soal campuran tipe objektif, `time_limit_seconds` 900 |
| GS-6 | Boss Tier 1 | 1 `TIER_BOSS_EXAM` + 4 `BOSS_SECTION`: `LISTENING` (audio orisinal, 10 soal, 3 `section_no` berbeda), `READING` (1 bagian, 10 soal), `WRITING` (1 `WRITING_TASK` `TASK2`, `min_words` 150, `time_limit_minutes` 30), `SPEAKING` (1 `SPEAKING_TASK` `part` 2 dengan `cue_points` 3 butir) |
Aset Golden Sample: semua berkas orisinal dengan `rights_status='OWN_ORIGINAL'`, `source_code='OWN'`. Video GS-1 otomatis `UNVERIFIED` sampai diverifikasi.

## API Contract
Spec ini tidak menambah endpoint HTTP. Kontrak yang mengikat adalah (a) skema Zod di atas, (b) CLI, (c) antarmuka service.

### CLI `scripts/content-import.ts`
| Perintah | Argumen | Perilaku | Exit code |
|---|---|---|---|
| `validate` | `--dir <path>` (wajib) | memvalidasi paket + manifest + berkas aset tanpa menulis DB; mencetak galat berformat `<path JSON>: <kode>: <pesan>` satu per baris | 0 valid; 1 ada galat |
| `import` | `--dir <path>` (wajib), `--publish` (opsional), `--dry-run` (opsional), `--allow-published-overwrite` (opsional) | `validate`, lalu rencana, lalu penerapan satu transaksi; `--dry-run` hanya mencetak rencana (jumlah CREATE/UPDATE/NOOP per jenis) tanpa menulis; `--publish` memanggil `PublishService`; *(amandemen E2E O-1, ADR-003 #39)* UPDATE pada entitas yang sudah `PUBLISHED` ditolak (exit 1, kode `published_overwrite_blocked`, juga pada `--dry-run`) kecuali `--allow-published-overwrite`, dan UPDATE pada set yang sedang dikerjakan (attempt hidup) selalu ditolak (`set_has_active_attempts`) | 0 sukses; 1 validasi gagal; 2 publikasi terhalang (daftar penghalang dicetak); 3 galat teknis |
Cetakan ringkasan sukses (contoh): `OK: modules +0 ~0 =13 | sub_modules +3 ~0 =28 | assessment_sets +6 ~0 =0 | assets +9`. Menjalankan ulang tanpa perubahan: semua `=` dan 0 `+`/`~`.

### Antarmuka service (`src/server/content/`)
| Fungsi | Tanda tangan | Perilaku |
|---|---|---|
| `parseContentPackage` | `(raw: unknown) => { ok: true, data: ContentPackage } \| { ok: false, errors: ContentIssue[] }` | Zod + aturan silang; `ContentIssue = { path: string, code: string, message: string, severity: 'error' \| 'warning' }` |
| `planContentPackage` | `(tx, pkg) => ContentPlan` | per item: `action` `CREATE`\|`UPDATE`\|`NOOP`, `entityKind`, `entityCode`, `contentHash` |
| `applyContentPlan` | `(tx, plan, opts: { actorUserId: string \| null, importBatchId: string \| null }) => ApplyResult` | menulis entitas berstatus `DRAFT` (entitas yang sudah `PUBLISHED` tetap `PUBLISHED` dengan `version`/`content_version` naik 1 bila hash berubah), `content_revisions` snapshot sebelum perubahan, dan hitungan |
| `AssetRegistryService.registerFromManifest` | `(tx, manifest, baseDir, actorUserId)` | memvalidasi berkas, menyalin ke storage dengan nama UUID, mengisi `asset_code`, `sha256`, `mime_type`, `size_bytes`, `duration_sec`, `storage_key` |
| `PublishService.publish` | `(tx, entityType: 'MODULE'\|'SUB_MODULE'\|'ASSESSMENT_SET', id, actor: { userId: string \| null }) => { published: true } \| { published: false, blockers: Blocker[] }` | aturan di bawah |
| `PublishService.changeStatus` | `(tx, entityType, id, target: ReviewStatus, actor)` | transisi diizinkan: mana saja kecuali dari `ARCHIVED` hanya ke `DRAFT`; target `PUBLISHED` menjalankan `publish` |

**Aturan `PublishService.publish` (penghalang, `Blocker = { code, entity_type, entity_id, detail }`):**
| Kode | Kondisi |
|---|---|
| `ASSET_UNVERIFIED` | ada baris di `v_publish_blockers` untuk entitas (aset `UNVERIFIED` dirujuk) |
| `SOURCE_MISSING` | `origin=OPEN_LICENSED_ADAPTED` tanpa `source_id` |
| `MATERIAL_MISSING` | sub-modul tanpa baris `learning_materials` |
| `DRILL_NOT_PUBLISHED` | sub-modul tanpa set `ACTIVE_DRILL` berstatus `PUBLISHED` |
| `NO_QUESTIONS` | set (selain `TIER_BOSS_EXAM` induk) dengan `question_count = 0` |
| `NO_OBJECTIVE_QUESTIONS` | set `ACTIVE_DRILL`, `SKIP_MODULE_TEST`, `SKIP_TIER_TEST`, `PLACEMENT_TEST`, atau `BOSS_SECTION` skill `LISTENING`/`READING` tanpa satu pun soal tipe objektif (selain `WRITING_TASK`/`SPEAKING_TASK`) |
| `PLACEMENT_BANK_TOO_SMALL` | `PLACEMENT_TEST` kurang dari 25 soal atau < 5 per `difficulty` |
| `BOSS_SECTIONS_MISSING` | `TIER_BOSS_EXAM` tanpa anak `LISTENING` dan `READING` `PUBLISHED` |
Urutan `--publish`: set `ACTIVE_DRILL`/Skip/Placement/`BOSS_SECTION` -> `TIER_BOSS_EXAM` -> `learning_materials` mengikuti sub-modul -> sub-modul -> modul. Sukses menetapkan `status='PUBLISHED'`, `reviewed_by = actor.userId` (NULL untuk CLI), `reviewed_at = now()`, `version`/`content_version` tidak berubah, `audit_log` `CONTENT_PUBLISHED`.

## Database Changes
Migrasi bertag `spec_004_content_foundation`:
| Tabel | Perubahan | Tipe | Null | Default |
|---|---|---|---|---|
| `content_assets` | tambah kolom `asset_code` | `varchar(80)` | NULL | tanpa default; `UNIQUE` (indeks `content_assets_asset_code_uq`, parsial `WHERE asset_code IS NOT NULL`) |
Seed: modul `curriculum-structure` (4 Tier, 13 Modul, 31 Sub-Modul). Tidak ada perubahan lain. Nama kolom selaras `data-model.md`.

## UI/UX
Tidak ada layar baru. Verifikasi manual: setelah seed, `/peta` (SPEC-003) menampilkan 4 Tier, 13 Modul, 31 sub-modul berlabel "Segera hadir"; setelah `--publish` Golden Sample, node GS-1/2/3 tersedia.

## Acceptance Criteria
- [ ] **Given** DB kosong terseed **When** `npm run db:seed` dijalankan dua kali **Then** `tiers`=4, `modules`=13, `sub_modules`=31 (T1=8, T2=8, T3=9, T4=6), semua `modules.status` dan `sub_modules.status` = `DRAFT`, dan eksekusi kedua tidak menambah baris.
- [ ] **Given** nilai Tier **When** diquery **Then** `boss_gate_type/value` = (PERCENT,80.0), (BAND,5.0), (BAND,6.0), (BAND,7.0) untuk Tier 1..4 dan `skip_threshold_percent=85` semua.
- [ ] **Given** direktori `content/golden-sample` **When** `npm run content:validate -- --dir content/golden-sample` **Then** exit 0 tanpa galat, dan hitungan: sub-modul = 3, set `ACTIVE_DRILL` = 3 (10 soal masing-masing), `PLACEMENT_TEST` = 1 (30 soal; 6 per `difficulty`), `SKIP_MODULE_TEST` = 1 (12 soal), `TIER_BOSS_EXAM` = 1 dengan 4 `BOSS_SECTION`.
- [ ] **Given** komposisi tipe soal GS-1/2/3 **When** divalidasi **Then** persis sesuai tabel Golden Sample (uji otomatis menghitung per `question_type`).
- [ ] **Given** paket valid **When** `content:import` pertama **Then** semua entitas dibuat berstatus `DRAFT`, `content_revisions` terisi, `audit_log` `CONTENT_IMPORTED_CLI` tercatat; **When** dijalankan kedua kali **Then** semua item `NOOP` dan tidak ada baris baru.
- [ ] **Given** contoh PRD 7.3 apa adanya (`contract_version "1.0"`, `image_url` `/storage/tier2/slides/passive-diagram-flow.webp`, `video_id` `YOUTUBE_VIDEO_ID`) **When** divalidasi **Then** galat `placeholder_video` pada `materials.videos[0].video_id`; dengan `video_id` diganti `dQw4w9WgXcQ` dan aset `tier2/slides/passive-diagram-flow` ada **Then** valid.
- [ ] **Given** `correct_answers` MCQ yang tidak ada di `options` **When** divalidasi **Then** galat `answer_not_in_options` dengan `path` `sub_modules[0].active_drill.questions[1].correct_answers[0]`.
- [ ] **Given** dua soal bersama `question_id` dalam set **When** divalidasi **Then** galat `duplicate_question_id`; pada Boss, `question_id` yang sama di dua section berbeda juga galat.
- [ ] **Given** JSON berisi kunci `__proto__` **When** divalidasi **Then** galat `forbidden_key` dan `Object.prototype` tidak tercemar (uji `({}).polluted === undefined`).
- [ ] **Given** field `foo` tak dikenal **When** divalidasi **Then** galat `unrecognized_key`.
- [ ] **Given** entri manifest dengan `file` `../../etc/passwd` **When** divalidasi **Then** galat `path_traversal`; berkas `.svg` menghasilkan `svg_not_allowed`; berkas `.webm` berekstensi `.png` menghasilkan `mime_mismatch`.
- [ ] **Given** `import --publish` dengan video `UNVERIFIED` **When** dijalankan **Then** exit 2, tidak ada entitas berubah menjadi `PUBLISHED`, dan keluaran memuat `ASSET_UNVERIFIED` beserta `asset_code`/`external_ref`.
- [ ] **Given** semua aset terverifikasi **When** `import --publish` **Then** exit 0 dan set drill, sub-modul, modul terkait `PUBLISHED`; `/peta` menampilkan GS-1 `UNLOCKED` bila predecessor selesai.
- [ ] **Given** sub-modul tanpa `active_drill` **When** `--publish` **Then** penghalang `DRILL_NOT_PUBLISHED`.
- [ ] **Given** Placement dengan 24 soal **When** `--publish` **Then** penghalang `PLACEMENT_BANK_TOO_SMALL`.
- [ ] **Given** item UPDATE pada set yang sudah `PUBLISHED` **When** diimpor ulang dengan isi berbeda lewat CLI dengan `--allow-published-overwrite` (tanpa flag: ditolak exit 1 `published_overwrite_blocked`, tidak ada perubahan) **Then** `version` naik 1, status tetap `PUBLISHED`, `content_revisions` menyimpan snapshot versi lama.
- [ ] **Given** insert `assessment_sets` dengan `assessment_type='ACTIVE_DRILL'` namun `tier_id` terisi **When** diuji integrasi **Then** CHECK `assessment_sets_scope_chk` menolak.
- [ ] **Given** CI **When** `npm run test` **Then** uji unit untuk setiap aturan silang di tabel Question (>= 1 kasus lulus dan >= 1 kasus gagal per baris) hijau.

## Edge Cases & Validation
- [ ] `article_markdown` mengandung `<script>`: galat `raw_html_not_allowed`. Blok kode berpagar (``` ```) boleh mengandung `<`.
- [ ] `end_sec <= start_sec` atau `> 21600`: galat `invalid_video_range`.
- [ ] `slides[].order` duplikat: galat `duplicate_slide_order`.
- [ ] `module_category` tidak sama dengan `skill_category` modul yang sudah ada: galat `category_mismatch`.
- [ ] `origin=OPEN_LICENSED_ADAPTED` tanpa `source_code`: galat `source_required`; `source_code` tidak dikenal: `source_not_found`; sumber `LINK_ONLY_COPYRIGHTED` dengan konten disalin: galat `source_not_storable`.
- [ ] `PLACEMENT_TEST` tanpa `difficulty` pada soal: galat `difficulty_required`.
- [ ] `passage_no` melebihi jumlah bagian `===PASSAGE===`: galat `passage_out_of_range`.
- [ ] Lebih dari 3 bagian `===PASSAGE===`: galat `too_many_passages`; label paragraf `[X] ` ganda dalam satu teks: `duplicate_paragraph_label` (memakai `parsePassages` SPEC-010).
- [ ] `PLACEMENT_TEST` berisi `WRITING_TASK`/`SPEAKING_TASK`: galat `ai_task_not_allowed`.
- [ ] Berkas paket > 5 MB atau > 2.000 item: galat `package_too_large`.
- [ ] Transaksi gagal di tengah penerapan: rollback penuh, tidak ada entitas/aset yatim; berkas storage yang sudah disalin dihapus.
- [ ] Kunci `asset_code` sama dengan berkas berbeda (hash berbeda) sudah ada di DB: galat `asset_code_conflict` (tidak menimpa).

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; delta skema `content_assets.asset_code` |
| 2026-11-03 | Fixer Agent | O-1 (E2E Fase 3): CLI `import` menolak UPDATE pada entitas PUBLISHED tanpa `--allow-published-overwrite` dan selalu menolak UPDATE pada set dengan attempt hidup (ADR-003 #39). |
