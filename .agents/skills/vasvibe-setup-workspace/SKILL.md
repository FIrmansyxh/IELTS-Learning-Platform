---
name: vasvibe-setup-workspace
description: Run the VasVibe setup workspace workflow with its approval gates.
---

Jalankan **Toolsmith** (Agentic Workspace Provisioner) untuk: **$ARGUMENTS**

Tujuan: menyiapkan perkakas si AI agent (skills + MCP) agar bekerja optimal — **bukan** infra produk (itu DevOps).

Langkah:
1. **Deteksi mode** dari argumen (`init` default jika `state/workspace-manifest.json` belum ada; `switch` saat pindah tool; `sync` untuk perbaiki drift).
2. **Deteksi tool aktif** dari penanda (`.codex/`/`AGENTS.md`, `.claude/`, `.opencode/`, `.agents/`, `.github/prompts/`/`.vscode/`). Ambigu → tanya human.
3. **Mode `init`:** tentukan kebutuhan (hybrid: `schemas/workspace-registry.json` `stackMappings` dari tech stack di `project_overview.md`/`requirements.md` + baseline + augmentasi `find-skills`) → tulis `state/workspace-manifest.json` → **tunjukkan ringkasan, minta approve human**.
4. **Mode `switch`/`sync`:** baca manifest yang ada (jangan hitung ulang), apply ke tool target.
5. **Apply declarative:** tulis MCP ke file config tool (`.codex/config.toml` / `.mcp.json` / `opencode.json` / `.vscode/mcp.json` / `.agents/mcp.json`) sesuai `platformTargets`; install skills ke `skillsDir` via `npx skills add`. **Merge, jangan timpa. Secrets → placeholder `${VAR}`.**
6. **Update `appliedTo[tool]`** = timestamp; laporkan langkah manual tersisa.

**Aturan:**
- Definisi kanonik agen: `agent/workflows/toolsmith.md`. Registry: `schemas/workspace-registry.json`.
- **JANGAN hardcode kredensial** — gunakan placeholder env var dan instruksikan human mengisi `.env`.
- Perubahan daftar skill/MCP dicatat di manifest `revisionHistory` (No Silent Changes).
- Bisa dipanggil kapan saja — termasuk di tengah fase saat developer pindah tool AI.

For delegation, invoke the configured Codex custom subagent named vasvibe_<persona> (for example, PM → vasvibe_pm). Keep interactive discovery and every human approval gate in the main conversation.
