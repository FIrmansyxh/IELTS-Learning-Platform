# VasVibe repository instructions

VasVibe is an AI-assisted software delivery workflow and the `create-vasvibe` npm scaffolder.

## Source of truth

- Canonical agent instructions: `agent/workflows/*.md`.
- Shared workflow rules: `agent/workflows/_shared/`.
- Platform-specific copies are generated from canonical files. After changing a workflow, run `bash scripts/sync-agents.sh`, then `node scripts/sync-codex.mjs` and `npm run sync-template` in `packages/create-vasvibe/`.
- `packages/create-vasvibe/template/` is the published scaffold input. Preserve intentional user changes there when synchronizing.

## Project workflow

- Follow the four gated phases and stop for human approval at each documented gate.
- Read `state/context.json` and relevant knowledge-base/specification files before implementation when they exist.
- Respect `WORK_DEPTH` from `project_overview.md`; default to `standard`.
- Record requested changes in the relevant source-of-truth documents before implementation.
- Do not commit or push unless the user asks.

## Codex integration

- Use `$vasvibe-<command>` skills for explicit workflow commands, for example `$vasvibe-plan-project` or `$vasvibe-build-feature`.
- Use the configured Codex subagents in `.codex/agents/` for the named VasVibe personas. Each loads its canonical instructions from `agent/workflows/`.
- Skills and subagents are complementary: skills expose repeatable commands; custom agents expose persona-specific delegation.
- When running a pipeline, orchestrate subagents by their configured Codex names. Keep interactive discovery and human gates in the main conversation.
