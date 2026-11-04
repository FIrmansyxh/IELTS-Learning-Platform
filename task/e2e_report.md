# E2E REPORT - Fase 3 (/test-feature), Playwright
**Tanggal:** 2026-11-03 | **Agen:** Test Agent | **Lingkungan:** Chromium sistem (153), Node 22, Postgres 16 lokal (DB terpisah `ielts_e2e`), `next dev --turbopack` + worker `tsx watch`, AI mock (`LLM_DRIVER=mock STT_DRIVER=mock AI_ENABLED=true`, latensi LLM 3 dtk), tanpa Docker/Ollama/GPU.

## Hasil (run penuh bersih terakhir, 2026-11-03 19:15-19:30, setelah perbaikan D-001..D-006, O-1, O-2)
Satu run penuh tunggal (web+worker di-restart, dunia uji di-reset `seed-world.ts --force`): **106 eksekusi (desktop 1280x800 + mobile 375x812 untuk tes `@mobile`): 105 lulus, 0 gagal, 1 dilewati, 13,4 mnt**, `retries=0`, workers=1. Yang dilewati = `spec012b-ai-down` (sengaja; hanya jalan dengan `E2E_AI_DOWN=1`). Fase AI mati terpisah (web+worker `AI_ENABLED=false`, `E2E_AI_DOWN=1`): **1/1 lulus**. Total efektif: 106 lulus, 0 gagal. Web+worker lalu dikembalikan ke `AI_ENABLED=true`. Tes baru: axe pada halaman pra-mulai dan halaman hasil Boss (di dalam tes E2E Boss penuh); axe `/admin/konten/kurikulum` sudah ada di spec-a11y-mobile (ADMIN_PAGES) dan lulus.

Riwayat run penuh pada sesi ini (jujur):
- Run penuh A (dengan tes lama): 103 lulus, 2 gagal, 1 dilewati. (1) `spec000-004` dry-run impor: **isolasi/ekspektasi tes** - sejak ADR-003 #39 CLI menolak UPDATE entitas PUBLISHED (`published_overwrite_blocked`) sehingga dry-run tanpa flag exit 1; tes diperbarui (dry-run tanpa flag harus ditolak; dengan `--allow-published-overwrite` exit 0 dan +0; Boss tetap PUBLISHED). (2) `spec005-006` "@mobile baca artikel ... Selesai Belajar" pada project desktop: tombol "Selesai Belajar" tetap nonaktif 45 dtk; **tidak dapat direproduksi** (lulus 3x ketika dijalankan sendiri/per berkas dan pada run B), artefak gagal tertimpa sebelum dianalisis; respons `learn-progress` dalam log web semuanya 200. Klasifikasi: **belum terklasifikasi (flaky tak terjelaskan)**; dugaan terkait waktu (penghitung waktu aktif sisi klien melempar ping 15 dtk, `flush` dilewati bila ping sebelumnya masih in-flight, dan subtab ARTICLE hanya tercatat lewat ping). Tes diberi diagnostik (teks `#learn-unmet`, daftar ping, baris DB) agar kejadian berikutnya bisa diklasifikasi. Tidak dicatat sebagai defek produk (D-007) karena belum ada bukti.
- Run penuh B (hasil resmi di atas, setelah tes diperbaiki): 105 lulus / 0 gagal / 1 skip.

| Spec | Berkas tes | Eksekusi lulus | Gagal |
|---|---|---|---|
| 000, 004 | spec000-004-foundation, home | 6 + 3 = 9 | 0 |
| 001 | spec001-auth | 14 | 0 |
| 002 | spec002-admin | 8 | 0 |
| 003 | spec003-tree | 6 | 0 |
| 005, 006 | spec005-006-learn-drill | 14 | 0 |
| 007, 016, 017 | spec007-016-017-progress | 6 | 0 |
| 008 | spec008-skip | 5 | 0 |
| 009 | spec009-band | 4 | 0 |
| 010, 011 | spec010-011-reading-listening | 5 | 0 |
| 012 | spec012-writing | 5 | 0 |
| 012b (AI mati, fase terpisah) | spec012b-ai-down | 1 (+1 dilewati di run utama) | 0 |
| 013 | spec013-speaking | 2 | 0 |
| 014 | spec014-boss (+axe pra-mulai & hasil) | 3 | 0 |
| 015 | spec015-placement | 3 | 0 |
| 018 | spec018-assets | 4 | 0 |
| 019 | spec019-importer | 4 | 0 |
| 020 | spec020-curation | 4 | 0 |
| lintas (mobile 375 + axe) | spec-a11y-mobile | 9 | 0 |

Verifikasi ulang defek (D-001..D-006, O-1, O-2): lulus dalam run bersih; semua status "Fixed, ready to retest" di bawah kini **Verified** (kecuali catatan flaky di atas).

## Daftar defek (Fixer)
| ID | Sev | Spec/AC | Langkah | Expected vs Actual | Bukti | Dugaan akar |
|---|---|---|---|---|---|---|
| D-001 | Major | SPEC-001 UI shell, 003 | Masuk sebagai learner, buka `/`, `/peta`, `/profil`, atau `/belajar/*` pada 1280x800 (juga 1024-1439) | Tanpa scroll horizontal; actual `scrollWidth` 1536 > 1280 (lebar +256px = sidebar), konten terpotong kanan | `spec003-tree` "D-001"; screenshot test-results | `src/components/shell/app-shell.tsx`: `<main class="w-full ... lg:ml-64">` (100% + margin 16rem). Ganti `w-full` menjadi `lg:w-auto`/`lg:pl-64` pada wrapper |
| D-002 | Minor | SPEC-005 (learn.min_active_seconds) | Set `learn.min_active_seconds=10`, buka `/belajar/1.1.1` | Petunjuk "Belajar aktif minimal 10 detik."; actual "...60 detik." | `spec005-006` D-002 | `src/components/player/learn-tab.tsx` memakai `DEFAULT_MIN_ACTIVE_SECONDS=60`; harus memakai `detail.progress.min_active_seconds` |
| D-003 | Major | SPEC-010 AC mobile | Mulai Drill Reading `1.3.1` pada 375x812 | Tanpa scroll horizontal; actual `scrollWidth` 448 (header/tab/konten selebar 432) | `spec010-011` mobile, screenshot | Konten ruang baca/pembungkus drill `h-[calc(100dvh-10rem)]` punya min-content > viewport (kolom grid tanpa `min-w-0`, atau baris pilihan/teks tanpa wrap); `src/components/reading/*` |
| D-004 | Minor (axe serious) | a11y | axe-core WCAG A/AA pada `/`, `/peta`, `/profil`, `/admin/konten/kurikulum` | Tanpa pelanggaran serius; actual `color-contrast` (dt/ teks `text-muted-foreground` pada `--color-surface-muted`, baris set kurasi) | `spec-a11y-mobile` axe | Token warna muted foreground terlalu pucat pada latar muted; naikkan kontras >= 4.5:1 |
| D-005 | Minor | SPEC-002 kesehatan | Admin buka `/admin` dengan `LLM_DRIVER=mock` + AI_ENABLED=true | Driver mock dilaporkan Aktif; actual "Penilai AI: Mati", "STT: Mati" | manual (explore) | `src/server/admin/health.ts` hanya probe `OLLAMA_BASE_URL`/`STT_BASE_URL`, tidak memperlakukan driver mock |

### Observasi (butuh triage, bukan defek terkonfirmasi)
- O-1 (SPEC-019/004): impor CLI `content-import import` Golden Sample (paket DRAFT) menimpa Boss Tier 1 yang sudah PUBLISHED (kunci alami = Tier): judul/anak section berubah di bawah status PUBLISHED tanpa reviu. Terjadi saat verifikasi; perlu dikonfirmasi apakah perilaku yang dimaksud (spec 019 "pembaruan" vs 020 reviu).
- O-2 (SPEC-017): AC E2E "kartu Indikatif setelah drill Grammar + Boss mock" tidak bisa terpenuhi setelah amandemen F-17-02 (sampel minimal 10; prediksi hanya dari L/R/W/S). Perbarui teks AC.
- O-3 (SPEC-004): Golden Sample tidak dapat dipublikasikan utuh (Boss Tier 1 butuh audio rekaman pemilik; PENDING.md). Sesuai desain; seed E2E memakai Boss sintetis.

## Status perbaikan (Fixer Agent, 2026-11-03 19:05)
| ID | Status | Perbaikan singkat |
|---|---|---|
| D-001 | Fixed, ready to retest | `app-shell.tsx`: `<main>` + `lg:w-auto`; tes unit shell + E2E spec003-tree D-001 lulus |
| D-002 | Fixed, ready to retest | `learn-tab.tsx` memakai `progress.min_active_seconds` (server sudah mengirim); unit `learn-tab.test.ts` + E2E D-002 lulus |
| D-003 | Fixed, ready to retest | Akar di `sub-module-player.tsx` (grid root/header tanpa `minmax(0,1fr)`), bukan `ReadingWorkspace`; scrollWidth 375 pada 375x812; E2E spec010-011 mobile lulus |
| D-004 | Fixed, ready to retest | `--color-text-muted` terang `#64748B` -> `#556376` (5.58:1 di surface-muted); design-system.md 2.1 diperbarui; axe 5 halaman lulus |
| D-005 | Fixed, ready to retest | `health.ts`: driver mock = up; integrasi admin.itest.ts |
| D-006 (baru) | Fixed, ready to retest | axe `aria-valid-attr-value` (critical) pada `/belajar/1.1.1` ber-video: subtab Artikel/Video/Slide tanpa `TabsContent`; kini dibungkus `TabsContent` (`learn-tab.tsx`). Terungkap setelah D-004 teratasi dan seed 1.1.1 punya video |
| O-1 | Diputuskan | CLI import menolak UPDATE entitas PUBLISHED tanpa `--allow-published-overwrite` (dan selalu menolak set dengan attempt hidup); ADR-003 #39 (perlu tinjauan human); spec 004 diamandemen; tes `content.itest.ts` |
| O-2 | Ditutup | Teks AC SPEC-017 diperbarui; tes E2E tidak perlu diubah |
Verifikasi ulang per berkas oleh Fixer; run penuh Fase 3 kemudian diulang oleh Test Agent (lihat bagian Hasil): semua lulus.

## Perintah yang dijalankan
```
# DB terpisah
su postgres -c "psql -c 'CREATE DATABASE ielts_e2e OWNER app_migrator'"   (+ GRANT/DEFAULT PRIVILEGES seperti docker/db/init)
cd codes && . tests/e2e/e2e.env.sh        # DATABASE_URL -> ielts_e2e, LLM/STT mock, MOCK_LLM_LATENCY_MS=3000
SKIP_PRE_MIGRATE_BACKUP=true npm run db:migrate && npm run db:seed && npm run admin:bootstrap
npm run dev &  ;  npm run worker:dev &      # env di atas
npx tsx tests/e2e/support/seed-world.ts     # idempoten; Golden Sample + fixture sintetis (juga dipanggil global-setup)
tests/e2e/support/restart-web.sh && tests/e2e/support/restart-worker.sh
npx tsx tests/e2e/support/seed-world.ts --force     # reset dunia uji sebelum run penuh
E2E_SKIP_WEBSERVER=1 npx playwright test --reporter=list,json        # run penuh (13,4 mnt)
restart-web.sh AI_ENABLED=false; restart-worker.sh AI_ENABLED=false
AI_ENABLED=false E2E_AI_DOWN=1 E2E_SKIP_WEBSERVER=1 npx playwright test spec012b-ai-down   # lalu restart-web.sh/restart-worker.sh tanpa argumen (AI_ENABLED=true)
```
Berkas baru: `codes/tests/e2e/*.spec.ts`, `tests/e2e/support/{db,app,fixtures,quiz,seed-world}.ts`, `restart-worker.sh`, `restart-web.sh`, `e2e.env.sh`; `playwright.config.ts` (executablePath Chromium sistem bila ada, fake media, workers=1, project mobile hanya tes `@mobile`), `global-setup.ts`. Kode produk tidak diubah. axe memakai `axe-core` transitif di node_modules (bukan dependency langsung; @axe-core/playwright tidak dipasang).

## Tidak dapat dijalankan / tidak terverifikasi
- Docker, Compose, Caddy, backup, CI, build produksi (`next build`), perilaku produksi (cookie Secure/HTTPS).
- Audio rekaman nyata (hanya nada sintetis 10 dtk), model AI nyata (LLM Ollama / STT whisper), kualitas penilaian; hanya mock deterministik.
- Safari/Firefox/WebKit iOS; MediaRecorder hanya Chromium fake device.
- Pemutaran video YouTube nyata (tanpa jaringan), drag-and-drop pointer nyata (dipakai kontrol alternatif dropdown/tombol Naik), jam dipercepat (server memakai jam nyata).
- Skip Test Tier, timer/expiry attempt dan section, cooldown Boss, retensi rekaman 90 hari, hapus rekaman, anonimisasi akun 30 hari, batas absolut sesi 12 jam/30 hari, label "Indikatif" prediksi (lihat O-2), speed streak & streak harian lintas hari, rollback impor ditolak, impor CSV/PUBLISHED, upload audio/dokumen, tinjauan manusia konten.
- Pemakaian bersamaan (race) dan beban.
- Penyebab kegagalan sesaat "Selesai Belajar tetap nonaktif" pada run penuh A tidak diketahui (tak dapat direproduksi); pantau pada run berikutnya (diagnostik sudah ditambahkan di tes).
- `retries=0` secara lokal: stabilitas jangka panjang hanya diamati dari 2 run penuh.
