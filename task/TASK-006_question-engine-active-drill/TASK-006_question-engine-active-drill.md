# TASK-006 Mesin Soal Multi-Format dan Active Drill
**Spec:** `specifications/006_spec_question_engine_active_drill.md`
**Priority:** P0
**Wave:** W2
**Size:** XL
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-003, TASK-004, TASK-005
**Current Status:** ready_to_test

---

## Description
Attempts API, 10 tipe soal objektif, penilaian server, pengacakan urutan soal/opsi, umpan balik per soal pada Drill, autosave, resume attempt, submit memanggil `applyDrillResult`.

## Acceptance Criteria
- [ ] `POST /attempts` 201 mode PRACTICE; 409 `LEARN_NOT_COMPLETED` bila materi belum selesai; attempt aktif dilanjutkan (`resumed=true`)
- [ ] Payload sebelum submit tidak membocorkan kunci/pembahasan/skor
- [ ] Setiap tipe soal (10) dinilai benar sesuai aturan; urutan soal dan option_id teracak per attempt
- [ ] Tipe set belum aktif -> 409 `ASSESSMENT_TYPE_NOT_ENABLED`
- [ ] Seluruh AC SPEC-006 terpenuhi

## Notes
- Wave build: W2; ukuran estimasi: XL (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 08:30 | frontend | development started | - |
| 2026-11-03 08:30 | frontend | ready for QA/integration | UI mesin soal 12 tipe, Active Drill, hasil, ExamShell/Navigator selesai terhadap kontrak; integrasi dengan backend belum diuji |
| 2026-11-03 11:50 | backend | development started | - |
| 2026-11-03 11:58 | backend | ready for QA/integration | unit + integration lulus; lihat dev_log [BACKEND] |
