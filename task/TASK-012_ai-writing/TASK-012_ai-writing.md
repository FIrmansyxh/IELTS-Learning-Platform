# TASK-012 Penilaian AI Writing dan Mini-Task Writing
**Spec:** `specifications/012_spec_ai_writing.md`
**Priority:** P1
**Wave:** W6
**Size:** XL
**Assigned To:** Developer Agent
**Dependencies:** TASK-000, TASK-001, TASK-002, TASK-005, TASK-006, TASK-009
**Current Status:** ready_to_test

---

## Description
Submission Writing, job pg-boss, penilaian Ollama (driver mock untuk uji), pasca-proses kode (rata-rata kriteria, kap panjang/bahasa/band >= 8), deteksi injeksi prompt, hasil terstruktur.

## Acceptance Criteria
- [ ] `POST /submissions/writing` 202 (mock LLM) lalu GRADED dengan `evaluation` terstruktur
- [ ] `overall_band` selalu dihitung ulang di kode; kap panjang (<50% -> 3.5), bahasa non-Inggris (<= 4.0), band >= 8.0 -> 7.5
- [ ] Injeksi prompt ditandai (`injection_suspected`, audit `AI_INJECTION_SUSPECTED`)
- [ ] `AI_ENABLED=false` ditangani; benchmark C-09 mengunci model
- [ ] Seluruh AC SPEC-012 terpenuhi

## Notes
- Wave build: W6; ukuran estimasi: XL (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.
- Menunggu keputusan model dari C-09 (`bench:ai`); gunakan driver mock untuk pengembangan/uji; seed rubrik butuh C-05.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 14:00 | frontend | development started | - |
| 2026-11-03 14:30 | frontend | ready for QA/integration | UI selesai terhadap kontrak; integrasi backend belum diuji; lihat dev_log.md [FRONTEND] |
| 2026-11-03 14:20 | backend | development started | - |
| 2026-11-03 14:20 | backend | ready for QA/integration | Backend: POST/GET/daftar/retry/self-assessment/status/admin, pipeline LLM mock + Zod + aturan skor, kuota, antrean, fallback, purge raw output; tsc/eslint/vitest/test:integration hijau (mock LLM/STT); Ollama/whisper.cpp nyata dan benchmark C-09 belum diverifikasi; lihat dev_log.md |
| 2026-11-03 14:40 | backend | QA fixes applied (F-12-01, -02, -03, -05) | tsc/eslint bersih; vitest 786, test:integration 404 lulus; lihat dev_log.md [BACKEND] perbaikan QA |
| 2026-11-03 14:45 | frontend | QA W6 fixes done | F-12-04, F-12-10; vitest 786 lulus; lihat dev_log.md [FRONTEND] |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test passed | E2E lulus |
