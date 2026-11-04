# FIXING LOG - TASK-010 split-screen-reading
**Target Spec:** SPEC-010
**Date:** 2026-11-03 19:05

## Fix Entry - 2026-11-03 19:05

### 1. Issue Description
D-003 (lihat task/e2e_report.md).

### 2. Root Cause Analysis
Root pemutar dan <header> berupa grid satu kolom implisit (auto): min-content anak (deret tab Pelajari/Latihan/Terapkan dengan whitespace-nowrap, judul, dll.) melebarkan kolom menjadi 432px pada viewport 375px sehingga scrollWidth 448. Bukan ReadingWorkspace itu sendiri.

### 3. Fix Implementation
File: src/components/player/sub-module-player.tsx. Root dan header memakai grid-cols-[minmax(0,1fr)] sehingga kolom dibatasi lebar induk (min-w-0).

### 4. Verification
Probe Playwright 375x812 (tab Soal dan Teks): scrollWidth 375 = viewport; E2E spec010-011 mobile (expectNoHorizontalScroll) lulus.
