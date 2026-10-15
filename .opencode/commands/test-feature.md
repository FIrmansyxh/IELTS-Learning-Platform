---
description: Jalankan Fase 3 (Testing) — E2E test fungsional terhadap spesifikasi.
---

Jalankan **Fase 3 — Testing** untuk fitur: **$ARGUMENTS**

Langkah:
1. **Tester** → buat & jalankan E2E test berdasarkan spec
2. Jika FAIL → **Fixer** → loop balik ke langkah 1
3. **GATE — Fungsional hijau:** semua test pass.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan Task tool (Claude Code) / agent invocation (OpenCode).
- **BERHENTI di setiap GATE / CHECKPOINT** dan minta persetujuan human secara eksplisit sebelum lanjut.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).
