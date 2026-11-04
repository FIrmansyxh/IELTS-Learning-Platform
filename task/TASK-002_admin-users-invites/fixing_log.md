# FIXING LOG - TASK-002 admin-users-invites
**Target Spec:** SPEC-002
**Date:** 2026-11-03 19:05

## Fix Entry - 2026-11-03 19:05

### 1. Issue Description
D-005 (lihat task/e2e_report.md).

### 2. Root Cause Analysis
Probe kesehatan hanya memeriksa OLLAMA_BASE_URL/STT_BASE_URL; driver mock (in-process) tidak punya URL sehingga dilaporkan "down".

### 3. Fix Implementation
File: src/server/admin/health.ts. LLM_DRIVER=mock dan STT_DRIVER=mock (saat AI aktif) dilaporkan status up tanpa probe jaringan.

### 4. Verification
Tes integrasi admin.itest.ts: kasus baru "driver mock dilaporkan up"; kasus lama kini mengeset driver ollama/whisper eksplisit.
