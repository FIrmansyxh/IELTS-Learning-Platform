# TASK-016 Gamifikasi: Mahkota, Poin, Speed Streak, Streak Harian
**Spec:** `specifications/016_spec_gamification.md`
**Priority:** P1
**Wave:** W8
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-003, TASK-005, TASK-006, TASK-014
**Current Status:** ready_to_test

---

## Description
Mahkota Silver/Gold (>= 75 / >= 90), poin ledger anti-farming (hanya naik bila lebih baik), speed streak, streak harian Asia/Jakarta.

## Acceptance Criteria
- [x] Poin DRILL/SPEED_STREAK/CROWN dihitung sesuai contoh; attempt ulang hanya menambah selisih
- [x] Mahkota: 74.99 tidak lulus; 89.99 SILVER; 90.00 GOLD; GOLD tidak turun
- [x] Submit ganda/serentak tidak menggandakan ledger (indeks unik point_ledger_once_uq)
- [x] Seluruh AC SPEC-016 terpenuhi

## Notes
- Wave build: W8; ukuran estimasi: M (backlog)
- Kontrak API: `codes/src/contracts/gamification.ts`
- Implementasi: `codes/src/server/gamification/service.ts`, hook pada `codes/src/server/hooks-register.ts`
- Komponen UI: CrownBadge, StatsCard, PointsHistorySheet, HeaderChips, DrillResult gamification breakdown
- Tests: `tests/unit/gamification.test.ts`, `tests/unit/gamification-routes.test.ts`, `tests/unit/gamification-ui.test.tsx` (19 tests, 100% green)

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-04 12:43 | developer agent | ready_to_test | Implementasi & verifikasi selesai (19 tests passed, tsc & eslint 0 error) |
