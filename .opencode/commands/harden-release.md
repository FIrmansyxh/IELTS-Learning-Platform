---
description: Jalankan Fase 4 (Hardening) — security + reliability sebelum produksi. Per-release.
---

Jalankan **Fase 4 — Hardening** (per-release) untuk versi: **$ARGUMENTS**

Langkah:
1. **Security (Mode A)** → Threat Modeling
2. **Security (Mode B)** → Vulnerability Scan + verifikasi `security-standards.md`
3. **Reliability** → performance, resilience, load test
4. **CHECKPOINT:** Human review temuan Security + Reliability
5. **Security (Mode C)** + **Fixer** → remediasi CRITICAL & HIGH
6. **Tester** → regression test
7. **GATE — Siap produksi:** Human sign-off.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan Task tool (Claude Code) / agent invocation (OpenCode).
- **BERHENTI di setiap GATE / CHECKPOINT** dan minta persetujuan human secara eksplisit sebelum lanjut.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).
