# FIXING LOG - TASK-001 auth-session
**Target Spec:** SPEC-001
**Date:** 2026-11-03 19:05

## Fix Entry - 2026-11-03 19:05

### 1. Issue Description
D-001 (lihat task/e2e_report.md).

### 2. Root Cause Analysis
<main> memakai w-full + lg:ml-64 (100% + margin 16rem) sehingga lebar halaman terautentikasi melebihi viewport 256px.

### 3. Fix Implementation
File: src/components/shell/app-shell.tsx. Tambah lg:w-auto pada <main> (blok mengisi sisa lebar setelah margin sidebar); mobile tidak berubah (w-full tetap tanpa margin kiri).

### 4. Verification
Tes unit shell.test.tsx (kelas lg:w-auto + lg:ml-64); E2E spec003-tree "D-001" lulus (desktop 1280x800); spec-a11y-mobile (mobile + desktop) lulus.
