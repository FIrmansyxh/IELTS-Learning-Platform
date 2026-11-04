# TEST REPORT - TASK-010 (E2E Playwright)
**Date:** 2026-11-03 18:35
**Agent:** Test Agent (Fase 3, /test-feature)
**Result:** Fail (3 lulus, 1 gagal pada tes terkait; DB ielts_e2e, AI mock, Chromium)
**Berkas tes:** codes/tests/e2e/spec010-011-reading-listening.spec.ts

## Ringkasan
Sorot teks (localStorage hl:v1), 6 soal 2 teks, hasil. Gagal: mobile 375 scroll horizontal pada ruang baca (D-003). Tanda soal diuji pada mode Ujian (Boss Reading).

## Defek
- D-003: Ruang Baca/Drill Reading pada 375px menimbulkan scroll horizontal (scrollWidth 448) [Major] (lihat task/e2e_report.md)

## Tidak terverifikasi / di luar cakupan E2E ini
Pemisah panel diseret (splitter), batas 200 sorotan, sorotan lintas paragraf.

## Perintah
`cd codes && . tests/e2e/e2e.env.sh && E2E_SKIP_WEBSERVER=1 npx playwright test spec010-011-reading-listening.spec.ts` (server `npm run dev` + worker `npm run worker:dev` dengan env mock, lihat task/e2e_report.md).
