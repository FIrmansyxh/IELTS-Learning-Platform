---
description: Jalankan Fase 1 (Perencanaan) — hasilkan semua blueprint/acuan dengan human gate.
---

Jalankan **Fase 1 — Perencanaan** untuk: **$ARGUMENTS**

Langkah:
0. **Discovery (INTERAKTIF — JANGAN delegasikan ke subagent)** → kamu sendiri di thread utama wawancara human (tanya-jawab bertahap), hasilkan `state/knowledge_base/requirements/requirements.md`. Ikuti metodologi di `agent/workflows/discovery.md`.
1. **GATE:** Human sign-off `requirements.md`
2. **Initiator** (delegasi) → `project_overview.md` (sintesis dari requirements, termasuk `WORK_DEPTH`)
3. **CHECKPOINT:** Human review tech stack, UI vibe, work depth
4. **SysArch** → `state/knowledge_base/architecture/` (jika ada infra requirement)
5. **Data Architect** → `state/knowledge_base/data-model/`
6. **UX Designer** → `state/knowledge_base/design-system/`
7. **Security (Mode S)** → `state/knowledge_base/security/security-standards.md`
8. **Analyst** → `specifications/000_spec_environment_setup.md` + backlog user story (termasuk **API Contract**)
9. **DevOps** → environment setup (jika dibutuhkan)
10. **GATE — Blueprint disetujui:** API Contract wajib final.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan Task tool (Claude Code) / agent invocation (OpenCode).
- **BERHENTI di setiap GATE / CHECKPOINT** dan minta persetujuan human secara eksplisit sebelum lanjut.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).
