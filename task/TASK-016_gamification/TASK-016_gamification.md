# TASK-016 Gamifikasi: Mahkota, Poin, Speed Streak, Streak Harian
**Spec:** `specifications/016_spec_gamification.md`
**Priority:** P1
**Wave:** W8
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-003, TASK-005, TASK-006, TASK-014
**Current Status:** ready_to_test (Backend + Frontend ready; integrasi/E2E belum diuji)

---

## Description
Mahkota Silver/Gold (>= 75 / >= 90), poin ledger anti-farming (hanya naik bila lebih baik), speed streak, streak harian Asia/Jakarta.

## Acceptance Criteria
- [ ] Poin DRILL/SPEED_STREAK/CROWN dihitung sesuai contoh; attempt ulang hanya menambah selisih
- [ ] Mahkota: 74.99 tidak lulus; 89.99 SILVER; 90.00 GOLD; GOLD tidak turun
- [ ] Submit ganda/serentak tidak menggandakan ledger (indeks unik)
- [ ] Seluruh AC SPEC-016 terpenuhi

## Notes
- Wave build: W8; ukuran estimasi: M (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 15:40 | frontend | development started | - |
| 2026-11-03 16:05 | frontend | ready for QA/integration | chip header, mahkota, hasil, StatsCard, profil selesai; tsc/vitest lulus; integrasi backend belum diuji |
| 2026-11-03 17:00 | backend | development started | - |
| 2026-11-03 17:25 | backend | ready for QA/integration | poin/mahkota/speed streak/streak harian + ledger append-only + F-08-06/F-14-06; tsc/eslint bersih, vitest 1063, test:integration 576 lulus; E2E belum diverifikasi |
| 2026-11-03 20:00 | backend | QA W8 fix | F-16-01 (batas manusia 2000 ms), F-16-04, F-16-05 selesai; tsc/eslint bersih, vitest 1086, test:integration 593 lulus |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test passed | E2E lulus |
