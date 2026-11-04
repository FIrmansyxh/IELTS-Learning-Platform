# TASK-013 Penilaian AI Speaking (Rekam, STT)
**Spec:** `specifications/013_spec_ai_speaking.md`
**Priority:** P1
**Wave:** W6
**Size:** XL
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-005, TASK-006, TASK-012
**Current Status:** ready_to_test

---

## Description
Persetujuan rekaman, unggah audio webm Opus tervalidasi, STT whisper.cpp, penilaian Ollama, kap durasi Part 2, retensi rekaman.

## Acceptance Criteria
- [ ] Tanpa consent 409 `RECORDING_CONSENT_REQUIRED`; webm valid 202 tersimpan di `private/recordings/`
- [ ] Tipe palsu 415; 11 MB 413 dengan pembacaan dihentikan (<= 10 MB + 64 KB)
- [ ] Audio 151 dtk `AUDIO_TOO_LONG`; transkrip 3 kata `STT_EMPTY`; STT mock mengisi transkrip
- [ ] Pronunciation selalu 'diperkirakan'; retensi rekaman berjalan
- [ ] Seluruh AC SPEC-013 terpenuhi

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
| 2026-11-03 14:20 | backend | ready for QA/integration | Backend: consent, unggah tervalidasi, STT, penilaian, retensi/purge rekaman, pelayanan/hapus/audit rekaman; tsc/eslint/vitest/test:integration hijau (mock LLM/STT); Ollama/whisper.cpp nyata dan benchmark C-09 belum diverifikasi; lihat dev_log.md |
| 2026-11-03 14:40 | backend | QA fixes applied (F-13-01, -02, -06 sebagian) | tsc/eslint bersih; vitest 786, test:integration 404 lulus; lihat dev_log.md [BACKEND] perbaikan QA |
| 2026-11-03 14:45 | frontend | QA W6 fixes done | F-12-04, F-13-11, F-12-10; vitest 786 lulus; lihat dev_log.md [FRONTEND] |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test passed | E2E lulus |
