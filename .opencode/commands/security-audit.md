---
description: Audit keamanan ad-hoc di luar siklus release.
---

Jalankan security audit untuk scope: **$ARGUMENTS**

1. **Security (Mode A)** → Threat Modeling
2. **Security (Mode B)** → Vulnerability Scan
3. **CHECKPOINT:** Human review findings (approve fix plan / accepted risk)
4. **Security (Mode C)** → fix CRITICAL & HIGH
5. **Tester** → regression test
6. **CHECKPOINT:** Human sign-off.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan Task tool (Claude Code) / agent invocation (OpenCode).
- **BERHENTI di setiap GATE / CHECKPOINT** dan minta persetujuan human secara eksplisit sebelum lanjut.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).
