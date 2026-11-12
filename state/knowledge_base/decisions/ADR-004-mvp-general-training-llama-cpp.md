# ADR-004: Pivot MVP ke IELTS General Training, Runtime LLM llama.cpp, Speaking via Prompt Eksternal

**Status:** `Proposed` (menunggu persetujuan human pada gate)
**Date:** 2026-11-08
**Author Agent:** Orchestrator (atas permintaan human)
**Phase:** Planning / perubahan lingkup

## Context

Permintaan human (2026-11-08):
1. Target platform adalah skor tinggi **IELTS General Training** (bukan Academic, bukan profesional/working).
2. Platform perlu beberapa **jalur kurikulum** (susunan materi dan gaya penyampaian berbeda) dan **modul soal yang dapat dicampur**.
3. MVP: LLM lokal hanya **mengevaluasi** jawaban Writing (tidak membuat soal). Evaluasi Speaking otomatis ditunda.
4. Speaking tetap dilatih: tiap soal Speaking memiliki **prompt siap-salin** untuk AI pihak ketiga (Claude/GPT/Gemini) mode suara.
5. Runtime LLM: pilih yang paling kuat untuk laptop pemilik; hapus Ollama bila ada yang lebih baik.

Perangkat keras (diukur 2026-11-08): i9-11900H (8C/16T), RAM 31,8 GB, RTX 3060 Laptop 6 GB VRAM, driver CUDA 13.4. Docker belum terpasang.

## Decision

1. **Runtime LLM = llama.cpp `llama-server`** (build Vulkan dari winget `ggml.llamacpp`; opsi upgrade build CUDA), API OpenAI-compatible di `127.0.0.1:8080`. Ollama dicopot. Alasan: kontrol offload GPU/CPU pada VRAM 6 GB, KV-cache dan context terkontrol, dukungan JSON-schema/grammar bawaan untuk keluaran terstruktur, tanpa daemon tambahan. Model disimpan di `G:\llm-models` (`LLAMA_CACHE`).
2. Adaptor `LlmClient` (ADR-002 #4) mendapat driver baru `llamacpp` (`LLM_DRIVER=llamacpp`, `LLM_BASE_URL`); driver `ollama` dipertahankan sebagai opsi, tidak lagi default.
3. Model awal: Qwen2.5-7B-Instruct Q4_K_M; kandidat pembanding Llama-3.1-8B-Instruct. Pemenang ditetapkan lewat `bench:ai` (JSON valid >=95%, latensi disetujui human).
4. **Evaluasi Writing GT**: konteks soal (jenis surat formal/semi-formal/informal, penerima, poin wajib, batas kata 150/250) dikirim ke prompt dan rubrik. Task 1 dan Task 2 berbobot 1:2. LLM hanya menilai, tidak menghasilkan soal.
5. **Speaking**: pipeline STT/penilaian otomatis dinonaktifkan lewat flag (`SPEAKING_AI_ENABLED=false`), tidak dihapus. Kontrak konten mendapat field `external_eval_prompt` pada soal Speaking; UI menampilkan tombol "Salin prompt".
6. **Target General Training**: konten Academic (Task 1 grafik/peta/diagram, Academic Reading Hacks, AWL) diganti/diberi tag; tabel band Reading diganti tabel GT; Listening tetap.
7. **Tahap berikutnya (setelah MVP)**: entitas Learning Track (banyak jalur kurikulum) dan Question Bank dengan Mix Builder (pilih sendiri + campur otomatis berdasarkan radar).

## Temuan uji awal (2026-11-08, Qwen2.5-7B-Instruct Q4_K_M, Vulkan, RTX 3060 6 GB)

- Kecepatan: generasi ±43 token/detik; satu evaluasi surat 15-35 detik. Memenuhi target 10-60 detik.
- JSON valid 100% pada 5 percobaan berkat `json_schema` (grammar), dengan pembulatan band ke 0,5 di pipeline.
- Kualitas BELUM memadai untuk dikunci: (1) surat bagus dinilai terlalu murah hati (band 7,5-8 untuk surat yang wajar bernilai ±6,5-7); (2) pada tulisan lemah, field teks sering berupa `snake_case` alih-alih kalimat Indonesia. Surat lemah tetap diberi band rendah dan `task_requirement_met=false` dengan benar.
- Tindak lanjut: bandingkan Llama-3.1-8B, Qwen3-8B, dan Gemma-2-9B pada set esai uji bersertifikat (band diketahui), pertimbangkan penilaian dua tahap (analisis bebas lalu JSON), lalu kunci model lewat `bench:ai` yang diadaptasi ke driver llama.cpp.
- Tabel band Reading General Training belum diganti: enum DB `READING_ACADEMIC` perlu migrasi ke `READING_GENERAL` (menyentuh 8 file dan tes integrasi).

## Hasil benchmark model (2026-11-08, `scripts/bench-gt-writing.mts`, 7 kasus: 4 surat + 3 esai, satu kali jalan per model)

Catatan metode: rentang band acuan ditetapkan oleh agen (label band esai bawaan repo ±0,5 dan penilaian atas surat buatan sendiri), belum diverifikasi penguji IELTS. Satu kali jalan per model, sehingga ada derau. MAE hanya dihitung pada keluaran valid.

| Model (Q4_K_M) | JSON valid | Band dalam rentang | MAE band | Urutan benar (surat/esai) | Indonesia baik | p50 latensi |
|---|---|---|---|---|---|---|
| Qwen2.5-7B | 5/7 | 1/7 | 1,25 | ya / tidak | 52% | 33 dtk |
| Llama-3.1-8B | 7/7 | 1/7 | 1,39 | ya / ya | 100% | 56 dtk |
| Qwen3-8B | 4/7 | 4/7 | 0,25 | tidak / tidak | 50% | 91 dtk |
| Gemma-2-9B | tidak layak | - | - | - | - | 170-200 dtk (berkas 6,8 GB bocor ke CPU; timeout) |

Kesimpulan: tidak ada model yang layak dikunci apa adanya. Llama-3.1-8B paling andal secara format dan bahasa tetapi menilai terlalu tinggi (esai band 5 diberi 6,5; band 6 dan 7 diberi 8). Qwen3-8B paling akurat saat keluarannya utuh tetapi 3 dari 7 keluaran terpotong (batas 1500 token) dan lambat. Gemma-2-9B tidak muat nyaman di VRAM 6 GB. Skor LLM harus diperlakukan sebagai indikatif sampai dikalibrasi.

## Addendum 2026-11-08 (disetujui human: "Setuju semua")

1. **Tag `exam_module`.** Konten dan sub-modul diberi tag `COMMON`, `GENERAL_TRAINING`, atau `ACADEMIC`. Tampilan learner hanya memuat `COMMON` + `GENERAL_TRAINING`; konten Academic yang ada (Task 1 grafik/peta/diagram, AWL) disembunyikan, tidak dihapus. Gatekeeping berurutan (SPEC-003) harus melewati sub-modul tersembunyi tanpa mengunci; desain rinci dan migrasi diputuskan saat implementasi (spec perubahan SPEC-003/004 terpisah). Dasar fakta: Listening dan Speaking identik pada kedua ujian, Reading dan Writing Task 1 berbeda, Task 2 mirip.
2. **Tabel band Reading General** (`READING_GENERAL`, SPEC-023) menggantikan tabel Academic sebagai tabel Reading aktif.
3. **Simulasi tes per section** -> SPEC-023. **Listening** -> SPEC-024 (skrip + TTS lokal + aset audio, bukan penilaian AI).
4. **Penilaian Speaking** -> SPEC-013 addendum (prompt eksternal + input skor), sudah diimplementasikan.
5. **UI Writing** dipasang ke drill/ujian dan Mini-Task (panel `WritingTaskPanel`).
6. **Status implementasi (2026-11-08):** tag `exam_module` pada `sub_modules` (migrasi 0009; filter di `loadSnapshot` lewat `EXAM_MODULE`, default `GENERAL_TRAINING`) dan tabel band `READING_GENERAL` (migrasi 0008) SUDAH ada. Sub-modul 3.3.1 dan 4.1.1 bertag ACADEMIC; penggantinya 3.3.3 (surat) dan 4.1.3 (kosakata sehari-hari/kerja) bertag GENERAL_TRAINING. Konten 3.3.3 sudah ditulis (`codes/content/gt-modules/3.3.3`); konten 4.1.3 belum.

## Addendum 2026-11-11: benchmark putaran 2 (model generasi 2026 dan MoE dengan offload CPU)

Alasan: daftar kandidat putaran 1 (Qwen2.5, Llama-3.1, Qwen3, Gemma-2) generasi lama, dan kelas MoE dengan expert di RAM (RAM mesin 31,8 GB) belum diuji. Skrip sama (`scripts/bench-gt-writing.mts`, 7 kasus, satu kali jalan per model, rentang band acuan ditetapkan agen, belum diverifikasi penguji IELTS). Skrip kini menerima flag server per model (`label=repo:quant|--flag ...`) dan mengirim `reasoning_effort: 'low'` (untuk gpt-oss; template lain mengabaikannya). Mesin: i9-11900H, RAM 31,8 GB, RTX 3060 Laptop 6 GB, `llama-server` build 12182 (Vulkan).

| Model | Flag | JSON valid | Band dalam rentang | MAE band | Urutan surat/esai | Indonesia baik | p50 latensi |
|---|---|---|---|---|---|---|---|
| gpt-oss-20b MXFP4 | `--n-cpu-moe 20 -ngl 99` | 7/7 | 6/7 | 0,39 | ya / ya | 20% | 91 dtk |
| Gemma 4 26B-A4B UD-Q4_K_M | `--no-mmproj` (auto-fit) | 7/7 | 4/7 | 1,25 | ya / ya | 90% | 92 dtk |
| Qwen3.5-4B Q4_K_M | - | 7/7 | 3/7 | 1,39 | ya / ya | 73% | 22 dtk |
| Qwen3.5-9B Q4_K_M | - | 5/5 sebelum timeout | 3/5 | - | - | 0% | 151-261 dtk per kasus (timeout 300 dtk di kasus 6) |
| Qwen3.6-35B-A3B UD-Q4_K_M | `--cpu-moe -ngl 99`, lalu `--no-mmproj` | gagal | - | - | - | - | timeout di kasus pertama pada kedua konfigurasi |
| Gemma 4 E4B | `:Q4_K_M` | gagal dimuat | - | - | - | - | repo `ggml-org/gemma-4-E4B-it-GGUF` tidak punya Q4_K_M (hanya Q4_0, Q8_0, BF16); belum diulang dengan `Q4_0` |

Temuan:
1. **Tidak ada model yang layak dikunci.** gpt-oss-20b paling akurat (MAE 0,39; surat bagus dinilai 7, tidak melambung) tetapi 5 dari 7 evaluasi berisi komentar placeholder (`K1`, `komentar1`, ...), jadi umpan balik untuk siswa tidak dapat dipakai, dan latensi 91 dtk melewati target 10-60 dtk. Gemma 4 26B menulis bahasa Indonesia yang baik tetapi menilai terlalu tinggi (surat bagus dan dua esai diberi band 9). Qwen3.5-4B satu-satunya dalam target latensi tetapi pola melambungnya sama (band 8,5-9).
2. **Penyebab kegagalan Qwen3-8B (putaran 1) bukan mode berpikir.** Skrip sudah mengirim `enable_thinking: false`; keluaran yang gagal berisi loop degenerat (`task_response_comment_1111...`). Dugaan awal bahwa itu efek thinking keliru.
3. **`--cpu-moe` (semua expert di CPU) membuat pemrosesan prompt sangat lambat pada Vulkan** (Gemma 4 26B tercatat 1-2 token/dtk) sehingga timeout. Dugaan dari log, belum diuji terpisah. Qwen3.6-35B tetap timeout tanpa flag itu; nilai `--n-cpu-moe` parsial yang berhasil belum ditemukan, jadi belum terbukti mustahil.
4. Model 9B+ dense tidak layak pada VRAM 6 GB (jatuh ke CPU, 150-260 dtk per evaluasi).

Arah berikutnya (belum diuji, belum diputuskan human): gpt-oss-20b dengan prompt yang menegaskan komentar berupa kalimat, atau dua tahap (skor dari satu model, teks dari model lain); kalibrasi dengan esai berlabel penguji IELTS; ulangi Gemma 4 E4B dengan `Q4_0` dan Qwen3.6-35B dengan `--n-cpu-moe` parsial. Sampai itu selesai, skor LLM lokal tetap diperlakukan indikatif dan `AI_ENABLED` tetap dapat dimatikan (fallback self-assessment, ADR-002).

Hasil mentah ada di `G:\llm-models\bench-gt-new.json`, `bench-gt-moe.json`, dan `bench-gt-moe2.json` (di luar repo).

## Addendum 2026-11-11 (2): putaran 3-4 dan penetapan model penilai Writing

**Putaran 3** (7 kasus lama, 3 ulangan, dengan dua petunjuk prompt tambahan `text` dan `calib` pada pesan pengguna; skrip `--reps 3 --hint "text,calib"`):

| Model | Valid | Band dalam rentang | MAE | Indonesia baik | p50 | Selisih antar ulangan |
|---|---|---|---|---|---|---|
| gpt-oss-20b | 21/21 | 20/21 | 0,42 | 97% | 73 dtk | 0,71 |
| Gemma 4 26B-A4B | 21/21 | 14/21 | 0,96 | 97% | 85 dtk | 0,21 |
| Qwen3.5-4B | 17/21 | 8/21 | 1,19 | 99% | 24 dtk | 0,14 |

Petunjuk `text` menghilangkan komentar placeholder gpt-oss (`K1`, `komentar1`); `calib` menekan, tetapi tidak menghilangkan, skor melambung pada Gemma/Qwen. Karena petunjuk ditulis setelah melihat kegagalan pada kasus yang sama, hasil putaran 3 berisiko terlalu optimistis.

**Putaran 4 (held-out)**: 8 kasus baru dengan soal dan topik berbeda (`scripts/bench/gt-cases-heldout.mts`; surat ke teman, pemilik kontrakan, atasan; esai kerja dari rumah band 5/6/7 dan esai di luar topik), 3 ulangan, petunjuk sama:

| Model | Valid | Band dalam rentang | MAE | Indonesia baik | p50 | Selisih antar ulangan |
|---|---|---|---|---|---|---|
| gpt-oss-20b | 24/24 | 18/24 | 0,66 | 96% | 68 dtk | 0,44 |
| Qwen3.5-4B | 22/24 | 14/24 | 0,73 | 99% | 23 dtk | 0,63 |

Temuan: gpt-oss-20b bertahan dengan penurunan wajar. Semua enam kasus di luar rentang meleset 0,5 dari batas. Skala terkompresi: surat lemah diberi 5 (acuan maks 4,5), surat bagus 6-6,5 (acuan 6,5-8), esai band 7 diberi 6-6,5. Urutan kualitas benar; `task_requirement_met` benar pada surat lemah, esai di luar topik, dan surat register salah di semua ulangan. Rentang acuan ditetapkan agen (bukan penguji IELTS), kasus baru ditulis model yang sama dengan penilainya, dan hanya 8 kasus.

**Kebutuhan sumber daya terukur** (RTX 3060 Laptop 6 GB, RAM 31,8 GB, `--n-cpu-moe 20 -ngl 99 -c 6144`, satu permintaan): berkas 12,1 GB; VRAM naik sekitar 3,4 GB (sisa sekitar 1 GB); memori proses 5,2 GB idle lalu 10,7 GB setelah satu permintaan; RAM bebas turun sekitar 10,3 GB; prompt 73 token/dtk, generasi 7,6 token/dtk. Semua dilepas saat server dimatikan. RAM 16 GB tidak diuji.

**Keputusan (disetujui human, 2026-11-11): gpt-oss-20b MXFP4 ditetapkan sebagai model penilai Writing.** Tinjauan atas ketentuan:
1. Skor LLM lokal tetap **indikatif**, bukan setara penguji IELTS; kalibrasi dengan esai berlabel penguji IELTS masih disarankan dan belum dilakukan.
2. Latensi sekitar 70 dtk melewati target 10-60 dtk dan diterima lewat UX antrean (ADR-002). `AI_JOB_TIMEOUT_SEC` disarankan 300 (evaluasi pertama setelah server menyala >250 dtk pada benchmark).
3. `AI_ENABLED=false` (self-assessment) tetap menjadi fallback (ADR-002).
4. Model lain dapat dipasang lewat env tanpa ubah kode (`LLAMACPP_MODEL_WRITING`, `LLAMACPP_HF_REPO`, `LLAMACPP_ARGS`). Qwen3.5-4B (24 dtk) adalah cadangan cepat dengan akurasi lebih rendah.

**Perubahan kode yang menyertai:** `WRITING_USER_HINTS` (petunjuk `text` dan `calib`) ditambahkan ke pesan pengguna di `pipeline.ts`; `LlamaCppClient` mengirim `chat_template_kwargs: { enable_thinking: false, reasoning_effort: 'low' }` dan label default `gpt-oss-20b-mxfp4`; `planLlama` (start-local) tidak menambah `-c 4096` bila `LLAMACPP_ARGS` memuat `-c/--ctx-size`; `.env.example` dan `README.md` diperbarui (model, flag, timeout 300). Benchmark `bench-gt-writing.mts` mendapat `--reps`, `--hint`, `--cases heldout`, dan flag server per model.

**Uji end-to-end langsung (2026-11-11)**, aplikasi `start:local` + `llama-server` gpt-oss-20b nyata, database uji terpisah, lewat UI Latihan campur (soal Writing Task 1 asli dari bank): doctor melaporkan penilai Writing aktif; dua surat dinilai (surat menengah: band 6,0 lalu 6,5 pada penilaian ganda; surat lemah: band 5,0). Tercatat di `ai_evaluations`: `model_name = gpt-oss-20b-mxfp4`, latensi 77-130 dtk (7-9 token/dtk; 1.144-2.060 token total); batas `AI_JOB_TIMEOUT_SEC=300` cukup. UI sudah memuat label "Perkiraan latihan, bukan skor resmi IELTS." dan "AI LOCAL".

**Bug yang ditemukan dan diperbaiki:** `enqueue` pertama setelah proses menyala memanggil `recover()`, yang ikut memasukkan job yang baru dibuat (barisnya sudah `QUEUED` di `async_jobs`), sehingga job pertama tiap sesi dinilai dua kali (dua pemanggilan LLM, dua baris `ai_evaluations`, status sempat kembali `GRADING`). Tersembunyi pada mock karena instan. Perbaikan: `recover(skipJobId)` di `src/server/jobs/queue.ts`; tes regresi di `tests/integration/ai-queue.itest.ts` (gagal tanpa perbaikan: 2 pemanggilan, lulus dengan perbaikan). Terverifikasi di uji langsung: satu permintaan ke llama-server, status `GRADED`.

**Temuan kualitas dari uji langsung (belum diperbaiki):** pada surat lemah, keempat komentar per kriteria hanya berbunyi generik ("Komentar mengenai pencapaian tugas", ...), padahal bagian Kekuatan, Saran, dan Koreksi berisi konten. Pada benchmark, komentar `task_response` gpt-oss berbentuk meta ("Komentar mengenai pencapaian tugas menunjukkan bahwa ...", 15 dari 45 evaluasi putaran 3-4) dan hanya 1 dari 45 yang kosong; metrik "bahasa Indonesia baik" benchmark tidak menangkap pola ini (kalimat generik lolos). Perlu: instruksi prompt yang meminta bukti konkret dari teks siswa dan melarang awalan "Komentar ...", pemeriksaan pasca-LLM yang menolak komentar kosong, dan metrik benchmark yang lebih ketat, lalu uji ulang.

**Belum dilakukan:** status ADR ini masih `Proposed`; sisa variabel `OLLAMA_*` di `.env.example` (driver `ollama` masih didukung); perbaikan komentar generik di atas.

## Addendum 2026-11-11 (3): Speaking dinilai AI lokal penuh (disetujui human)

Atas permintaan human ("iya aktifkan tapi untuk prompt tetap buatkan untuk jaga-jaga saja"), Keputusan #3 dan #5 (penundaan penilaian Speaking otomatis) dicabut.

1. **Speaking dinilai di laptop.** Rekam di browser, STT whisper.cpp lokal (`whisper-server`, build CPU), lalu penilaian 4 kriteria oleh LLM penilai yang sama dengan Writing (gpt-oss-20b, llama-server). Pipeline SPEC-013 yang sudah ada dipakai; `SPEAKING_AI_ENABLED=true`, `STT_DRIVER=whisper`.
2. **STT di CPU, bukan GPU.** llama-server gpt-oss-20b sudah memakai sekitar 4,5 dari 6 GB VRAM; whisper di GPU berisiko kehabisan memori. Build CPU (`whisper-bin-x64`, i9-11900H) dengan model `ggml-small.en` cukup cepat untuk jawaban maksimal 2 menit. Model lain dapat dipasang lewat env tanpa ubah kode.
3. **start-local menyalakan whisper-server** seperti llama-server (opsional, loopback, log di `data/logs/whisper-server.log`) dari `WHISPER_BIN`, `WHISPER_MODEL_PATH`, `STT_BASE_URL`.
4. **Prompt eksternal tetap ada sebagai cadangan.** Setiap soal Speaking tetap menampilkan "Salin prompt" untuk Claude/ChatGPT/Gemini mode suara beserta input skor manual (Addendum SPEC-013 2026-11-08), di bawah perekam. Bila penilai Speaking lokal nonaktif, kartu prompt menjadi tampilan utama seperti sebelumnya.
5. **Batasan yang diterima:** Pronunciation tetap perkiraan dari transkrip dan keyakinan STT (`pronunciation_estimated`); interaksi rekam lalu kirim, bukan percakapan dua arah. Penilaian lafal berbasis fonem adalah kandidat tahap berikutnya.
6. **Offline (ADR-005 #5):** evaluasi Speaking tidak lagi butuh internet; pengecualian hanya berlaku untuk jalur cadangan AI pihak ketiga.

## Consequences

- Perlu spec baru/revisi: SPEC-012 (Writing GT), SPEC-013 (Speaking via prompt eksternal), SPEC-009 (tabel band GT), SPEC-004 (kontrak konten v1.2), spec baru Learning Track dan Mix Builder.
- Tidak ada lagi dependensi `ollama` di jalur default; `.env.example`, `docs`, `bench-ai`, dan README perlu disesuaikan.
- Build Vulkan sedikit lebih lambat dari CUDA pada prompt processing; dapat diganti build CUDA tanpa perubahan kode.

## Revision History

| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | ADR dibuat (Proposed) |
| 2026-11-11 | Claude (atas permintaan human) | Addendum benchmark putaran 2: Qwen3.5, Gemma 4, gpt-oss-20b, Qwen3.6-35B; koreksi penyebab kegagalan Qwen3-8B |
| 2026-11-11 | Claude (atas permintaan human) | Addendum 2: putaran 3-4 (held-out), kebutuhan sumber daya terukur, penetapan gpt-oss-20b MXFP4 sebagai penilai Writing |
| 2026-11-11 | Claude (atas permintaan human) | Addendum 3: Speaking dinilai AI lokal penuh (whisper.cpp CPU + gpt-oss-20b); prompt eksternal dipertahankan sebagai cadangan |
