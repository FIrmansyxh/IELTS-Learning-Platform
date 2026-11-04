# FIXING LOG - TASK-005 multimodal-player
**Target Spec:** SPEC-005
**Date:** 2026-11-03 19:05

## Fix Entry - 2026-11-03 19:05

### 1. Issue Description
D-001, D-002 (+ aria-controls subtab) (lihat task/e2e_report.md).

### 2. Root Cause Analysis
D-002: petunjuk memakai konstanta DEFAULT_MIN_ACTIVE_SECONDS=60 padahal server sudah mengirim progress.min_active_seconds (kontrak aditif). Tambahan: subtab Artikel/Video/Slide memakai Tabs tanpa TabsContent sehingga aria-controls pemicu aktif menunjuk elemen yang tidak ada (axe aria-valid-attr-value critical, muncul pada /belajar/1.1.1 ber-video).

### 3. Fix Implementation
File: src/components/player/learn-tab.tsx; src/components/shell/app-shell.tsx; src/components/player/sub-module-player.tsx. D-002: unmetRequirements memakai progress.min_active_seconds ?? 60. Subtab: panel dibungkus <TabsContent value={active}>. D-001: lihat TASK-001. Header/root pemutar diberi grid-cols-[minmax(0,1fr)] (lihat D-003 di TASK-010).

### 4. Verification
Tes unit learn-tab.test.ts (2 kasus); E2E spec005-006 D-002 lulus; axe halaman player lulus.
