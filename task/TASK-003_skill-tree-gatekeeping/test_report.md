# TEST REPORT - TASK-003 (E2E Playwright)
**Date:** 2026-11-03 18:35
**Agent:** Test Agent (Fase 3, /test-feature)
**Result:** Fail (5 lulus, 1 gagal pada tes terkait; DB ielts_e2e, AI mock, Chromium)
**Berkas tes:** codes/tests/e2e/spec003-tree.spec.ts, codes/tests/e2e/spec-a11y-mobile.spec.ts

## Ringkasan
Peta, popover alasan terkunci, urutan rantai, LOCKED_CONTENT, mobile 375 tanpa scroll horizontal. Gagal: scroll horizontal desktop 1280 (D-001).

## Defek
- D-001: Scroll horizontal pada layout terautentikasi desktop >= 1024px (main w-full + lg:ml-64) [Major] (lihat task/e2e_report.md)
- D-004: Kontras warna (axe color-contrast serious) pada teks muted di /, /peta, /profil, /admin/konten/kurikulum [Minor] (lihat task/e2e_report.md)

## Tidak terverifikasi / di luar cakupan E2E ini
Override admin (adminOverride) via UI.

## Perintah
`cd codes && . tests/e2e/e2e.env.sh && E2E_SKIP_WEBSERVER=1 npx playwright test spec003-tree.spec.ts` (server `npm run dev` + worker `npm run worker:dev` dengan env mock, lihat task/e2e_report.md).
