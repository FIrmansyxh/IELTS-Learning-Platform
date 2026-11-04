# TEST REPORT - TASK-020 (E2E Playwright)
**Date:** 2026-11-03 18:35
**Agent:** Test Agent (Fase 3, /test-feature)
**Result:** Pass (4 lulus, 0 gagal pada tes terkait; DB ielts_e2e, AI mock, Chromium)
**Berkas tes:** codes/tests/e2e/spec020-curation.spec.ts

## Ringkasan
Admin sunting prompt soal drill terpublikasi -> Learner melihat prompt baru; set dengan attempt berjalan terkunci; ubah status; pohon kurikulum (desktop+mobile Sheet tanpa scroll horizontal).

## Defek
Tidak ada defek baru untuk task ini.

## Tidak terverifikasi / di luar cakupan E2E ini
Konfirmasi reviu AI pada set AI_GENERATED_REVIEWED yang perlu dipublikasi dari DRAFT (checkbox hanya tampil kondisional; tidak ditegakkan), revisi/rollback revisi.

## Perintah
`cd codes && . tests/e2e/e2e.env.sh && E2E_SKIP_WEBSERVER=1 npx playwright test spec020-curation.spec.ts` (server `npm run dev` + worker `npm run worker:dev` dengan env mock, lihat task/e2e_report.md).
