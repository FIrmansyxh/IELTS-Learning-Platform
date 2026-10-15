# 🌊 Vibe Coding Workflow

> _This README ships from the [`create-vasvibe`](https://www.npmjs.com/package/create-vasvibe) starter. Examples reference a boat tour booking project (Labuan Bajo) for illustration. Replace examples with your own context as needed._

Selamat datang di ekosistem **Vibe Coding**.
Ini adalah standar alur kerja pengembangan software berbasis **AI Agent** yang mengutamakan struktur, dokumentasi otomatis, dan validasi berjenjang. 
Template ini telah berevolusi dan secara *native* mendukung integrasi untuk berbagai AI agent environment mutakhir:
- **Google Antigravity** (`.agents/`)
- **OpenAI Codex** (`AGENTS.md`, `.codex/agents/`, `.agents/skills/`)
- **Claude Code** (`.claude/`)
- **OpenCode** (`.opencode/`)
- **GitHub Copilot Workspace** (`.github/prompts/`)
- Serta dilengkapi **Shared Agent Workflows** (`agent/workflows/`) sebagai *source of truth* agar perilaku agen konsisten di seluruh platform.

---

## ⚡ Quick start (untuk tim baru)

Gunakan *command* CLI resmi untuk melakukan scaffolding project baru. Proses ini akan meng-copy seluruh konfigurasi agent, prompt, skills, serta kerangka direktori standar tim ke project baru Anda:

```bash
# Interaktif (akan ada pertanyaan)
npx create-vasvibe my-new-project

# Masuk ke direktori kerja
cd my-new-project
```

**Struktur yang Ter-scaffold Otomatis:**
- `codes/`, `specifications/`, `tests/` — folder kerja utama (telah dilindungi oleh aturan `.gitignore` agar tidak berantakan).
- Kerangka prompt dari seluruh environment (`.agents`, `.claude`, `.opencode`, `.github`, `agent/workflows`).
- File standard: `project_overview_example.md`, `GIT_STRUCTURE_GUIDE.md`, `skills-lock.json`.

**Opsi / Flag Tambahan:**
| Flag | Deskripsi |
|------|-----------|
| `-y, --yes` | Skip semua pertanyaan (gunakan setting default) |
| `--no-git` | Jangan jalankan `git init` secara otomatis |
| `--no-opencode` | Abaikan folder `.opencode/` |
| `--no-claude` | Abaikan folder `.claude/` dan wrapper agen Antigravity |
| `--no-codex` | Abaikan custom agent dan skill Codex VasVibe |
| `--no-github` | Abaikan folder `.github/prompts/` |
| `--no-workflows` | Abaikan folder `agent/workflows/` jika Codex tidak dipilih |
| `--depth=<level>` | Atur work depth: `fast`, `standard`, atau `deep` |
| `--dry-run` | Pratinjau upgrade tanpa menulis file |


## 🤖 Tentang AI Agent

**AI Agent** adalah sistem cerdas berbasis Large Language Model (LLM) yang dapat mengeksekusi tugas-tugas kompleks secara mandiri dengan menggunakan **tools** (function calling). Berbeda dengan chatbot biasa yang hanya menjawab pertanyaan, AI Agent dapat:

- 🔍 **Membaca & menganalisis** file di workspace
- ✍️ **Menulis & mengedit** kode berdasarkan spesifikasi
- 🔧 **Menjalankan command** di terminal (build, test, deploy)
- 🧠 **Mengambil keputusan** berdasarkan context dan error feedback
- 📝 **Membuat dokumentasi** otomatis dari perubahan yang dilakukan

Dalam workflow ini, kita menggunakan **20 AI Agent persona** yang bekerja secara terspesialisasi (mirip tim development sesungguhnya) di dalam **4-fase model**: Perencanaan → Pengerjaan → Testing → Hardening.

---

## 🚀 Filosofi (v2.2)

1. **4-Phase Model (Fase Gated):** Perencanaan → Pengerjaan → Testing → Hardening. Tiap fase ada **gate** (checkpoint manusia) sebelum lanjut fase berikutnya. Tidak ada yang jalan diam-diam.
2. **No Silent Changes:** Setiap perubahan yang diminta harus **ditulis ke dokumen acuan** (spec, requirement, ADR) dan di-propagate ke agen terkait. Result: rework minimal, audit trail jelas.
3. **Context is King:** AI tidak bisa bekerja tanpa konteks. `project_overview.md` + specifications/ adalah otak proyek.
4. **Work Depth Flexibility:** 3 level kedalaman (`fast`/`standard`/`deep`). Mulai fast untuk validate ide, naik standard saat serius, deep hanya untuk area sensitif.
5. **Tool-Agnostic Workflow:** Agent berjalan di Codex, Claude Code, OpenCode, GitHub Copilot, dan Antigravity. Source of truth di `agent/workflows/`, propagate ke tool-specific folders.
6. **Desired-State Architecture (Toolsmith):** `state/workspace-manifest.json` adalah manifest platform-agnostic. Toolsmith: install skills + MCP sesuai tech stack, re-applicable saat ganti tool.
7. **Role Segregation:** 19 agen specialized dengan tanggung jawab clear. Backend ≠ Frontend ≠ Security ≠ DevOps.
8. **Log Everything:** Setiap sesi coding, testing, fixing tercatat untuk kontinuitas AI memori.
9. **Human-in-the-Loop:** Manusia = Decision Maker (bisnis, arch, security, UX). AI = Executor (code, test, doc).
10. **Git Workflow Compliance:** Agen (Developer, QA, Security, Reliability) mengikuti `_shared/git-branch-management.md` ketat.

---

## 📂 Struktur Direktori Otomatis
Workflow ini akan secara otomatis mengelola struktur folder berikut:

```text
root/
├── .agents/                  # [BRAIN] Konfigurasi Google Antigravity & Skills
│   ├── agents/               # Definisi persona agent (analyst, developer, tester, dll)
│   └── skills/               # Folder berisi reusable tools/skills yang dapat diakses oleh agent
│
├── .claude/                  # [BRAIN] Konfigurasi & Prompt Claude Code
│   └── agents/
│
├── .opencode/                # [BRAIN] Konfigurasi & Commands OpenCode
│   └── commands/
│
├── .github/                  # [BRAIN] Konfigurasi GitHub Copilot Workspace
│   └── prompts/
│
├── agent/workflows/          # [CORE] Source of Truth untuk semua instruksi agent
│   ├── analyst.md
│   ├── developer.md
│   └── ... 
│
├── project_overview.md       # [MASTER] Definisi produk, tech stack, & UI/UX
│                             # 👤 HUMAN: Review & approve setelah Initiator Agent buat
│
├── state/                    # [CONFIG] Workspace manifest & knowledge base ⭐ v2.2
│   ├── workspace-manifest.json # Desired-state: skills[], mcp[], appliedTo platform
│   └── knowledge_base/       # Living docs: architecture, data-model, design-system, security, ADR/
│       ├── architecture.md
│       ├── data-model.md
│       ├── design-system.md
│       ├── security-standards.md
│       └── adr/              # Keputusan teknis (Architecture Decision Records)
│
├── specifications/           # [DOCS] Output dari Analyst Agent
│   ├── README.md            # Index semua spesifikasi
│   ├── 000_spec_environment_setup.md # Infrastruktur (Wajib pertama)
│   ├── 001_spec_database_schema.md
│   ├── requirements.md       # Hasil Discovery Agent (user story, constraint, scope)
│   └── api-contract.md       # API Contract (final sebelum Fase 2)
│
├── task/                     # [PROJECT MANAGEMENT] Output dari PM Agent
│   ├── task_list.md         # Central task tracking (priority, status, dependencies)
│   ├── PROJECT_STATUS_REPORT.md # Progress reports
│   ├── TASK-001/            # Folder khusus per task
│   │   ├── plan.md          # Rencana kerja & log eksekusi task terkait
│   │   └── ...
│   └── TASK-002/            # Setiap task baru akan diisolasi ke dalam sub-folder tersendiri
│
├── codes/                    # [SRC] Output dari Backend + Frontend atau Fullstack
│   ├── docker-compose.yml
│   ├── package.json
│   ├── app/                 # Aplikasi utama
│   └── ...                  # 👤 HUMAN: Code review & testing manual
│
├── tests/                    # [TEST] Output dari Tester Agent
│   ├── e2e/                 # Playwright E2E tests
│   └── integration/         # Integration tests
│
├── logs/                     # [TRACKING] Auto-generated logs per phase
│   ├── development/         # Backend + Frontend + Fullstack logs
│   ├── testing/             # Tester Agent logs
│   └── fixing/              # Bug fixing logs
│
└── documentation/            # [FINAL] Technical Writer output
    ├── FSD_VasVibe.md       # Functional Specification Document
    └── API_Documentation.md
```

**Legend:**
- 🤖 **Auto-generated:** File dibuat oleh AI Agent
- 👤 **Human review required:** File perlu di-review manusia sebelum lanjut
- 📝 **Living document:** File yang terus di-update

---

## 📊 Folder `state/` — Workspace State & Knowledge Base

Folder ini adalah **jantung kontinuitas project** — menyimpan manifest provisioning, context session, dan knowledge base project.

### **Struktur dan Fungsi**

```
state/
├── workspace-manifest.json       # 🤖 Desired-state (platform-agnostic)
├── context.json                  # 🤖 Session continuity (agent handoff)
├── agent_handoff.json            # 🤖 Current handoff (agent-to-agent)
└── knowledge_base/               # 📝 Living docs (architecture, design, decisions)
    ├── requirements/             # User stories, scope, constraint dari Discovery
    ├── architecture.md           # High-level design (system architecture, tech decisions)
    ├── data-model.md             # Database schema, ERD, relationships
    ├── design-system.md          # UI/UX guidelines (colors, typography, components)
    ├── security-standards.md     # Security policies, compliance requirements
    └── decisions/                # ADR (Architecture Decision Records)
        └── adr-001-*.md          # Keputusan teknis signifikan (why, trade-offs)
```

### **1. workspace-manifest.json** — Agentic Workspace Provisioning

**Ditulis oleh:** Toolsmith agent (mode `init`, `switch`, `sync`)

**Dibaca oleh:** Toolsmith, Orchestrator (untuk verify readiness)

**Fungsi:** Platform-agnostic source of truth untuk workspace setup.

```json
{
  "project": "booking-kapal-wisata",
  "decidedFrom": ["project_overview.md tech stack", "find-skills"],
  "skills": [
    { "id": "find-skills", "reason": "discover further skills" },
    { "id": "ui-ux-pro-max", "reason": "Next.js + Tailwind UI" }
  ],
  "mcp": [
    { "id": "filesystem", "reason": "workspace grounding" },
    { "id": "git", "reason": "code-aware context" }
  ],
  "appliedTo": {
    "claude-code": "2025-06-23 09:15",
    "opencode": null,
    "antigravity": null,
    "github-copilot": null
  },
  "revisionHistory": [
    { "timestamp": "2025-06-23 09:15", "agent": "toolsmith", "change": "initial provisioning" }
  ]
}
```

**Workflow Toolsmith:**
- **Mode init** (Fase 1 step 3b) — Toolsmith read `project_overview.md` tech stack, konsultasi `schemas/workspace-registry.json`, derive skills + MCP, tulis manifest, apply ke tool aktif
- **Mode sync** (Fase 2 step 0) — Verify manifest sesuai config aktual, deteksi drift, update jika perlu
- **Mode switch** (developer pindah tool) — Read manifest lama, apply ke tool baru tanpa re-derive

**Aturan:**
- Manifest adalah keputusan shared — jika ada request ganti skill/MCP, **update dokumen acuan terlebih dahulu** (No Silent Changes)
- Secrets (API keys, db password) ditulis sebagai `${VAR}` placeholder → developer isi di `.env`
- Per-tool config files (`.mcp.json`, `opencode.json`, dll) adalah **derived artifacts** — jangan edit manual, biarkan Toolsmith manage

---

### **2. context.json** — Session Continuity

**Ditulis oleh:** Setiap agent di **akhir session** (jika ada perubahan)

**Dibaca oleh:** Setiap agent di **awal session** (context awareness)

**Fungsi:** Menjaga continuity workflow antar-session/antar-developer.

```json
{
  "project_name": "booking-kapal-wisata",
  "last_updated": "2025-06-23 14:30",
  "last_agent": "backend",
  "current_sprint": "Sprint 1 - Auth & Database",
  "active_tasks": ["TASK-001", "TASK-002"],
  "blocked_tasks": [],
  "notes": "TASK-001 (Backend Login) ready for QA. TASK-002 (Frontend Login UI) in progress—waiting for API Contract finalization"
}
```

**Aturan:**
- Setiap agent WAJIB baca file ini di awal untuk understand status project
- Update di akhir dengan status terkini, task active, blocker, dll
- Format ketat (JSON) — parser automation bergantung pada structure consistent

**Contoh flow:**
```
Backend Agent (09:00) baca context.json
  → lanjut TASK-001 dari status "dev"
  → selesai, update context: active_tasks=[TASK-002], last_agent="backend", notes="ready for QA"
  → simpan context.json

Frontend Agent (10:00) baca context.json
  → lihat last_agent="backend", notes="ready for QA"
  → understand Backend sudah selesai, siap kolaborasi via API Contract
  → lanjut TASK-002
  → update context di akhir
```

---

### **3. agent_handoff.json** — Agent-to-Agent Handoff

**Ditulis oleh:** Agent yang mengirim task (overwrite setiap handoff)

**Dibaca oleh:** Agent penerima (instruction + artifacts)

**Fungsi:** Detailed handoff notes + artifact pointers untuk agent berikutnya.

```json
{
  "from_agent": "backend",
  "to_agent": "qa",
  "task_id": "TASK-001",
  "timestamp": "2025-06-23 14:30",
  "status": "ready_to_test",
  "notes": "Login API selesai (POST /api/auth/login, POST /api/auth/refresh). Test case priority: validasi email invalid, password wrong, token refresh expired.",
  "artifacts": [
    "codes/src/app/api/auth/login/route.ts",
    "codes/src/app/api/auth/refresh/route.ts",
    "logs/development/dev_001_login.md"
  ]
}
```

**Aturan:**
- Hanya menyimpan handoff **terakhir** (overwrite, jangan append)
- Artifacts path harus relative ke repo root
- Gunakan saat menyerahkan task antar-agent formal (bukan sekadar update status di task_list.md)

---

### **4. knowledge_base/** — Living Documentation

**Ditulis oleh:** Berbagai agen (Discovery, Analyst, Data Architect, UX Designer, Security, PM)

**Dibaca oleh:** Semua agen (setiap agen wajib baca acuan sebelum kerja)

**Fungsi:** Single source of truth untuk architectural decisions, design, security policies, dll.

#### **knowledge_base/requirements/**
- Ditulis oleh: **Discovery Agent** (Fase 1 awal)
- Isi: User stories, scope, constraint, acceptance criteria, assumptions
- Dibaca oleh: Initiator, Analyst, PM
- Update: Discovery/Analyst saat scope berubah (dengan gate)

#### **knowledge_base/architecture.md**
- Ditulis oleh: **Initiator** → high-level, **Backend/DevOps** → detailed
- Isi: System design, tech stack rationale, API patterns, deployment strategy
- Dibaca oleh: Semua agen (terutama Backend, Frontend, DevOps)
- Update: Saat ada architectural change (ADR required)

#### **knowledge_base/data-model.md**
- Ditulis oleh: **Data Architect** (Fase 1), **Backend** (maintenance)
- Isi: Database schema, ERD, indexes, relationships, data governance
- Dibaca oleh: Backend, Frontend (untuk API contract), Analyst
- Update: Saat ada schema change (migration + dokumentasi)

#### **knowledge_base/design-system.md**
- Ditulis oleh: **UX Designer** (Fase 1), **Frontend** (maintenance)
- Isi: Color palette, typography, component library, motion, accessibility
- Dibaca oleh: Frontend, Backend (untuk validation), Design feedback
- Update: Saat ada design change (dengan gate)

#### **knowledge_base/security-standards.md**
- Ditulis oleh: **Security Expert** (Fase 1 Mode S, atau Fase 4 audit)
- Isi: Authentication strategy, encryption, data protection, OWASP, compliance
- Dibaca oleh: Backend, DevOps, QA (untuk security testing)
- Update: Saat ada security audit findings atau new requirement (dengan gate)

#### **knowledge_base/decisions/**
- ADR (Architecture Decision Records) untuk keputusan signifikan
- Format: ADR-001-*.md (title-kebab-case)
- Isi: Decision, context, alternatives considered, rationale, consequences
- Ditulis oleh: Agent yang propose (dengan human approval)
- Dibaca oleh: Semua agen (sebelum buat keputusan serupa)

---

### **Aturan Interaksi state/ folder** ⚠️

#### **1. Read sebelum action**
```bash
# Setiap agent WAJIB baca di awal session:
1. context.json — understand current status
2. agent_handoff.json — jika ada handoff yang ditunggu
3. knowledge_base/* — acuan untuk domain spesifik
```

#### **2. Update dengan disiplin**
- **context.json** — update hanya di akhir session (jika ada change)
- **agent_handoff.json** — tulis hanya saat handoff formal antar-agent
- **knowledge_base/** — update hanya jika change terverifikasi/approved (No Silent Changes)

#### **3. Jangan edit manual**
- `workspace-manifest.json` — Toolsmith yang kelola (jangan diedit manual)
- `context.json`, `agent_handoff.json` — Agent yang kelola (format ketat untuk parser)
- `knowledge_base/` — Hanya agen authorized yang edit (Discovery → requirements, Architect → architecture, dll)

#### **4. Conflict resolution**
- Jika ada conflict di `knowledge_base/` (dua agen edit file sama), **winner adalah yang lebih recent** (by timestamp)
- Jika conflict signifikan, human harus approve di gate

#### **5. Tidak ada "hardcoded state"**
- state/ folder adalah **tentative** (bisa berubah saat gate review)
- Final truth tetap di dokumen acuan (specifications/, project_overview.md)
- state/ adalah **convenience cache** untuk agen continuity, bukan single source of truth

---

### **Contoh Workflow Lengkap**

```
🟦 FASE 1 (Perencanaan)

[Discovery] Interview → tulis requirements.md di state/knowledge_base/requirements/
[Initiator] Baca requirements.md → tulis project_overview.md + architecture.md di knowledge_base/
[Analyst] Baca project_overview.md → tulis api-contract.md di specifications/
  → Update context.json: active_tasks=[TASK-001], notes="API Contract finalized, ready for Fase 2"
[UX Designer] Baca architecture.md → tulis design-system.md di knowledge_base/
[Data Architect] Baca architecture.md → tulis data-model.md di knowledge_base/
[Toolsmith] (Mode init) Baca project_overview.md → derive workspace manifest → tulis state/workspace-manifest.json
  → Apply ke tool aktif (.mcp.json / opencode.json / dll)

👤 GATE: Human approve API Contract + workspace setup → Fase 1 done

---

🟩 FASE 2 (Pengerjaan)

[Toolsmith] (Mode sync) Verify manifest sesuai config aktif → detect drift jika ada
[Backend] Baca context.json → active_tasks=[TASK-001]
  → Baca api-contract.md di specifications/
  → Baca data-model.md di knowledge_base/
  → Implementasi login API
  → Update context.json: last_agent="backend", notes="Login API ready"
  → Tulis agent_handoff.json → to_agent="qa", status="ready_to_test"

[QA] Baca context.json → lihat last_agent="backend"
  → Baca agent_handoff.json → understand task & artifacts
  → Review code, run security checks
  → Approve atau request fix

[Frontend] Paralel dengan Backend
  → Baca api-contract.md, design-system.md
  → Implementasi login UI
  → Update context.json

👤 GATE: Human approve kode → Fase 2 done

---

🟨 FASE 3 (Testing) & 🟧 FASE 4 (Hardening)

[Tester] Baca context.json → understand status
  → Run E2E tests
  → Report findings
  
[Security] Baca knowledge_base/security-standards.md (jika ada)
  → Audit code
  → Propose changes → ADR jika signifikan
  → Update knowledge_base/decisions/

→ Update context.json, agent_handoff.json sesuai handoff
```

---

### **Best Practice**

1. **Treat state/ as continuity**, not source of truth
   - Source of truth tetap di `specifications/`, `project_overview.md`, `knowledge_base/`
   - state/ adalah **derived convenience** untuk agen awareness

2. **Keep context.json brief**
   - Jangan simpan data besar — hanya summary + pointers
   - Detail ada di task/task_list.md, logs/, artifacts

3. **Honor handoff protocol**
   - Jangan skip agent_handoff.json saat formal handoff
   - Frontend tunggu Backend siap sebelum mulai (via handoff + API Contract)

4. **Document decisions**
   - Keputusan signifikan (architecture, security, data-model) → ADR di decisions/
   - Jangan hanya di chat/notes — harus permanent di KB

---

## 🤖 20 AI Agent Personas & Capabilities

VasVibe v2.3 menggunakan **20 agent terspesialisasi** di 4 fase:

**Fase 1 — Perencanaan (Discovery & Blueprint):**
- **Discovery Agent** — Wawancara kebutuhan → requirements.md
- **Initiator Agent** — Tulis project_overview.md (tech stack, UI/UX, roadmap)
- **Data Architect** — Design data model & ERD
- **UX Designer** — Design system (colors, components, motion)
- **Analyst Agent** — Spesifikasi & API Contract
- **Toolsmith Agent** ⭐ NEW — Provisioning workspace agentik (skills + MCP)

**Fase 2 — Pengerjaan (Implementation):**
- **Backend Engineer** — Server-side API & business logic (standard/deep)
- **Frontend Engineer** — Client-side UI & integration (standard/deep)
- **Fullstack Developer** — Satu developer untuk dua sisi (fast mode)
- **QA Agent** — Code review & static analysis
- **Fixer Agent** — Bug fixing & debugging

**Fase 3 — Testing (E2E & Verification):**
- **Tester Agent** — Playwright automation & QA testing
- **Manual Tester Agent** ⭐ NEW — Headful UAT: scenario matrix (Normal/Abnormal), screenshot evidence, Major/Minor defect triage, retest iteration (opsional, berdampingan dengan Tester)

**Fase 4 — Hardening (Release Readiness):**
- **Security Expert** — Threat modeling & OWASP audit
- **Reliability Engineer** — Performance & load testing

**Cross-Phase (Coordination & Documentation):**
- **Orchestrator** — Pipeline coordinator (/plan-project, /build-feature, /test-feature, /release, dll)
- **PM Agent** — Task management & progress tracking
- **DevOps Agent** — Infrastructure & CI/CD setup
- **Document Agent** — Technical documentation

> 🔗 **Detail lengkap** mengenai cara kerja, rules, integrasi alur tugas, serta kemampuan (*capabilities*) dari tiap-tiap agen dapat dibaca di panduan terpisah:
> 👉 **[BACA: Panduan Persona & Kemampuan Agen (AGENT_PERSONAS.md)](./AGENT_PERSONAS.md)**

---

## ✨ Perubahan Utama v2.2

### **1. Toolsmith Agent — Workspace Provisioning Agentik** ⭐
Agen baru (ke-19) yang mengotomatisasi setup AI tool. Membedakan:
- **Toolsmith** → Setup tool AI (skills + MCP) untuk agent bekerja optimal
- **DevOps** → Setup runtime produk (Docker, infrastructure)

**Desired-State Architecture:**
- `state/workspace-manifest.json` — Single source of truth (platform-agnostic)
- Per-tool config (`.mcp.json`, `opencode.json`, `.vscode/mcp.json`) — Derived artifacts
- `/setup-workspace [init|switch|sync]` — Otomatis detect tool aktif, apply manifest

**Benefit:** Ganti tool (Claude Code → OpenCode) tanpa re-derive requirements. Just run `/setup-workspace switch tool=opencode`.

### **2. Developer → Fullstack (v2.0 contd.)**
- **Fast mode** (`depth=fast`) → Satu **Fullstack** developer
- **Standard/Deep** (`depth=standard|deep`) → **Backend + Frontend paralel** via API Contract

### **3. Multi-Tool Support Sync** ⭐ v2.2
- **GitHub Copilot prompt files** → `.github/prompts/*.prompt.md` (19 agents synced)
- **Codex** → project rules di `AGENTS.md`, custom agents di `.codex/agents/`, dan skills yang dapat dipanggil dengan `$VasVibe-<command>` di `.agents/skills/`
- **Source of truth** → `agent/workflows/` (auto-propagate ke `.codex/`, `.claude/`, `.opencode/`, `.agents/`, `.github/prompts/`)
- **Template sync** → `npm run sync-template` (create-vasvibe template always up-to-date)

### **4. Git Workflow Audit** ⭐ v2.2
- **4 agen** ditambahkan pointer ke `_shared/git-branch-management.md`:
  - DevOps (sebelum menulis infrastructure code)
  - QA (code review checkpoint)
  - Security (vulnerability fix phase)
  - Reliability (hardening phase)
- **Kenapa:** Consistency git workflow di semua agen, prevent merge conflicts

### **5. No Silent Changes Protocol** ⭐ v2.0
Setiap perubahan yang diminta **harus ditulis ke dokumen acuan**:
- Request change → Analyst (atau agen terkait) update spec/requirement/design-system
- Dokumen di-review & approve
- Agen downstream di-notify
- Result: No rework, clear audit trail

---

## 🛠️ Cara Memulai (Step-by-Step)

### **4-Phase Model Ringkas**

Workflow ini diorganisir dalam **4 fase**, tiap fase diakhiri **gate** (approval manusia):

```
🟦 FASE 1: Perencanaan
   Discovery → Requirements → project_overview.md → Tech stack + Design system → Spesifikasi → API Contract
   ↓ GATE: Approve API Contract

🟩 FASE 2: Pengerjaan
   Analyst spec-lock → Backend + Frontend coding paralel (atau Fullstack fast) → QA review
   ↓ GATE: Approve kode

🟨 FASE 3: Testing
   E2E Playwright tests → Fixer fixes bugs sampai hijau
   ↓ GATE: Approve test results

🟧 FASE 4: Hardening
   Security audit + Reliability test → CHANGELOG → Git tag
   ↓ GATE: Approve rilis
```

**Aturan:**
- Tidak boleh lanjut fase tanpa approval di gate
- Setiap perubahan dicatat ke dokumen acuan (No Silent Changes)
- Jika ada blocker → discuss & document, jangan skip

---

### **Phase 1: Perencanaan** 👤🤖

**Step 0: Tentukan Work Depth**

Buka `project_overview.md` (atau buat baru), set:
```yaml
WORK_DEPTH: standard   # fast | standard | deep
```

**Kapan:**
- `fast` — MVP, prototype, eksplorasi ide (Fullstack 1 agen)
- `standard` — Produksi normal (Backend + Frontend terpisah) **← DEFAULT**
- `deep` — Fintech, auth, data sensitif (+ Security + Reliability)

---

### **Phase 1a: Project Initialization** 👤🤖

**👤 Human Decision:**
1. Tentukan ide proyek (apa yang ingin dibuat?)
2. Tentukan scope minimal (MVP) vs future features
3. Tentukan deadline & budget constraints

**🤖 AI Execution:**

**Step 1: Inisialisasi Proyek**

```bash
# Di VS Code, panggil Initiator Agent
/initiator
```

**Input ke Agent:**
```
"Aplikasi manajemen booking kapal wisata Labuan Bajo.
Customer bisa booking online, admin bisa manage booking 
& pricing, kru bisa lihat jadwal. 
Pakai Next.js, PostgreSQL, payment gateway Midtrans.
Target launch April 2025."
```

**Output:**
- File `project_overview.md` akan dibuat dengan lengkap

**👤 Human Review (CRITICAL):**
- [ ] Baca `project_overview.md` dari awal sampai akhir
- [ ] Check tech stack (sudah sesuai kebutuhan?)
- [ ] Check UI/UX guidelines (warna, font, component library)
- [ ] Check development roadmap (realistis tidak?)
- [ ] **APPROVE** atau minta revisi ke Agent

**⚠️ Jangan lanjut jika belum approve project_overview.md!**

---

### **Phase 1b: Workspace Provisioning** 🤖 ⭐ v2.2

**Setelah tech stack diketahui (di project_overview.md), setup workspace agentik:**

```bash
/setup-workspace init
```

**Toolsmith Agent akan:**
1. Detect tool aktif (Claude Code? OpenCode? GitHub Copilot?)
2. Baca `project_overview.md` → extract tech stack
3. Konsultasi `schemas/workspace-registry.json` → recommend skills + MCP
4. Present manifest untuk approval

**Output:**
- `state/workspace-manifest.json` — Desired state (platform-agnostic)
- `.mcp.json` (Claude) / `opencode.json` (OpenCode) / `.vscode/mcp.json` (Copilot) / `.agents/mcp.json` (Antigravity)
- Secrets sebagai `${VAR}` placeholder → developer isi di `.env`

**👤 Human:**
- [ ] Review manifest (skills + MCP sesuai tech stack?)
- [ ] Fill `.env` dengan secrets
- [ ] Verify MCP servers functional

---

### **Phase 1c: Infrastructure Setup** 👤🤖

**👤 Human Decision:**
- Hosting: Local Docker? Cloud (Vercel + Supabase)? VPS?
- Database size estimate?
- Backup strategy?

**🤖 AI Execution:**

**Step 2: Spesifikasi Infrastruktur**

```bash
/analyst

"Buat spesifikasi environment setup"
```

**Agent Logic:**
- Agent akan deteksi `000_spec_environment_setup.md` belum ada
- Otomatis membuat spec infrastruktur (Docker, DB, Redis, dll)

**Output:**
- `specifications/000_spec_environment_setup.md`

**👤 Human Review:**
- [ ] Check Docker services (App, DB, Redis - perlu semua?)
- [ ] Check environment variables (API keys, secrets)
- [ ] Check port configuration (conflict dengan app lain?)

**Step 3: Implementasi Infrastructure**

```bash
/developer

"Implementasikan SPEC-000 (Environment Setup)"
```

**Output:**
- `codes/docker-compose.yml`
- `codes/.env.example`
- `codes/Dockerfile`
- `logs/development/dev_000_environment_setup.md`

**👤 Human Execution:**
```bash
# Jalankan Docker manually
cd codes
cp .env.example .env
# Edit .env sesuai kebutuhan (database password, etc.)

docker-compose up -d
docker-compose logs -f
```

**Verify:**
- [ ] Database running? (`docker ps`)
- [ ] App accessible? (`http://localhost:3000`)
- [ ] No errors di logs?

---

### **Phase 2: Database Design** 👤🤖

**Step 4: Database Schema Specification**

```bash
/analyst

"Buat spesifikasi database schema"
```

**Output:**
- `specifications/001_spec_database_schema.md`

**👤 Human Review:**
- [ ] Check ERD (relasi antar table masuk akal?)
- [ ] Check field types (JSONB vs separate table?)
- [ ] Check indexes (performance critical fields?)

**Step 5: Prisma Migration**

```bash
/developer

"Implementasikan SPEC-001 (Database Schema)"
```

**Output:**
- `codes/prisma/schema.prisma`
- `logs/development/dev_001_database_schema.md`

**👤 Human Execution:**
```bash
cd codes
npm install
npx prisma migrate dev --name init
npx prisma generate
```

**Verify:**
- [ ] Migration success?
- [ ] Tables created? (check via Prisma Studio: `npx prisma studio`)

---

### **Phase 2: Pengerjaan** 👤🤖

**Step 0: Sync Workspace** ⭐ v2.2

Sebelum build feature, pastikan workspace sync (special jika ganti tool):

```bash
/setup-workspace sync
# atau jika switch tool:
/setup-workspace switch tool=opencode
```

**Tujuan:** Verifikasi manifest sesuai config aktual, deteksi drift, update jika ada perubahan tech stack.

---

### **Step 1: Feature Development Loop** 🔄 👤🤖

Ulangi siklus ini untuk **setiap fitur**:

#### **Step 1.1: Specification (Analyst)**

**👤 Human:** Tentukan fitur mana yang dikerjakan duluan (prioritas)

```bash
/analyst

"Buat spesifikasi untuk fitur Booking Management"
```

**🤖 Agent Output:**
- `specifications/003_spec_booking_management.md`
- Atau breakdown menjadi atomic specs (003-001, 003-002, dll)

**👤 Human Review:**
- [ ] User stories jelas?
- [ ] API contracts lengkap?
- [ ] UI mockups sesuai design system?
- [ ] Validation rules masuk akal?

**⚠️ Approve spec → Then create task:**
```bash
/pm

"Buat task di task_list.md berdasarkan SPEC-003 (Booking Management)"
```

**🤖 PM Agent Output:**
- New task entry di `task/task_list.md`:
  ```
  ### TASK-003: Booking Management
  - **Priority:** P0 (Critical)
  - **Status:** not_started
  - **Spec:** specifications/003_spec_booking_management.md
  - **Dependencies:** TASK-001 (Database Schema), TASK-002 (Authentication)
  - **Assigned To:** -
  - **Description:** Implement booking CRUD operations with DP calculation
  ```

#### **Step 1.2: Implementation**

**Jika depth=fast:**
```bash
/fullstack

"Implementasikan SPEC-003 (Booking Management)"
```
→ Satu Fullstack agent koding dua sisi

**Jika depth=standard atau depth=deep:**
```bash
/backend

"Implementasikan backend SPEC-003 (Booking Management)"
```

```bash
/frontend

"Implementasikan frontend SPEC-003 (Booking Management)"
```
→ Backend + Frontend jalankan paralel via API Contract

**🤖 Agent akan:**
1. Read `task/task_list.md` → Find TASK-003
2. **Update status:** `not_started` → `dev`
3. **Set Assigned To:** [Backend/Frontend/Fullstack] Agent
4. Implement code sesuai spec + API Contract
5. Create development log
6. **Update status:** `dev` → `ready_to_test`

**🤖 Agent Output:**
- Backend: API routes, business logic, DB queries
- Frontend: UI components, API integration, styling
- Log: `logs/development/dev_003_booking_management.md`

**👤 Human Tasks:**
1. **Code Review:**
   - [ ] Logic benar? (hitung DP 50%, validasi tanggal, dll)
   - [ ] Security OK? (authentication, authorization)
   - [ ] Performance? (N+1 query problem?)
   
2. **Manual Testing:**
   ```bash
   # Start dev server
   cd codes
   npm run dev
   ```
   - [ ] Buka browser → Test create booking
   - [ ] Test validation (input invalid data)
   - [ ] Test edge cases (booking di tanggal yang sudah full)

3. **Check Errors:**
   ```bash
   # Lihat TypeScript errors
   npm run type-check
   
   # Lihat lint errors
   npm run lint
   ```

**Jika ada bugs di testing:**
```bash
/fixer

"Ada bug di create booking: DP amount tidak ter-kalkulasi.
Error: totalPrice is undefined di line 45
Stack trace: [paste error dari terminal]

Reproduce steps:
1. Buka form create booking
2. Isi pax = 15
3. Click Submit
4. Error muncul"
```

**🤖 Fixer Agent akan:**
1. Read `task/task_list.md` → Find TASK-003 with status "failed"
2. **Update status:** `failed` → `fixing`
3. Analyze error & stack trace
4. Read related code files
5. Identify root cause
6. Apply fix
7. **PENTING:** Update dokumen spesifikasi (`specifications/`) jika scope fixing melebihi bug kecil
8. Run tests untuk verify fix
9. **Update status:** `fixing` → `ready_to_test` (back to Tester)
10. Create fixing log di `logs/fixing/fixing_003_booking_dp_bug.md`

**👤 Human verify:**
- [ ] Bug fix works? (test manually)
- [ ] No side effects? (test related features)
- [ ] Root cause addressed? (bukan just symptom fix)

---

#### **Step 2.2: Re-test (Tester)**

Setelah Fixer fix bugs, Tester run tests ulang sampai hijau.

**Gate: Approve saat semua test hijau ✅**

#### **Step 1.3: Code Review (QA Agent)**

```bash
/qa

"Review SPEC-003 implementation code untuk correctness, security, performance"
```

**🤖 QA Agent akan:**
1. Static code analysis (TypeScript, linting)
2. Security checks (OWASP top 10, input validation)
3. Performance review (N+1 queries, unnecessary re-renders)
4. Report findings

**Output:**
- Code review comments
- Pass/Fail status

**👤 Human:**
- [ ] Review QA findings
- [ ] Approve jika OK, atau minta developer fix

---

### **Step 2: Testing** 👤🤖

**Step 2.1: Testing (Tester)**

```bash
/tester

"Buat dan jalankan E2E test untuk Booking Management API"
```

**🤖 Agent akan:**
1. Read `task/task_list.md` → Find TASK-003 with status "ready_to_test"
2. Create test scenarios (Playwright) → **Update status:** `ready_to_test` → `testing_ready`
3. Run tests → **Update status:** `testing_ready` → `testing`
4. Analyze results → **Update status:** `testing` → `passed` (or `failed`)

**🤖 Agent Output:**
- `tests/e2e/booking.test.ts`
- `logs/testing/test_003_booking_management.md`

**👤 Human Tasks:**
1. **Verify Test Coverage:**
   - [ ] Happy path tested?
   - [ ] Error cases tested?
   - [ ] Edge cases tested?

2. **Run Tests Manually:**
   ```bash
   cd codes
   npm test
   ```

3. **Exploratory Testing:**
   - Test scenario yang tidak tercakup automated test
   - Test dengan real user behavior (random input, rapid clicking, dll)

---

### **Step 2.1b: Manual/Headful UAT Testing (Manual Tester)** ⭐ NEW — Opsional

Selain `/tester` (scripted E2E), tersedia `/manual-test` untuk pengujian bergaya manusia dengan bukti visual — **independen**, bisa dijalankan kapan saja, tidak mengubah gate Fase 3:

```bash
/manual-test

"Buat dan jalankan manual UAT test untuk fitur Booking Management"
```

**🤖 Manual Tester Agent akan:**
1. Susun scenario matrix (minimal 1 Normal + 1 Abnormal per fitur/fungsi)
2. Eksekusi headful Playwright (browser terlihat), screenshot tiap skenario
3. Update Pass/Fail, dan untuk yang Fail: deskripsi temuan + Severity (Major/Minor)
4. Tulis laporan `task/[TASK-ID]_[nama-task]/manual_test_report.md` — berisi sheet **Summary** (agregat: total skenario, pass, fail, major, minor) dan sheet **Scenario Detail** (langkah, ekspektasi, aktual, path screenshot, catatan)

**👤 Human:**
- Review temuan Major → kirim ke `/fixer`
- Setelah fix, jalankan ulang `/manual-test` untuk retest — iterasi baru otomatis tercatat, histori iterasi sebelumnya tetap tersimpan di laporan yang sama

---

### **Step 3: Hardening** 👤🤖 (Per-Release)

Setelah 3-5 fitur selesai & siap rilis, jalankan hardening:

```bash
/harden-release "1.0.0"
```

**Agents yang jalan:**
- **Security Agent** — OWASP audit, threat modeling, vulnerability scan
- **Reliability Agent** — Load testing, performance optimization
- **Document Agent** — CHANGELOG generation

**Output:**
- `logs/hardening/security_audit_1.0.0.md`
- `logs/hardening/reliability_test_1.0.0.md`
- Updated `CHANGELOG.md`
- `git tag v1.0.0`

**👤 Human:**
- [ ] Review security findings
- [ ] Review performance metrics
- [ ] Approve release

---

### **Step 4 (Optional): Production Deployment** 👤🤖

**When to do this:**
- Setelah hardening disetujui
- Sebelum deployment ke production
- Saat merencanakan scaling atau cost optimization
- Saat ada infrastructure review perlu

**Step 4.1: Infrastructure Analysis**

```bash
/sysarch

"Analyze current application and design server specifications 
for production deployment. Create deployment plan."
```

**🤖 SysArch Agent akan:**
1. Read `project_overview.md`, `specifications/*.md`, codebase
2. Analyze database schema, API endpoints, file storage needs
3. **ASK critical questions** tentang:
   - User load (concurrent users, growth rate)
   - Transaction volume (bookings/day, payments/day)
   - Data & storage (file uploads, backup requirements)
   - Performance targets (response time, page load)
   - Availability (uptime, HA requirements)
   - Budget & deployment preferences
   - Security & compliance needs

**👤 Human:**
- [ ] Answer all questions accurately
- [ ] Provide conservative estimates

**Output:**
- `architecture/current_state.md`
- `architecture/server_specifications.md`
- `architecture/deployment_plan.md`
- `architecture/cost_analysis.md`
- `architecture/monitoring_plan.md`

**Step 4.2: Review & Approve**

**👤 Human Review:**
- [ ] Server specs sufficient?
- [ ] Cost sesuai budget?
- [ ] Deployment plan clear?
- [ ] Monitoring comprehensive?
- [ ] Backup & disaster recovery OK?

**If cost too high:**
```bash
/sysarch

"Cost $500/month, budget $200/month.
Provide 2-3 cost optimization scenarios dengan trade-offs."
```

**Step 4.3: Deploy**

**👤 Human:**
- [ ] Follow deployment_plan.md step-by-step
- [ ] Setup infrastructure (VPS, Docker, PostgreSQL, monitoring, SSL, backups)
- [ ] Verify deployment (app accessible, SSL valid, monitoring alerts OK, backup running)
- [ ] Performance check (page load < 3s)

---

### **Step 5: Final Documentation** 👤🤖 (Per-Release)

```bash
/document

"Generate FSD + API documentation dari semua specifications"
```

**Output:**
- `documentation/FSD_VasVibe.md`
- `documentation/API_Documentation.md`

**👤 Human:**
- [ ] Documentation complete & clear?

---

## 👤 Tanggung Jawab Manusia (Human-in-the-Loop)

AI Agent **TIDAK DAPAT** dan **TIDAK BOLEH** mengambil keputusan untuk hal-hal berikut:

### **1. Business Decisions** 🎯
- ❌ Menentukan prioritas fitur (mana yang dikerjakan duluan?)
- ❌ Menentukan pricing strategy (berapa harga produk?)
- ❌ Menentukan target market (siapa user kita?)
- ❌ Approve budget & timeline

**👤 Human:** Product Owner / Business Stakeholder

---

### **2. Architecture Decisions** 🏗️
- ❌ Pilih monolith vs microservices?
- ❌ Pilih SQL vs NoSQL?
- ❌ Pilih cloud provider (AWS vs GCP vs Azure)?
- ❌ Approve tech stack yang diusulkan Agent

**👤 Human:** Tech Lead / Solution Architect

**✅ Agent:** Memberikan **rekomendasi** + pros/cons, tapi **final decision** tetap di manusia

---

### **3. Security & Compliance** 🔒
- ❌ Approve deployment ke production
- ❌ Approve perubahan database schema di production
- ❌ Approve akses ke production secrets/API keys
- ❌ Menentukan data retention policy (GDPR, UU PDP)

**👤 Human:** Security Engineer / Compliance Officer

**⚠️ Warning:** Agent **DAPAT** menjalankan command berbahaya (`rm -rf`, `DROP TABLE`, dll) jika tidak diawasi!

---

### **4. Code Quality Gates** ✅
- ❌ Approve merge ke `main` branch
- ❌ Approve deployment ke staging/production
- ❌ Skip failing tests (NEVER!)

**👤 Human:** Senior Developer / Team Lead

**Process:**
1. Agent creates code → Human reviews
2. If OK → Human approves (via Git PR)
3. If NOT OK → Human provides feedback → Agent fixes

---

### **5. User Experience Decisions** 🎨
- ❌ Final approval untuk UI/UX design
- ❌ Menentukan user flow (apakah flow ini intuitif?)
- ❌ Approve wording (error messages, button labels, dll)

**👤 Human:** UX Designer / Product Manager

**✅ Agent:** Generate UI berdasarkan guidelines, tapi **final polish** tetap perlu human touch

---

## 📋 Daily Workflow Checklist

### **Morning Routine** ☀️

```bash
# 1. Check project progress
/pm

"Tampilkan status project saat ini dari task_list.md"
```

```bash
# 2. Sync context dengan Agent
/developer

"Baca logs/development/dev_*.md, apa progres terakhir?"
```

**👤 Human:**
- [ ] Review task progress dari task_list.md
- [ ] Review semua changes semalam (git diff)
- [ ] Check error logs (jika ada background process)
- [ ] Prioritize tasks hari ini (based on task_list.md priorities)

---

### **Development Cycle** 🔄

```
[Analyst] → [👤 Review] → [PM] → [Developer] → [👤 Test] → [Fixer (if bugs)] → [Tester] → [👤 Approve]
                             ↓
                    (Create task in 
                     task_list.md)                                    ↓
                                                                 (After MVP)
                                                                      ↓
                                        [SysArch] → [👤 Review] → [Deploy] → [Monitor]
```

**Per Feature (2-4 hours):**
1. **Analyst:** Create spec (30 min)
2. **👤 Human:** Review & approve spec (15 min)
3. **PM:** Create task in task_list.md (5 min) ⭐ NEW
4. **Developer:** Implement code + update task status (1-2 hours)
5. **👤 Human:** Code review + manual test (30 min)
6. **Fixer:** Fix bugs if found + update task status (15-30 min) ← **OPTIONAL**
7. **Tester:** Create & run tests + update task status (30 min)
8. **👤 Human:** Verify test results (15 min)

**Repeat** untuk fitur berikutnya

**Before Production Deploy (after MVP complete):**
1. **SysArch:** Analyze app & create infrastructure plan (2-3 hours)
2. **👤 Human:** Answer requirements questions & review plan (1 hour)
3. **SysArch/Developer:** Deploy to production (2-4 hours)
4. **SysArch:** Setup monitoring & alerts (1 hour)
5. **👤 Human:** Verify deployment & monitor metrics (ongoing)

---

### **Evening Routine** 🌙

**👤 Human:**
- [ ] Review semua development logs hari ini
- [ ] Commit & push changes ke Git
- [ ] Update project board (Trello/Jira/Linear)
- [ ] Note blocker untuk besok

```bash
# Optional: Update task status based on logs
/pm

"Update task_list.md berdasarkan development logs hari ini"
```

```bash
# Optional: Minta Agent summarize hari ini
/developer

"Summarize semua development logs hari ini, 
apa saja yang sudah selesai dan apa yang masih pending?"
```

```bash
# Optional: Generate status report
/pm

"Generate project status report untuk hari ini"
```

---

## ⚠️ Common Pitfalls & How to Avoid

### **1. Agent Tidak Punya Context** 🤔
**Symptom:** Agent buat code yang tidak sesuai project

**Fix:**
```bash
# Selalu arahkan Agent untuk baca context dulu
/developer

"Baca project_overview.md dan specification/003_*.md 
sebelum implementasi fitur Booking"
```

---

### **2. Agent Menjalankan Command Berbahaya** ⚠️
**Symptom:** Agent suggest `rm -rf` atau `DROP DATABASE`

**Fix:**
- **👤 Human:** ALWAYS review command sebelum execute
- Use Git (semua changes bisa di-rollback)
- Backup database sebelum migration

---

### **3. Spec Tidak Jelas → Code Salah** 📝
**Symptom:** Developer Agent tanya-tanya terus karena spec ambiguous

**Fix:**
- **👤 Human:** Review spec dari Analyst dengan detail
- Minta Analyst revisi jika ada yang unclear
- Jangan approve spec yang setengah-setengah

---

### **4. Infrastructure Planning & Deployment** ⚙️ ⭐ NEW
**Symptom:** Aplikasi sudah siap, tapi bingung deploy dimana dan butuh server apa

**Solution:**
```bash
/sysarch

"Analyze current application (VasVibe Reservation System).

Context:
- Next.js 14 App Router
- PostgreSQL database with 15 tables
- File uploads: 10-20 photos/day (~5MB each)
- Target: 100 concurrent users, 50 bookings/day
- Budget: $200/month
- Location: Indonesia users only
- Required: 99% uptime, daily backups

Design server specifications and deployment plan."
```

**SysArch Agent akan:**
1. Analyze codebase & database schema
2. Ask clarifying questions tentang load, growth, budget
3. Create server specifications (CPU, RAM, Storage)
4. Design deployment architecture (1-server, 2-server, or cloud)
5. Estimate monthly costs
6. Provide deployment step-by-step guide
7. Setup monitoring plan

**👤 Human:**
- [ ] Answer all requirements questions dengan data akurat
- [ ] Review cost analysis (sesuai budget?)
- [ ] Review server specs (cukup untuk load?)
- [ ] Approve deployment plan
- [ ] Execute deployment following the guide

---

### **5. Performance Issues in Production** 🐌
**Symptom:** Aplikasi lambat, page load > 5 seconds, API timeout

**Solution:**
```bash
/sysarch

"Performance analysis request.

Current metrics:
- Page load time: 8 seconds (target: < 3s)
- API response time: 3-5 seconds (target: < 500ms)
- Database query time: 2-4 seconds per request
- Server CPU: 85% average
- Server RAM: 90% usage

Analyze bottlenecks and provide optimization recommendations.
Consider: database indexing, query optimization, caching, CDN, server upgrade."
```

**SysArch Agent akan:**
1. Analyze performance metrics
2. Identify bottlenecks (database, server resources, network)
3. Recommend optimizations
4. Estimate performance improvement & costs
5. Provide implementation plan

---

### **6. Test Coverage Rendah** 🧪
**Symptom:** Production bug yang seharusnya ketahuan di test

**Fix:**
```bash
/tester

"Test coverage untuk Booking API masih 60%, 
tambahkan test untuk edge cases:
- Booking di tanggal yang sudah penuh
- Booking dengan pax > 22
- Booking dengan tanggal di masa lalu"
```

### **7. Bugs di Production** 🐛
**Symptom:** User report bug di production, perlu hotfix cepat

**Fix:**
```bash
/fixer

"URGENT: Production bug reported.

Issue: User tidak bisa cancel booking yang sudah DP_PAID
Error: 500 Internal Server Error
Endpoint: POST /api/backoffice/bookings/:id/cancel

Expected: Booking bisa di-cancel dengan refund policy
Actual: Server error, booking tidak ter-cancel

Reproduce:
1. Login as admin
2. Open booking detail (status: DP_PAID)
3. Click Cancel button
4. Error 500 muncul

Logs: [paste error logs dari production]"
```

**Fixer Agent akan:**
1. Analyze production logs
2. Reproduce locally
3. Fix bug dengan minimal changes (hotfix approach)
4. Update dokumen spesifikasi terkait fitur yang difixing sesuai dengan scope fixing yang diberikan oleh user
4. Run regression tests
5. Create fixing log dengan deployment notes

**👤 Human:**
- [ ] Test fix di staging
- [ ] Approve deployment ke production
- [ ] Monitor production logs setelah deploy
- [ ] Notify users bug sudah fixed

---

## 🎯 Success Metrics

**Project dianggap berhasil jika:**
- ✅ Semua spesifikasi di-review & approve manusia
- ✅ Test coverage > 80%
- ✅ Zero critical bugs di production
- ✅ Development logs lengkap (easy onboarding developer baru)
- ✅ Documentation up-to-date
- ✅ Infrastructure well-planned & cost-optimized ⭐ NEW
- ✅ Production deployment smooth dengan monitoring active ⭐ NEW
- ✅ Performance meets SLA (response time, uptime) ⭐ NEW

**AI Agent membantu achieve ini dengan:**
- 🤖 Konsistensi code quality (follow standards)
- 🤖 Dokumentasi otomatis (never outdated)
- 🤖 Fast iteration (spec → code → test dalam 1 hari)
- 🤖 Infrastructure planning data-driven (SysArch Agent) ⭐ NEW
- 🤖 Cost optimization recommendations ⭐ NEW
- 🤖 Performance monitoring & alerting setup ⭐ NEW

**Tapi final quality tetap tanggung jawab Human!** 👤



---

## 📝 Aturan Main (Rules of Engagement)

### **For AI Agents** 🤖
1. **Always Read Context First:**
   - Baca `project_overview.md` sebelum mulai task
   - Baca specification terkait sebelum coding
   - Baca logs terakhir untuk tahu progres

2. **Never Assume:**
   - Jika spec tidak jelas → ASK human clarification
   - Jika ada breaking change → WARN human terlebih dahulu
   - Jika perlu run destructive command → CONFIRM dulu

3. **Document Everything:**
   - Setiap code change harus ada di development log
   - Setiap test run harus ada di testing log
   - Setiap bug fix harus ada di fixing log

### **For Humans** 👤
1. **Don't Edit Logs Manually:**
   - Biarkan Agent yang menulis `logs/development/*.md` dan `logs/testing/*.md`
   - Format konsisten, easy to parse untuk Agent

2. **Always Review Before Approve:**
   - Specifications (apakah sesuai bisnis requirement?)
   - Code (apakah logic benar & secure?)
   - Tests (apakah coverage cukup?)

3. **Read Logs After Break:**
   ```bash
   # Jika baru buka VS Code setelah istirahat
   /developer
   
   "Baca semua logs/development/dev_*.md, 
   summarize progres terakhir dan apa yang pending"
   ```

4. **Terminal Safety:**
   - **⚠️ NEVER** auto-approve terminal commands tanpa review
   - Especially: `rm`, `DROP`, `DELETE`, deployment commands
   - Use Git (easy rollback jika ada masalah)

5. **UI/UX Consistency:**
   - Jika hasil UI jelek/tidak konsisten:
     ```bash
     /analyst
     
     "Update UI/UX Guidelines di project_overview.md.
     Warna button inconsistent, seharusnya pakai Ocean Teal (#0E7490)
     untuk primary button, Sunset Coral (#F97316) untuk CTA"
     ```

6. **Infrastructure Planning:** ⭐ NEW
   - Before production deployment, always consult SysArch Agent
   - Provide accurate data (realistic estimates, not best-case scenario)
   - Consider growth: plan for 6-12 months, not just current needs
   - Budget for monitoring & backups (non-negotiable)
   ```bash
   /sysarch
   
   "Analyze app and design production infrastructure.
   Be conservative with estimates, include 50% growth buffer.
   Budget: $200/month (strict), prioritize reliability over features."
   ```

---

## ⚙️ Customizing Agent Behavior

Jika ingin mengubah cara kerja Agent (misal: Developer pakai TDD strict, atau Analyst harus bikin ERD diagram), edit file di `.github/prompts/`:

### **File Structure:**
```
.github/prompts/
├── initiator.prompt.md      # Aturan buat project_overview.md
├── analyst.prompt.md        # Aturan buat specifications
├── developer.prompt.md      # Coding standards & logging format
├── fixer.prompt.md          # Bug fixing strategy & debugging approach
├── tester.prompt.md         # Testing strategy & coverage requirements
├── sysarch.prompt.md        # Infrastructure planning & deployment ⭐ NEW
└── document.prompt.md       # Documentation format
```

### **Example Modification:**

**File:** `.github/prompts/developer.prompt.md`

**Before:**
```markdown
**CODING STYLE:** Follow Next.js App Router best practices
```

**After:**
```markdown
**CODING STYLE:** 
- Follow Next.js App Router best practices
- MUST use Test-Driven Development (TDD)
- Write test first before implementation
- Minimum test coverage: 90%
```

**Effect:** Developer Agent akan selalu bikin test dulu sebelum coding

---

**File:** `.github/prompts/fixer.prompt.md`

**Customize:**
```markdown
**BUG FIXING PRIORITY:**
1. Security vulnerabilities (CRITICAL - fix within 2 hours)
2. Data loss bugs (HIGH - fix within 4 hours)
3. Payment/financial bugs (HIGH - fix within 4 hours)
4. UI/UX bugs (MEDIUM - fix within 24 hours)
5. Performance issues (LOW - fix within 1 week)

**DEBUGGING APPROACH:**
- Always reproduce bug locally first
- Use git bisect to find regression commit
- Write test case that fails before fix
- Verify test passes after fix
- Check for similar bugs in codebase
```

**Effect:** Fixer Agent akan prioritize bugs berdasarkan severity

---

**File:** `.github/prompts/sysarch.prompt.md` ⭐ NEW

**Customize:**
```markdown
**INFRASTRUCTURE PREFERENCES:**
- Default cloud provider: DigitalOcean (cost-effective for startups)
- Minimum server specs: 2 vCPU, 4GB RAM (never go below this)
- Database: Always use managed database (Supabase/AWS RDS)
- Backups: Daily automated backups, 30 days retention (non-negotiable)
- Monitoring: Free tier tools only (UptimeRobot, Sentry, Papertrail)
- CDN: Optional for MVP, required when traffic > 10k users/month

**COST OPTIMIZATION PRIORITIES:**
1. Data integrity & backups (non-negotiable)
2. Acceptable performance (2-3s page load OK for MVP)
3. 99% uptime (99.9% nice to have)
4. CDN (add later when needed)

**SCALING TRIGGERS:**
- CPU > 70% for 24 hours → Vertical scaling
- RAM > 80% for 24 hours → Vertical scaling
- Response time > 3s → Add caching layer
- Traffic > 1000 concurrent users → Horizontal scaling
```

**Effect:** SysArch Agent akan always recommend cost-effective solutions untuk startup

---

## 🚨 Troubleshooting

### **Problem: Agent Lupa Context**
**Symptom:** Agent buat code yang tidak sesuai dengan project

**Solution:**
```bash
/developer

"STOP. Baca ulang:
1. project_overview.md (tech stack & UI guidelines)
2. specifications/004_spec_pricing.md (requirement)
3. logs/development/dev_003_*.md (code yang sudah ada)

Lalu implementasi ulang dengan benar"
```

---

### **Problem: Specification Terlalu Umum**
**Symptom:** Developer Agent tanya-tanya terus karena spec tidak detail

**Solution:**
```bash
/analyst

"SPEC-005 terlalu general. Breakdown menjadi atomic specifications:
- 005-001: Revenue Summary Card
- 005-002: Profit Trend Chart
- 005-003: Upcoming Trips Timeline

Setiap spec harus punya:
- User story jelas
- API contract lengkap
- UI mockup dengan Tailwind classes"
```

---

### **Problem: Task Status Out of Sync** ⭐ NEW
**Symptom:** task_list.md status tidak sesuai dengan development logs atau test results

**Solution:**
```bash
/pm

"Update task_list.md berdasarkan logs di logs/development/ dan logs/testing/.
Check semua task status dan pastikan sinkron dengan actual progress"
```

**PM Agent akan:**
1. Read all logs di logs/development/ dan logs/testing/
2. Identify completed tasks
3. Update task status accordingly
4. Update "Last Updated" timestamps
5. Generate summary of changes

**Manual Fix (if needed):**
- Edit `task/task_list.md` langsung
- Update status field: `not_started`, `dev`, `ready_to_test`, `testing_ready`, `testing`, `passed`, `failed`
- Update "Last Updated" timestamp: `[YYYY-MM-DD HH:MM]`
- Update "Assigned To" field if task handed off

---

### **Problem: Too Many Tasks, Tidak Tahu Prioritas** ⭐ NEW
**Symptom:** Bingung mau kerjakan task mana dulu

**Solution:**
```bash
/pm

"Tampilkan semua task dengan status 'not_started', 
sort by priority (P0 → P1 → P2 → P3), 
dan cek dependencies"
```

**PM Agent akan:**
1. List all not_started tasks
2. Sort by priority level
3. Show dependencies for each task
4. Recommend next task to work on (no blockers, highest priority)

**👤 Human Decision:**
- Focus on P0 (Critical) tasks first
- Check dependencies (don't start task if dependency not done)
- Consider business impact vs technical complexity

---

### **Problem: Agent Lupa Context**
**Symptom:** Agent buat code yang tidak sesuai dengan project

**Solution:**
```bash
/developer

"STOP. Baca ulang:
1. project_overview.md (tech stack & UI guidelines)
2. specifications/004_spec_pricing.md (requirement)
3. logs/development/dev_003_*.md (code yang sudah ada)

Lalu implementasi ulang dengan benar"
```

---

### **Problem: Specification Terlalu Umum**
**Symptom:** Developer Agent tanya-tanya terus karena spec tidak detail

**Solution:**
```bash
/analyst

"SPEC-005 terlalu general. Breakdown menjadi atomic specifications:
- 005-001: Revenue Summary Card
- 005-002: Profit Trend Chart
- 005-003: Upcoming Trips Timeline

Setiap spec harus punya:
- User story jelas
- API contract lengkap
- UI mockup dengan Tailwind classes"
```

---

### **Problem: Task Status Out of Sync** ⭐ NEW
**Symptom:** task_list.md status tidak sesuai dengan development logs atau test results

**Solution:**
```bash
/pm

"Update task_list.md berdasarkan logs di logs/development/ dan logs/testing/.
Check semua task status dan pastikan sinkron dengan actual progress"
```

**PM Agent akan:**
1. Read all logs di logs/development/ dan logs/testing/
2. Identify completed tasks
3. Update task status accordingly
4. Update "Last Updated" timestamps
5. Generate summary of changes

**Manual Fix (if needed):**
- Edit `task/task_list.md` langsung
- Update status field: `not_started`, `dev`, `ready_to_test`, `testing_ready`, `testing`, `passed`, `failed`
- Update "Last Updated" timestamp: `[YYYY-MM-DD HH:MM]`
- Update "Assigned To" field if task handed off

---

### **Problem: Too Many Tasks, Tidak Tahu Prioritas** ⭐ NEW
**Symptom:** Bingung mau kerjakan task mana dulu

**Solution:**
```bash
/pm

"Tampilkan semua task dengan status 'not_started', 
sort by priority (P0 → P1 → P2 → P3), 
dan cek dependencies"
```

**PM Agent akan:**
1. List all not_started tasks
2. Sort by priority level
3. Show dependencies for each task
4. Recommend next task to work on (no blockers, highest priority)

**👤 Human Decision:**
- Focus on P0 (Critical) tasks first
- Check dependencies (don't start task if dependency not done)
- Consider business impact vs technical complexity

---

### **Problem: Agent Lupa Context**
**Symptom:** Agent buat code yang tidak sesuai dengan project

**Solution:**
```bash
/developer

"STOP. Baca ulang:
1. project_overview.md (tech stack & UI guidelines)
2. specifications/004_spec_pricing.md (requirement)
3. logs/development/dev_003_*.md (code yang sudah ada)

Lalu implementasi ulang dengan benar"
```

---

### **Problem: Specification Terlalu Umum**
**Symptom:** Developer Agent tanya-tanya terus karena spec tidak detail

**Solution:**
```bash
/analyst

"SPEC-005 terlalu general. Breakdown menjadi atomic specifications:
- 005-001: Revenue Summary Card
- 005-002: Profit Trend Chart
- 005-003: Upcoming Trips Timeline

Setiap spec harus punya:
- User story jelas
- API contract lengkap
- UI mockup dengan Tailwind classes"
```

---

### **Problem: Task Status Out of Sync** ⭐ NEW
**Symptom:** task_list.md status tidak sesuai dengan development logs atau test results

**Solution:**
```bash
/pm

"Update task_list.md berdasarkan logs di logs/development/ dan logs/testing/.
Check semua task status dan pastikan sinkron dengan actual progress"
```

**PM Agent akan:**
1. Read all logs di logs/development/ dan logs/testing/
2. Identify completed tasks
3. Update task status accordingly
4. Update "Last Updated" timestamps
5. Generate summary of changes

**Manual Fix (if needed):**
- Edit `task/task_list.md` langsung
- Update status field: `not_started`, `dev`, `ready_to_test`, `testing_ready`, `testing`, `passed`, `failed`
- Update "Last Updated" timestamp: `[YYYY-MM-DD HH:MM]`
- Update "Assigned To" field if task handed off

---

### **Problem: Too Many Tasks, Tidak Tahu Prioritas** ⭐ NEW
**Symptom:** Bingung mau kerjakan task mana dulu

**Solution:**
```bash
/pm

"Tampilkan semua task dengan status 'not_started', 
sort by priority (P0 → P1 → P2 → P3), 
dan cek dependencies"
```

**PM Agent akan:**
1. List all not_started tasks
2. Sort by priority level
3. Show dependencies for each task
4. Recommend next task to work on (no blockers, highest priority)

**👤 Human Decision:**
- Focus on P0 (Critical) tasks first
- Check dependencies (don't start task if dependency not done)
- Consider business impact vs technical complexity

---

## 🎓 Learning Resources

**Untuk memahami lebih dalam cara kerja AI Agent:**

1. **Function Calling / Tool Use:**
   - [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
   - [Anthropic Claude Tool Use](https://docs.anthropic.com/claude/docs/tool-use)

2. **Prompt Engineering:**
   - [Prompt Engineering Guide](https://www.promptingguide.ai/)
   - [Anthropic Prompt Library](https://docs.anthropic.com/claude/prompt-library)

3. **Agent Frameworks:**
   - [LangChain Agents](https://python.langchain.com/docs/modules/agents/)
   - [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)

**Best Practice untuk System Instructions:**
- Be specific (jangan ambiguous)
- Give examples (few-shot learning)
- Set constraints (what NOT to do)
- Define success criteria (how to verify output)

---

## 📊 Project Progress Tracking

**Recommended Tools:**
- **Linear / Jira:** Task management (link ke SPEC-xxx)
- **GitHub Projects:** Kanban board per sprint
- **Notion:** Knowledge base (meeting notes, decisions)

**Integration dengan AI Workflow:**
```
GitHub Issue #45: Implement Pricing Module
  ↓
Analyst creates: SPEC-004
  ↓
Developer implements: codes/app/api/pricing/
  ↓
Tester creates: tests/integration/pricing.test.ts
  ↓
Close issue with link to dev log & test results
```

---

## 🤝 Team Collaboration

**Jika tim > 1 person:**

### **Developer Onboarding:**
```bash
# New developer joins team
/developer

"Summarize project_overview.md dan semua specifications 
dalam bentuk onboarding guide untuk new developer.

Include:
- Tech stack & why we choose it
- Folder structure explanation
- How to run project locally
- Common commands
- Where to find documentation"
```

### **Code Review Process:**
1. Developer A → Bikin feature dengan Developer Agent
2. Developer A → Create PR di GitHub
3. Developer B → Review PR (manual)
4. If OK → Merge
5. If NOT → Developer A ask Developer Agent to fix

### **Knowledge Sharing:**
- **Weekly:** Tester Agent generate test coverage report
- **Monthly:** Document Agent generate changelog dari semua dev logs
- **Quarterly:** 
  - Analyst Agent review & update project_overview.md
  - SysArch Agent review infrastructure costs & optimization opportunities ⭐ NEW

---

*Happy Vibe Coding!* 🚀✨

**Remember:** 
- AI Agent = **Accelerator** (makes you 10x faster)
- Human = **Navigator** (makes sure direction is correct)
- SysArch Agent = **Infrastructure Guardian** (keeps costs low, performance high) ⭐ NEW

**Together = Unstoppable** 💪🤖👤
