---
description: Ringkasan progres harian per fase + blockers + next actions.
---

Buat ringkasan standup:
1. Baca `task/task_list.md` + log terbaru di `task/`
2. Generate progress summary **per fase** (Perencanaan/Pengerjaan/Testing/Hardening)
3. Identifikasi blockers
4. Rekomendasikan next actions.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan Task tool (Claude Code) / agent invocation (OpenCode).
- **BERHENTI di setiap GATE / CHECKPOINT** dan minta persetujuan human secara eksplisit sebelum lanjut.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).
