# Phases (Shared)

Project VasVibe dikerjakan dalam **4 fase** dengan gerbang (gate) human di tiap transisi. Setiap agen WAJIB tahu fase mana yang sedang berjalan dan tidak boleh melompati gerbang tanpa approval.

---

## Fase 1 — Perencanaan (Planning)

**Tujuan:** Menghasilkan **blueprint** (dokumen acuan) yang dipakai semua fase berikutnya.

| Agen | Output (acuan) |
|------|----------------|
| **Discovery** (paling hulu, INTERAKTIF) | `state/knowledge_base/requirements/requirements.md` |
| Initiator | `project_overview.md` (sintesis dari requirements) |
| **Toolsmith** (setelah tech stack diketahui) | `state/workspace-manifest.json` + config MCP per tool |
| SysArch | `state/knowledge_base/architecture/` |
| Data Architect | `state/knowledge_base/data-model/` |
| UX Designer | `state/knowledge_base/design-system/` |
| Security (Mode Standards) | `state/knowledge_base/security/security-standards.md` |
| Analyst | `specifications/` (user story + **API Contract**) |

**Discovery dulu:** Sebelum dokumen apapun, Discovery mewawancarai human (tanya-jawab) untuk menggali kebutuhan. Karena interaktif, **Discovery berjalan di thread utama**, bukan sebagai subagent. Outputnya (`requirements.md`) di-sign-off human, lalu jadi input Initiator.

**Gate:** Human menyetujui blueprint. **API Contract wajib final** — ini seam antara Backend & Frontend.

---

## Fase 2 — Pengerjaan (Implementation)

**Tujuan:** Mengubah blueprint menjadi kode yang sudah di-review.

| Agen | Peran |
|------|-------|
| Analyst (spec-lock) | Refine AC detail just-in-time sebelum coding |
| Backend Engineer | API, business logic, akses DB — honor API Contract |
| Frontend Engineer | UI/UX, frontend — honor API Contract, ikuti design-system |
| Fullstack (fast only) | Fullstack tunggal — **hanya saat `depth=fast`** sebagai pengganti FE+BE |
| QA | Static review + unit test sebelum lanjut |

**Boundary:** API Contract menyatukan BE & FE — keduanya kerja paralel terhadap kontrak yang sama.
**Gate:** Code review lulus.

---

## Fase 3 — Testing

**Tujuan:** Verifikasi fungsional terhadap spesifikasi.

| Agen | Peran |
|------|-------|
| Tester | E2E test berdasarkan `specifications/` |
| Fixer | Perbaiki bug temuan (loop dengan Tester sampai hijau) |

**Gate:** Semua test fungsional hijau.

---

## Fase 4 — Hardening

**Tujuan:** Memastikan ketangguhan & keamanan sebelum produksi. **Dijalankan per-release**, bukan per-fitur.

| Agen | Peran |
|------|-------|
| Security | Pen-test, OWASP audit, security fix (Mode B/C/D) |
| Reliability Engineer | Performance, resilience, error handling, load test |
| Fixer | Remediasi temuan |

**Gate:** Sign-off siap produksi.

---

## Cross-Phase (Lintas Fase)

| Agen | Peran |
|------|-------|
| PM | Koordinasi task & status di semua fase |
| Orchestrator | Menjalankan pipeline & menjaga gerbang fase |
| **Toolsmith** | Provisioning workspace agentik (skill + MCP); re-apply saat pindah tool AI |
| DevOps | CI/CD, containerization (Implementation & Hardening) |
| Document | Dokumentasi (akhir siklus) |

---

## Aturan Fase

- **Tidak boleh lompat gerbang** tanpa human approval.
- Setiap output fase adalah **acuan** untuk fase berikutnya — perubahan harus mengikuti `_shared/change-management.md`.
- Fase boleh iteratif: jika Testing menemukan cacat desain, kembali ke Perencanaan via change-management, bukan tambal diam-diam.
