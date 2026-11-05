# QA Report: TASK-012 Penilaian AI Writing dan Mini-Task Writing

## Test Results Summary
- **Target Specification:** `specifications/012_spec_ai_writing.md`
- **Result:** PASS (100%)
- **Test Suites Executed:**
  - `codes/tests/unit/ai-writing.test.ts` (22/22 passed)
  - `codes/tests/unit/ai-writing-routes.test.ts` (7/7 passed)
  - `codes/tests/unit/writing-editor.test.tsx` (6/6 passed)
  - Full project test suite: 42 test files, 605 tests passed.

## Acceptance Criteria Checklist
- [x] `POST /submissions/writing` 202 (mock LLM) lalu GRADED dengan `evaluation` terstruktur
- [x] `overall_band` selalu dihitung ulang di kode; kap panjang (<50% -> 3.5, <80% -> 5.0, <100% -> 6.0), bahasa non-Inggris (<= 4.0), band >= 8.0 -> 7.5
- [x] Injeksi prompt ditandai (`injection_suspected`, audit `AI_INJECTION_SUSPECTED`)
- [x] `AI_ENABLED=false` ditangani dengan status `FALLBACK_SELF_ASSESSMENT`
- [x] Self-assessment flow tersedia saat status `FAILED` atau `FALLBACK_SELF_ASSESSMENT`
- [x] Disclaimer `"Perkiraan latihan, bukan skor resmi IELTS."` tampil di seluruh evaluasi dan UI
- [x] Skor AI/self-assessment tidak meloloskan gerbang modul/tier (sesuai ADR-003)
- [x] Typecheck `tsc --noEmit` bersih tanpa galat
- [x] Lint `eslint . --max-warnings=0` bersih tanpa warning
