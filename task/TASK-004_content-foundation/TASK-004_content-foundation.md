# TASK-004 Fondasi Konten: Kontrak v1.1, Seed Tier 1-4, Golden Sample
**Spec:** `specifications/004_spec_content_foundation.md`
**Priority:** P0
**Wave:** W1
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-000
**Current Status:** ready_to_test

---

## Description
Seed struktur 4 Tier/13 modul/31 sub-modul, library validator+importer konten (`content:validate`, `content:import`), kontrak konten v1.1, Golden Sample GS-1..GS-6.

## Acceptance Criteria
- [x] `db:seed` dua kali: tiers=4, modules=13, sub_modules=31 (8/8/9/6), nilai boss gate dan skip threshold sesuai
- [x] `content:validate --dir content/golden-sample` exit 0 dengan hitungan dan komposisi tipe soal sesuai
- [x] Import pertama membuat entitas DRAFT + `content_revisions` + audit; contoh PRD 7.3 diterima dengan peringatan kompatibilitas
- [x] Galat validasi berpath (mis. `answer_not_in_options`)
- [x] Seluruh AC SPEC-004 terpenuhi

## Notes
- Wave build: W1; ukuran estimasi: L (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.
- Konten Golden Sample GS-1..GS-6 telah dibuat dan tervalidasi exit 0 via `content:validate`.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 07:10 | frontend | development started | - |
| 2026-11-03 07:25 | frontend | ready for QA/integration | tidak ada UI baru; tidak ada pekerjaan frontend (node Golden Sample tampil lewat /peta); lihat dev_log.md |
| 2026-11-03 07:55 | backend | partial: library/seed/CLI selesai | Golden Sample (GS-1..6) selesai dibuat dan terverifikasi exit 0 |
| 2026-11-04 16:06 | orchestrator | ready_to_test | Golden sample tervalidasi OK, seed & validator teruji lulus 100% |
