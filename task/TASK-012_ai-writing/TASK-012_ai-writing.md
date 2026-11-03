# TASK-012 Penilaian AI Writing dan Mini-Task Writing
**Spec:** `specifications/012_spec_ai_writing.md`
**Priority:** P1
**Wave:** W6
**Size:** XL
**Assigned To:** Developer Agent
**Dependencies:** TASK-000, TASK-001, TASK-002, TASK-005, TASK-006, TASK-009
**Current Status:** not_started

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
