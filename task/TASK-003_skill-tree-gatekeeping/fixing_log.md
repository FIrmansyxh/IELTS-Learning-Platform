# FIXING LOG - TASK-003 skill-tree-gatekeeping
**Target Spec:** SPEC-003
**Date:** 2026-11-03 19:05

## Fix Entry - 2026-11-03 19:05

### 1. Issue Description
D-001, D-004 (lihat task/e2e_report.md).

### 2. Root Cause Analysis
D-001 lihat TASK-001. D-004: --color-text-muted #64748B pada --color-surface-muted #F1F5F9 hanya 4.34:1 (< 4.5:1 AA).

### 3. Fix Implementation
File: src/components/shell/app-shell.tsx; src/app/globals.css; design-system.md. D-001: lg:w-auto. D-004: --color-text-muted terang menjadi #556376 (5.58:1 di surface-muted, 6.12:1 di putih, 4.96:1 di border-tone #E2E8F0); gelap #94A3B8 tidak berubah (6.34:1 di #172033). design-system.md 2.1 diperbarui.

### 4. Verification
E2E spec003-tree D-001 dan axe spec-a11y-mobile (/, /peta, /profil, /admin/konten/kurikulum, /belajar/1.1.1) lulus.
