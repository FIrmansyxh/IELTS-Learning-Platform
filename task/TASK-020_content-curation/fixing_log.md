# FIXING LOG - TASK-020 content-curation
**Target Spec:** SPEC-020
**Date:** 2026-11-03 19:05

## Fix Entry - 2026-11-03 19:05

### 1. Issue Description
D-004 (lihat task/e2e_report.md).

### 2. Root Cause Analysis
Kontras text-muted-foreground pada baris set kurasi (surface-muted) < 4.5:1.

### 3. Fix Implementation
File: src/app/globals.css. --color-text-muted menjadi #556376 (lihat TASK-003).

### 4. Verification
E2E axe /admin/konten/kurikulum lulus.
