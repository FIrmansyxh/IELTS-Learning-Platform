# ADR-002: Runtime AI Lokal dan Penetapan Model Bertahap (Model Belum Dikunci)

**Status:** `Accepted` (didelegasikan, lihat ADR-003)
**Date:** 2026-11-03
**Author Agent:** SysArch
**Phase:** Planning

---

## Context

Penilaian Writing/Speaking memakai Ollama dan whisper.cpp lokal. RAM/GPU mesin belum diketahui (Open Question 1 requirements; R6). Estimasi kasar: tanpa GPU, LLM 7B menghasilkan umpan balik dalam 1 sampai 4 menit sehingga melewati target 10 sampai 60 dtk; model 3B mendekati target dengan kualitas lebih rendah; GPU >=8 GB VRAM memenuhi target.

## Decision

1. Tidak mengunci model sekarang. Model, nama, dan `keep_alive` dikonfigurasi lewat env (`OLLAMA_MODEL_WRITING`, `OLLAMA_MODEL_SPEAKING`, `STT_MODEL`), tanpa hard-code di kode.
2. Menetapkan tiga tier (A: 3B + whisper base, B: 7/8B + whisper small, C: GPU 7/8B+) dan fallback `AI_ENABLED=false` (self-assessment) untuk mesin <8 GB RAM. Matriks ada di `infrastructure.md` bagian 6.
3. Pemilihan final dilakukan setelah human menjawab OQ-1 dan skrip benchmark dijalankan: pilih model terkecil dengan JSON schema valid >=95 persen dan latensi dalam target atau disetujui human.
4. Semua pemanggilan lewat adaptor `LlmClient`/`SttClient` (base URL dari env) sehingga Ollama bisa di container atau host, dan model/penyedia bisa diganti tanpa mengubah logika domain.
5. Job AI berurutan (concurrency 1), timeout per job, retry dengan backoff, dan fallback self-assessment bila gagal.

## Alternatives Considered

| Opsi | Pro | Kontra | Dipilih? |
|------|-----|--------|----------|
| Konfigurasi model via env + benchmark | Fleksibel, menunggu data nyata | Butuh langkah benchmark | ✅ |
| Kunci 7B sekarang | Sederhana | Bisa terlalu lambat/berat di mesin sasaran | ❌ |
| Kunci 3B sekarang | Aman di RAM kecil | Kualitas skor mungkin tak dipercaya (R2) | ❌ |
| API berbayar sebagai cadangan | Kualitas tinggi | Melanggar biaya nol; hanya opsi masa depan | ❌ |

## Consequences

- **Positif:** keputusan berbasis data; tidak ada rework kode saat ganti model.
- **Negatif / Trade-off:** spec AI grader (Analyst/Backend) harus menunggu OQ-1 untuk target latensi final; UX antrean harus dirancang untuk waktu tunggu menit.
- **Dokumen acuan yang ikut berubah:** `infrastructure.md`, `capacity_planning.md`; kelak `project_overview.md` bagian 4 (model default).
- **Agen yang perlu tahu:** Analyst, Backend, UX Designer (state antrean/progres), Reliability.

## Revision History

| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-03 | SysArch | ADR dibuat |
