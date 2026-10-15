## 🤖 AI Agent Personas & Capabilities

Setiap Agent memiliki **system instruction** dan dapat dipanggil via slash command.

**Total: 20 Specialized Agents**

---

## 🔄 Workflow 4 Fase (v2.0)

Pengerjaan proyek dibagi ke **4 fase** dengan gerbang human di tiap transisi. Detail: `agent/workflows/_shared/phases.md`.

| Fase | Agen | Output (acuan) | Gate |
|------|------|----------------|------|
| **1 · Perencanaan** | **Discovery** (wawancara human), Initiator, **Toolsmith**, SysArch, Data Architect, UX Designer, Security (Mode S), Analyst | requirements, overview, **workspace-manifest**, architecture, data-model, design-system, security-standards, **API Contract** | requirements sign-off → Blueprint disetujui |
| **2 · Pengerjaan** | Analyst (spec-lock), Backend Engineer ∥ Frontend Engineer (atau Developer @ `fast`), QA | kode + unit test + review | Code review lulus |
| **3 · Testing** | Tester, **Manual Tester** (opsional), Fixer | E2E hijau | Fungsional hijau |
| **4 · Hardening** (per-release) | Security (A/B/C/D), Reliability, Fixer | security & reliability report | Siap produksi |

**Lintas fase:** PM (koordinasi), Orchestrator (gerbang fase), **Toolsmith (provisioning workspace agentik)**, DevOps (CI/CD), Document (dokumentasi).

**Komunikasi rigid — "No Silent Changes":** setiap perubahan dari user WAJIB ditulis ke dokumen acuan + dicatat (ADR jika perlu) + agen hilir di-notify. Detail: `agent/workflows/_shared/change-management.md`.

**Pemisahan spesialis:** Backend Engineer (API/logic/DB) dan Frontend Engineer (UI/UX/integrasi) bekerja paralel, disatukan oleh **API Contract**. Pada `depth=fast` keduanya digabung jadi satu Developer fullstack.

### 0. **Discovery Agent** (`/discovery`) — Fase Perencanaan (paling hulu)
**Role:** Product Discovery Lead & Business Analyst

- ✅ **Mewawancarai human** secara interaktif (tanya-jawab bertahap) untuk menggali kebutuhan
- ✅ Menggali: masalah & metrik sukses, persona, scope (must/nice/out), non-functional, constraint, data & integrasi, risiko & asumsi
- ✅ Reflect-back untuk validasi; berhenti saat cukup; sign-off human
- **Output:** `state/knowledge_base/requirements/requirements.md` · **Acuan untuk:** Initiator
- ⚠️ Berjalan di **thread utama** (interaktif), bukan subagent. Tidak membuat `project_overview.md`.

---

### 1. **Initiator Agent** (`/initiator`)
**Role:** Project Initiator & Product Manager

**Capabilities:**
- ✅ Mengubah ide kasar menjadi `project_overview.md` yang terstruktur
- ✅ Menentukan tech stack berdasarkan kebutuhan
- ✅ Mendefinisikan UI/UX guidelines (color palette, typography, component library)
- ✅ Membuat development roadmap & timeline

**Input Example:**
```
/initiator

"Aplikasi manajemen booking kapal wisata Labuan Bajo, 
pakai Next.js, harus ada payment gateway dan backoffice 
untuk admin."
```

**Output:**
- `project_overview.md` (complete dengan target audience, tech stack, roadmap)

**👤 Human Task:**
- Review `project_overview.md`
- Approve atau minta revisi (tech stack, UI guidelines, timeline)

---

### 1b. **Toolsmith Agent** (`/setup-workspace`) ⭐ NEW — Lintas Fase
**Role:** Agentic Workspace Provisioner

**Capabilities:**
- ✅ Menyiapkan **perkakas si AI agent** (skills + MCP) — bukan infra produk (itu DevOps)
- ✅ Memutuskan skill/MCP dari tech stack (hybrid: registry kurasi `schemas/workspace-registry.json` + augmentasi `find-skills`)
- ✅ Menulis **MCP config declarative** per tool: `.mcp.json` (Claude), `opencode.json` (OpenCode), `.vscode/mcp.json` (Copilot), `.agents/mcp.json` (Antigravity)
- ✅ Install skills ke `skillsDir` tiap platform via `npx skills add`
- ✅ **Re-callable saat pindah tool** — manifest persist, tinggal re-apply ke format tool baru (mode `switch`)

**Mode:** `init` (provisioning awal) · `switch` (pindah tool) · `sync` (perbaiki drift)

**Input Example:**
```
/setup-workspace init
/setup-workspace switch tool=opencode    # saat pindah dari Claude Code ke OpenCode
```

**Output:**
- `state/workspace-manifest.json` (desired-state: daftar skill + MCP, platform-agnostic)
- Config MCP per tool + skills terpasang

**👤 Human Task:**
- Review ringkasan skill/MCP sebelum apply
- Isi env var sensitif (mis. `POSTGRES_URL`) yang ditulis sebagai placeholder `${VAR}`

⚠️ Otomatis dipanggil Orchestrator di Fase 1 (setelah tech stack) & Fase 2 (sebelum coding), tapi bisa dipanggil manual kapan saja.

---

### 2. **PM Agent** (`/pm`) ⭐ NEW
**Role:** Project Manager & Task Coordinator

**Capabilities:**
- ✅ Membuat dan mengelola task list di `task/task_list.md`
- ✅ Memecah specifications menjadi actionable tasks dengan priority (P0-P3)
- ✅ Tracking status setiap task (not_started → dev → testing → passed)
- ✅ Mengelola dependencies antar task
- ✅ Generate project status reports
- ✅ Monitoring progress dari development logs
- ✅ Mengidentifikasi blockers dan bottlenecks

**When to Use:**
- Setelah Analyst membuat specifications (untuk create task list)
- Saat ingin cek project progress
- Saat perlu update task status setelah development/testing
- Saat planning sprint atau prioritization

**Input Example:**
```
/pm

"Buat task list berdasarkan semua specifications yang sudah ada"
```

**Output:**
- `task/task_list.md` dengan struktur:
  - Priority sections (P0: Critical → P3: Low)
  - Task format: TASK-XXX dengan spec reference, status, dependencies
  - Summary: Total tasks, completed, in progress, blocked
- `task/PROJECT_STATUS_REPORT.md` (jika diminta generate report)

**Task Status Flow:**
```
not_started → dev (Developer working) → ready_to_test (Dev complete)
           → testing_ready (Test scenarios created) → testing (Tester running)
           → passed/failed → human_validated
```

**Priority Levels:**
- **P0 (Critical):** Blockers, production bugs, foundational features
- **P1 (High):** Core features, important bugs
- - **P2 (Medium):** Enhancement, minor features
- **P3 (Low):** Nice-to-have, future improvements

**👤 Human Task:**
- Review task priorities (sesuai bisnis priority?)
- Validate task breakdown (granularity OK?)
- Approve task assignments
- Manual validation setelah task passed (human_validated status)

**Workflow Integration:**
```
[Analyst] Create specs → [PM] Generate task list
  ↓
[Developer] Pick task → Update status: dev → ready_to_test
  ↓
[Tester] Create tests → Update status: testing_ready → testing → passed
  ↓
[PM] Monitor progress → Generate status reports
```

---

### 3. **Analyst Agent** (`/analyst`)
**Role:** Lead System Analyst & DevOps Architect

**Capabilities:**
- ✅ Membaca `project_overview.md` untuk context
- ✅ Membuat spesifikasi infrastruktur (Docker, database schema)
- ✅ Membuat spesifikasi fitur (user stories, API contracts, UI mockups)
- ✅ Memecah fitur besar menjadi atomic specifications (1 file = 1 user story)
- ✅ Validasi tech stack sudah terisi sebelum lanjut

**Critical Rule:**
- **WAJIB** membuat `000_spec_environment_setup.md` terlebih dahulu sebelum spec fitur

**Input Example:**
```
/analyst

"Buat spesifikasi untuk fitur Booking Management"
```

**Output:**
- `specifications/004_spec_booking_management.md`
- Atau breakdown menjadi multiple atomic specs jika fitur terlalu besar

**👤 Human Task:**
- Review spesifikasi (apakah sesuai kebutuhan bisnis?)
- Check API contracts & database schema
- Approve sebelum Developer mulai coding

**Workflow Integration:**
```
[Analyst] Create specification
  ↓
[PM] Create task from spec → Add to task/task_list.md
  ↓
[Developer] Pick task and implement
```

---

### 4. **Developer Agent** (`/developer`)
**Role:** Senior Full-Stack Developer

**Capabilities:**
- ✅ Membaca spesifikasi dari Analyst
- ✅ Menulis kode (frontend, backend, database migration)
- ✅ Mengikuti coding standards & best practices
- ✅ Membuat development log otomatis (`logs/development/dev_*.md`)
- ✅ Menjalankan build & check errors
- ✅ Fixing bugs berdasarkan error feedback
- ✅ **Update task status** di `task/task_list.md` (not_started → dev → ready_to_test)

**Input Example:**
```
/developer

"Implementasikan SPEC-004 (Pricing Configuration Module)"
```

**Output:**
- Kode di `codes/` (API routes, components, database schema)
- `logs/development/dev_004_pricing_module.md` (log perubahan)

**👤 Human Task:**
- Code review (check logic, security, performance)
- Manual testing di browser/Postman
- Approve atau minta fixing

**Task Management Workflow:**
```
[Developer] Read task/task_list.md → Find task with status "not_started"
  ↓
[Developer] Update status: not_started → dev (set "Assigned To: Developer Agent")
  ↓
[Developer] Implement feature → Create development log
  ↓
[Developer] Update status: dev → ready_to_test (with timestamp)
```

---

### 5. **Tester Agent** (`/tester`)
**Role:** QA Engineer & Test Automation Specialist

**Capabilities:**
- ✅ Membuat unit tests, integration tests, E2E tests
- ✅ Menjalankan tests di terminal
- ✅ Menganalisis test failures & memberikan fixing recommendation
- ✅ Membuat testing log (`logs/testing/test_*.md`)
- ✅ Self-healing: Memperbaiki tests yang broken karena code changes
- ✅ **Update task status** di `task/task_list.md` (ready_to_test → testing_ready → testing → passed/failed)

**Input Example:**
```
/tester

"Buat dan jalankan test untuk Pricing Configuration API"
```

**Output:**
- Test files di `tests/`
- Terminal execution results
- `logs/testing/test_004_pricing.md`

**👤 Human Task:**
- Verify test coverage (apakah sudah lengkap?)
- Check test results (all green?)
- Manual exploratory testing untuk edge cases

**Task Management Workflow:**
```
[Tester] Read task/task_list.md → Find task with status "ready_to_test"
  ↓
[Tester] Create test scenarios → Update status: ready_to_test → testing_ready
  ↓
[Tester] Run tests → Update status: testing_ready → testing
  ↓
[Tester] Check results → Update status: testing → passed (or failed)
```

---

### 5b. **Manual Tester Agent** (`/manual-test`) ⭐ NEW
**Role:** Manual/UAT Tester (Headful Playwright)

**Capabilities:**
- ✅ Menyusun **scenario matrix** per fitur/fungsi — minimal 1 Normal case + 1 Abnormal case masing-masing
- ✅ Eksekusi **headful** Playwright (browser terlihat) — tidak ada mode headless
- ✅ Screenshot bukti untuk setiap skenario (`tests/screenshots/[TASK-ID]/iteration-[N]/`)
- ✅ Update Pass/Fail per skenario, triase temuan gagal sebagai **Major** atau **Minor**
- ✅ Sheet **Summary** agregat (total skenario, pass, fail, major, minor, pass rate) + sheet **Detail** (langkah, ekspektasi, aktual, screenshot, catatan) — keduanya markdown table dalam satu laporan
- ✅ **Retest iterasi** — histori tiap iterasi tetap tersimpan (append, bukan overwrite), nomor iterasi tercatat di laporan
- ✅ **Append-only** ke `Status Logs:` — tidak pernah mengubah `Current Status` milik pipeline Tester/Fixer, sehingga bisa dipanggil kapan saja tanpa bentrok status

**Berbeda dari Tester Agent:** Tester = scripted E2E (assertion-based, cocok CI). Manual Tester = bergaya human UAT (bukti visual + defect log untuk stakeholder/klien). Keduanya independen, bisa dipakai berdampingan.

**Input Example:**
```
/manual-test

"Buat dan jalankan manual UAT test untuk fitur Booking Management"
```

**Output:**
- `tests/screenshots/[TASK-ID]/iteration-[N]/*.png`
- `task/[TASK-ID]_[nama-task]/manual_test_report.md` (Summary + Scenario Detail, bertambah tiap iterasi retest)

**👤 Human Task:**
- Review temuan Major → putuskan apakah lanjut ke Fixer
- Review temuan Minor → terima sebagai known-issue atau minta perbaikan juga
- Approve saat semua skenario Pass (atau Minor yang tersisa sudah didokumentasikan)

**Retest Workflow:**
```
[Manual Tester] Iteration 1 → 3 Fail (1 Major, 2 Minor) → notify Fixer
  ↓
[Fixer] Fix bug → Ready to test
  ↓
[Manual Tester] Iteration 2 (retest skenario yang Fail) → semua Pass
  ↓
👤 Human approve UAT
```

---

### 6. **Fixer Agent** (`/fixer`)
**Role:** Bug Hunter & Debugging Specialist

**Capabilities:**
- ✅ Menganalisis error messages (compile errors, runtime errors, test failures)
- ✅ Membaca stack trace dan pinpoint root cause
- ✅ Memperbaiki bugs dengan minimal side effects
- ✅ Membuat fixing log (`logs/fixing/fixing_*.md`)
- ✅ Validasi fix dengan menjalankan tests
- ✅ Regression testing (pastikan fix tidak break fitur lain)
- ✅ **Update task status** di `task/task_list.md` (failed → fixing → ready_to_test)

**When to Use:**
- Setelah Developer bikin code tapi ada errors
- Setelah Tester report bugs
- Production bugs yang perlu hotfix
- Build failures di CI/CD

**Input Example:**
```
/fixer

"Ada bug di create booking: DP amount tidak ter-kalkulasi.
Error: Cannot read property 'totalPrice' of undefined
File: app/api/backoffice/bookings/route.ts:45

Error terjadi saat user submit booking form dengan pax > 10"
```

**Output:**
- Fixed code di `codes/`
- `logs/fixing/fixing_003_booking_dp_calculation.md` (detailed analysis + solution)
- Test execution result (verify fix works)

**👤 Human Task:**
- Verify fix logic (apakah benar-benar solve root cause?)
- Check for side effects (fitur lain masih jalan?)
- Manual testing dengan scenario yang sama
- Approve atau minta alternative solution

**Workflow Integration:**
```
Developer creates code → Error found
  ↓
Fixer analyzes → Fix bug → Run tests
  ↓
All green? → Done ✅
Not green? → Iterate fix
```

**Task Management Workflow:**
```
[Tester] Find bugs → Update task status: passed → failed
  ↓
[Fixer] Read task/task_list.md → Find task with status "failed"
  ↓
[Fixer] Update status: failed → fixing (set "Assigned To: Fixer Agent")
  ↓
[Fixer] Fix bugs → Update spesifikasi terkait fitur yang difixing (jika ada penyesuaian scope) → Create fixing log
  ↓
[Fixer] Update status: fixing → ready_to_test (back to Tester)
```

---

### 7. **SysArch Agent** (`/sysarch`)
**Role:** System Architecture & Operations Specialist

**Capabilities:**
- ✅ Menganalisis application requirements dari codebase dan specifications
- ✅ Mendesain server specifications (CPU, RAM, Storage, Bandwidth)
- ✅ Merencanakan infrastructure architecture (dev, staging, production)
- ✅ Mengestimasi resource requirements & costs
- ✅ Merekomendasikan deployment strategies (VPS, cloud, containerized)
- ✅ Membuat operational guidelines (monitoring, backup, scaling, disaster recovery)
- ✅ Mengoptimasi biaya infrastruktur

**When to Use:**
- Sebelum deployment ke production (infrastructure planning)
- Saat aplikasi mulai lambat (performance analysis & scaling recommendation)
- Saat budget review (cost optimization analysis)
- Saat planning capacity untuk high season

**Input Example:**
```
/sysarch

"Analyze current codebase and design server specifications 
for production deployment. Target: 100 concurrent users, 
50 bookings/day, 99.9% uptime."
```

**Output:**
- `architecture/current_state.md` - Application analysis
- `architecture/server_specifications.md` - Detailed server specs
- `architecture/deployment_plan.md` - Step-by-step deployment guide
- `architecture/cost_analysis.md` - Infrastructure cost breakdown
- `architecture/monitoring_plan.md` - Observability & alerting setup

**👤 Human Task:**
- Jawab questions tentang load requirements (concurrent users, transactions, etc.)
- Review server specifications (sesuai budget?)
- Approve deployment plan
- Check cost estimates (sustainable?)
- Decide cloud provider preference

**Critical Questions SysArch Will Ask:**
1. **User Load:** Concurrent users, growth rate, peak season multiplier
2. **Transaction Volume:** Bookings/day, payments/day, API requests/min
3. **Data & Storage:** File uploads, data retention, backup requirements
4. **Performance:** API response time, page load time, CDN needs
5. **Availability:** Uptime target (99%, 99.9%, 99.99%), HA requirements
6. **Budget:** Monthly infrastructure budget, cloud provider preference
7. **Security:** SSL, WAF, DDoS protection, compliance (PCI-DSS, GDPR, UU PDP)

**Example Workflow:**
```
[SysArch] Ask requirements → [👤 Human] Answer questions
  ↓
[SysArch] Analyze codebase → Design architecture
  ↓
[SysArch] Create specs & deployment plan → [👤 Human] Review & Approve
  ↓
[Developer/SysArch] Deploy to production
  ↓
[SysArch] Setup monitoring → [👤 Human] Monitor metrics
```

---

### 8. **Security Expert Agent** (`/security`)
**Role:** Application Security Expert

**Capabilities:**
- ✅ Threat modeling menggunakan metodologi STRIDE
- ✅ OWASP Top 10 vulnerability scanning
- ✅ Secrets dan hardcoded credential detection
- ✅ Dependency vulnerability scan (`npm audit`, dll)
- ✅ Implementasi security fix (input validation, parameterized queries, header hardening)
- ✅ Pre-release security audit

**4 Mode Kerja:**
- **Mode A — Threat Model:** Identifikasi attack surface dan threat berdasarkan arsitektur
- **Mode B — Vulnerability Scan:** OWASP Top 10 check + dependency scan + secrets check
- **Mode C — Security Fix:** Implementasi patch untuk temuan CRITICAL dan HIGH
- **Mode D — Pre-release Audit:** Quick scan perubahan sejak release terakhir

**When to Use:**
- Pipeline `/security-audit` untuk full audit manual
- Otomatis di `/start-feature` saat `depth=deep`
- Otomatis di `/release` (Mode D, selalu)

**Input Example:**
```
/security

"Mode B: Lakukan vulnerability scan pada fitur authentication dan payment"
```

**Output:**
- `task/[TASK-ID]/security_threat_model.md` (Mode A)
- `task/[TASK-ID]/security_report.md` (Mode B/C/D)

**👤 Human Task:**
- Review temuan dan tentukan mana yang perlu di-fix vs accepted risk
- Approve sebelum Security Fix diimplementasi (untuk CRITICAL)
- Final sign-off setelah semua fix diverifikasi

---

### 9. **Data Architect Agent** (`/data-architect`) — Fase Perencanaan
**Role:** Data Architect

- ✅ Merancang data model, ERD, skema per-entity, indexing
- ✅ Data governance: PII, retention, encryption at rest, audit
- ✅ Migration strategy sesuai tooling stack
- **Output:** `state/knowledge_base/data-model/` · **Acuan untuk:** Backend Engineer

---

### 10. **UX Designer Agent** (`/ux-designer`) — Fase Perencanaan
**Role:** UX/UI Designer

- ✅ Design system: color palette, tipografi, spacing, spec komponen, motion
- ✅ Memakai skill `ui-ux-pro-max`
- ✅ Accessibility & responsive guidelines
- **Output:** `state/knowledge_base/design-system/` · **Acuan untuk:** Frontend Engineer

---

### 11. **Backend Engineer Agent** (`/backend`) — Fase Pengerjaan
**Role:** Senior Backend Engineer (`depth=standard|deep`)

- ✅ Implementasi API, business logic, akses DB **sesuai API Contract**
- ✅ Honor `data-model/` dan `security-standards.md`
- ✅ Unit test + propagasi perubahan contract ke Frontend
- **Output:** `codes/*` (server) · **Paralel dengan:** Frontend Engineer

---

### 12. **Frontend Engineer Agent** (`/frontend`) — Fase Pengerjaan
**Role:** Senior Frontend Engineer & UI Specialist (`depth=standard|deep`)

- ✅ Implementasi UI **sesuai design-system** + integrasi **API Contract**
- ✅ Memakai skill `ui-ux-pro-max`; handle semua state (loading/empty/error)
- ✅ Component test + a11y
- **Output:** `codes/*` (client) · **Paralel dengan:** Backend Engineer

---

### 13. **Reliability Engineer Agent** (`/reliability`) — Fase Hardening
**Role:** Reliability & Performance Engineer (per-release)

- ✅ Performance review (N+1, indexing, caching, payload)
- ✅ Resilience: error handling, timeout/retry, graceful degradation
- ✅ Load test + observability audit
- **Output:** `task/[RELEASE]/reliability_report.md`

---

### 14. **Document Agent** (`/document`)
**Role:** Technical Writer

**Capabilities:**
- ✅ Menggabungkan semua specifications menjadi FSD (Functional Specification Document)
- ✅ Generate API documentation
- ✅ Membuat user manual / deployment guide
- ✅ Format markdown yang professional & readable

**Input Example:**
```
/document

"Generate FSD lengkap dari semua specifications"
```

**Output:**
- `documentation/FSD_VasVibe.md`
- `documentation/API_Documentation.md`

**👤 Human Task:**
- Final review dokumentasi
- Share ke stakeholder (investor, klien)

---

## 🤖 Peran & Perintah (Slash Commands)

| Agent | Command | Primary Function | Output | Human Review |
| --- | --- | --- | --- | --- |
| Agen | Command | Fase | Primary Function | Output |
| --- | --- | --- | --- | --- |
| **Discovery** | `/discovery` | Perencanaan | Requirement gathering (wawancara human) | `state/knowledge_base/requirements/` |
| **Initiator** | `/initiator` | Perencanaan | Project overview (sintesis requirements) | `project_overview.md` |
| **SysArch** | `/sysarch` | Perencanaan | Infrastructure & deployment planning | `state/knowledge_base/architecture/` |
| **Data Architect** | `/data-architect` | Perencanaan | Data model & governance | `state/knowledge_base/data-model/` |
| **UX Designer** | `/ux-designer` | Perencanaan | Design system & UI guidelines | `state/knowledge_base/design-system/` |
| **Security** | `/security` | Perencanaan + Hardening | Standards, threat model, OWASP, fix | `state/knowledge_base/security/`, `task/[ID]/security_report.md` |
| **Analyst** | `/analyst` | Perencanaan | User story, **API Contract**, spec-lock | `specifications/*.md` |
| **PM** | `/pm` | Lintas fase | Task management & coordination | `task/task_list.md` |
| **Backend Engineer** | `/backend` | Pengerjaan | Server API, logic, DB (std/deep) | `codes/*` |
| **Frontend Engineer** | `/frontend` | Pengerjaan | UI/UX & API integration (std/deep) | `codes/*` |
| **Developer** | `/developer` | Pengerjaan | Fullstack tunggal (`depth=fast`) | `codes/*` |
| **QA** | `/qa` | Pengerjaan | Static review & unit test | `task/[ID]/qa_report.md` |
| **Tester** | `/tester` | Testing | E2E test automation | `tests/*` |
| **Manual Tester** | `/manual-test` | Testing (opsional) | Headful UAT: scenario matrix, screenshot, defect triage | `task/[ID]/manual_test_report.md` |
| **Fixer** | `/fixer` | Testing + Hardening | Bug fixing & debugging | `codes/*` |
| **Reliability** | `/reliability` | Hardening | Performance, resilience, load | `task/[RELEASE]/reliability_report.md` |
| **DevOps** | `/devops` | Lintas fase | Docker, CI/CD, deployment | `Dockerfile`, `.github/workflows/` |
| **Document** | `/document` | Lintas fase | Final documentation | `documentation/*.md` |
| **Orchestrator** | `/plan-project`, `/build-feature`, dll | Lintas fase | Pipeline & phase gates | `state/pipeline_log.md` |

---
