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

## Consequences

- Perlu spec baru/revisi: SPEC-012 (Writing GT), SPEC-013 (Speaking via prompt eksternal), SPEC-009 (tabel band GT), SPEC-004 (kontrak konten v1.2), spec baru Learning Track dan Mix Builder.
- Tidak ada lagi dependensi `ollama` di jalur default; `.env.example`, `docs`, `bench-ai`, dan README perlu disesuaikan.
- Build Vulkan sedikit lebih lambat dari CUDA pada prompt processing; dapat diganti build CUDA tanpa perubahan kode.

## Revision History

| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | ADR dibuat (Proposed) |
