# FIXING LOG - TASK-004 content-foundation
**Target Spec:** SPEC-004
**Date:** 2026-11-03 19:05

## Fix Entry - 2026-11-03 19:05

### 1. Issue Description
O-1 (lihat task/e2e_report.md).

### 2. Root Cause Analysis
CLI import menerapkan UPDATE pada entitas PUBLISHED (status dipertahankan) sehingga isi Boss Tier 1 berubah tanpa reviu.

### 3. Fix Implementation
File: src/server/content/import-service.ts; scripts/content-import.ts. guardPublishedOverwrite: UPDATE pada entitas PUBLISHED ditolak (exit 1, published_overwrite_blocked; juga --dry-run) kecuali flag --allow-published-overwrite; UPDATE pada set dengan attempt hidup selalu ditolak (hasActiveAttempts). ADR-003 #39, spec 004 diamandemen.

### 4. Verification
content.itest.ts: kasus UPDATE PUBLISHED memeriksa penolakan tanpa flag (data tidak berubah, dry-run juga ditolak) dan sukses dengan flag.
