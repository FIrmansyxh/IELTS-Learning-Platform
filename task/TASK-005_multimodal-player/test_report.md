# TEST REPORT - TASK-005 (E2E Playwright)
**Date:** 2026-11-03 18:35
**Agent:** Test Agent (Fase 3, /test-feature)
**Result:** Fail (4 lulus, 1 gagal pada tes terkait; DB ielts_e2e, AI mock, Chromium)
**Berkas tes:** codes/tests/e2e/spec005-006-learn-drill.spec.ts

## Ringkasan
Artikel/Video/Slide, waktu aktif+subtab, Selesai Belajar, Terapkan SELF_CHECK, kunci rubrik tidak bocor. Gagal: petunjuk 60 detik hardcode (D-002).

## Defek
- D-001: Scroll horizontal pada layout terautentikasi desktop >= 1024px (main w-full + lg:ml-64) [Major] (lihat task/e2e_report.md)
- D-002: Petunjuk "Belajar aktif minimal 60 detik" hardcode, mengabaikan learn.min_active_seconds [Minor] (lihat task/e2e_report.md)

## Tidak terverifikasi / di luar cakupan E2E ini
Pemutaran video YouTube nyata, lampiran DOCX, jam dipercepat (server memakai jam nyata; dipakai pengaturan 10 dtk).

## Perintah
`cd codes && . tests/e2e/e2e.env.sh && E2E_SKIP_WEBSERVER=1 npx playwright test spec005-006-learn-drill.spec.ts` (server `npm run dev` + worker `npm run worker:dev` dengan env mock, lihat task/e2e_report.md).
