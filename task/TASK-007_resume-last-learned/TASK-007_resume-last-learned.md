# TASK-007 Resume Last Learned dan Dashboard
**Spec:** `specifications/007_spec_resume_last_learned.md`
**Priority:** P0
**Wave:** W2
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-003, TASK-005, TASK-006
**Current Status:** ready_to_test

---

## Description
`PUT/GET /me/last-learned`, kartu Resume dashboard dengan posisi video/tab/soal, `resume_path`, validasi video dan attempt.

## Acceptance Criteria
- [ ] `PUT` menyimpan posisi; `GET` memberi `state=RESUME`, `position_label`, `resume_path` benar
- [ ] Attempt GRADED mengabaikan `last_question_index`
- [ ] `active_attempt_id` milik pengguna lain disimpan NULL tanpa membocorkan; video di luar sub-modul 400
- [ ] Seluruh AC SPEC-007 terpenuhi

## Notes
- Wave build: W2; ukuran estimasi: M (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 08:30 | frontend | development started | - |
| 2026-11-03 08:30 | frontend | ready for QA/integration | ResumeCard, dashboard, PositionRecorder, pemulihan posisi selesai terhadap kontrak; integrasi dengan backend belum diuji |
| 2026-11-03 11:50 | backend | development started | - |
| 2026-11-03 11:58 | backend | ready for QA/integration | unit + integration lulus; lihat dev_log [BACKEND] |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test failed | Issues: D-004 (axe pada /) |
| 2026-11-03 19:00 | fixer agent | fixing started | Issues: D-004 |
| 2026-11-03 19:05 | fixer agent | fix complete, ready to test | --color-text-muted menjadi #556376 (lihat TASK-003). |
| 2026-11-03 19:30 | test agent | test passed | Run penuh bersih Fase 3: 105 lulus/0 gagal/1 skip (+ spec012b AI mati lulus); defek terkait terverifikasi |
