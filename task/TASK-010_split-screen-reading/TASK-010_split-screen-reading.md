# TASK-010 Split-Screen Reading dengan Highlighter
**Spec:** `specifications/010_spec_split_screen_reading.md`
**Priority:** P0
**Wave:** W5
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-004, TASK-006
**Current Status:** backend_ready

---

## Description
Tata letak dua panel (passage/soal) dengan pembagi dapat digeser (keyboard), highlighter kuning/hijau tersimpan di localStorage, `parsePassages`.

## Acceptance Criteria
- [ ] `parsePassages` sesuai vektor uji; > 3 passage melempar `too_many_passages`
- [ ] Viewport 1280x800: tepat dua panel scroll independen; pembagi ARIA slider (50->65 via ArrowRight, batas)
- [ ] Rasio tersimpan (`split:v1`) dan sorotan pulih setelah refresh; seleksi lintas paragraf tidak memunculkan toolbar
- [ ] Seluruh AC SPEC-010 terpenuhi

## Notes
- Wave build: W5; ukuran estimasi: M (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 13:15 | backend | development started | - |
| 2026-11-03 13:15 | backend | ready for QA/integration | sisi server selesai; lihat dev_log.md [BACKEND] |
| 2026-11-03 13:00 | frontend | development started | - |
| 2026-11-03 13:20 | frontend | ready for QA/integration | ReadingWorkspace + highlighter + parsePassages selesai terhadap kontrak; integrasi backend nyata/E2E belum diuji; lihat dev_log [FRONTEND] |
| 2026-11-03 14:30 | backend | QA W5 fixes done | F-10-01 |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test failed | Issues: D-003 |
| 2026-11-03 19:00 | fixer agent | fixing started | Issues: D-003 |
| 2026-11-03 19:05 | fixer agent | fix complete, ready to test | Root dan header memakai grid-cols-[minmax(0,1fr)] sehingga kolom dibatasi lebar induk (min-w-0). |
| 2026-11-03 19:30 | test agent | test passed | Run penuh bersih Fase 3: 105 lulus/0 gagal/1 skip (+ spec012b AI mati lulus); defek terkait terverifikasi |
