# Dev Log TASK-005: Pemutar Materi Multimodal

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W2)

Spec: `specifications/005_spec_multimodal_player.md` (bagian UI/UX + klien API). Sisi server milik Backend.

### Yang dibangun
- **Kontrak (baru, hanya ditambah)**: `src/contracts/player.ts` (skema respons `GET /sub-modules/{kode}`, `learn-progress`, `learn-complete`, `mini-task/complete`; klien longgar terhadap kunci tambahan). **Catatan untuk Backend**: berkas dibuat Frontend karena belum ada saat mulai; Backend boleh menambah skema request/server di berkas yang sama, jangan menimpa.
- **Klien API**: `src/lib/api/player.ts`; `apiFetch` mendapat opsi `keepalive` (aditif) untuk pengiriman saat `pagehide`.
- **Rute**: `src/app/(app)/belajar/[sub_module_code]/page.tsx` (query `tab`, `sub`, `t`, `q`, `attempt` divalidasi di `components/player/query.ts`; nilai di luar enum/rentang diabaikan).
- **Komponen** (`src/components/player/`): `sub-module-player.tsx` (header, Progress, tab Pelajari/Latihan/Terapkan dengan centang + teks "(selesai)", navigasi Sebelumnya/Selanjutnya, state loading/403 terkunci/404/galat), `learn-tab.tsx`, `markdown-article.tsx`, `callout.tsx`, `video-card.tsx` + `youtube.ts`, `slides-carousel.tsx`, `apply-tab.tsx` (+ slot `MiniTaskAi` "Segera hadir"), `drill-tab.tsx`.
- **Hook**: `src/hooks/use-active-learn-timer.ts` (detik aktif hanya saat tab terlihat DAN ada interaksi <= 60 dtk atau video PLAYING; kirim tiap 15 dtk, saat pindah sub-tab, dan `pagehide`/hidden dengan keepalive; gagal = diam dan dikembalikan ke penampung, tanpa Toast).
- **Render aman**: `react-markdown` + `remark-gfm` + `remark-directive`, TANPA `rehype-raw`; `urlTransform`/`a` hanya https/http/mailto/anchor/relatif (selain itu tanpa `href`); gambar Markdown dibuang; tautan eksternal `target=_blank rel="noopener noreferrer"`; heading h1->h2 dengan id slug unik (plugin remark murni, ToC sticky di desktop cocok); tabel dalam wadah scroll terkurung fokusable; callout `:::tips-examiner` / `:::kesalahan-umum` -> `Callout` berlabel teks; `:nama` biasa pada teks dikembalikan menjadi teks.
- **Video**: IFrame API dimuat dari `https://www.youtube.com/iframe_api`, player memakai `host=https://www.youtube-nocookie.com`, `playerVars {start,end,rel:0,playsinline:1,origin}`; `video_id` wajib lolos `^[A-Za-z0-9_-]{11}$` (korup = tidak membuat player, pesan "Video tidak dapat dimuat"); `end_sec <= start_sec` diabaikan (warn); `t` di luar `[start,end]` kembali ke `start_sec`; label "Bagian mm:ss–mm:ss"; galat/timeout 15 dtk = pesan + "Buka di YouTube" + "Coba lagi"; `title` iframe diset; ruang 16:9 dicadangkan.
- **Slide**: Embla, `role=region aria-roledescription=carousel`, Prev/Next 44px, indikator "n/total", panah keyboard, prefetch slide berikutnya, `alt` dari data.

### Keputusan dan asumsi
1. `learn.min_active_seconds` tidak ada di payload; petunjuk memakai konstanta 60 (`DEFAULT_MIN_ACTIVE_SECONDS`) sampai server menjawab 409 dengan `details[].message` (dipakai apa adanya). Bila pengaturan admin berbeda dari 60, petunjuk awal bisa selisih; usulan: tambahkan `min_active_seconds` ke `progress` (perubahan kontrak ke Backend).
2. "Selesai Belajar" memakai `aria-disabled` (tetap fokusable) + daftar syarat yang belum terpenuhi di bawah tombol, bukan Tooltip pada tombol disabled.
3. URL disinkronkan dengan `history.replaceState` (tanpa navigasi Next) agar refresh memulihkan tab/sub-tab/attempt; `t` hanya dibaca sekali.
4. Bar Sebelumnya/Selanjutnya ditempatkan di akhir konten (tidak fixed) agar tidak bertabrakan dengan bottom-nav mobile dan bar aksi drill.
5. Gambar slide memakai `<img>` biasa (aset terotorisasi dari API sendiri; `images.remotePatterns` kosong); `eslint-disable` bertanda.
6. CSP (script-src IFrame API, frame-src nocookie) tidak diubah di sisi klien; `next.config.ts` belum memuat CSP (milik Backend/Security).

### Verifikasi (dijalankan di `codes/`, 2026-11-03)
Lihat ringkasan gabungan di dev_log TASK-007. Tes khusus: `markdown-article.test.tsx` (7), `video-card.test.tsx` (5), `hooks.test.tsx` (10, termasuk timer aktif), `sub-module-player.test.tsx` (14).
Belum diverifikasi: video YouTube nyata di peramban, CSP nyata, E2E Playwright (butuh server+DB), tampilan terang/gelap secara visual, 375/768/1024/1440, zoom 200%, pembaca layar.

---

## [BACKEND] 2026-11-03 11:58 (Backend Engineer, wave W2)

**Spec:** 005 | **Status:** Completed (sisi server)

### Implementasi
- Migrasi 0005_spec_005_learn_evidence (learn_active_seconds, learn_visited_subtabs, learn_last_ping_at) + src/db/schema.ts.
- src/server/player/{rules,material,service,assets,schemas}.ts: PlayerService penulis tunggal kolom learn_* dan mini_task_completed_at (override ESLint no-restricted-imports untuk src/server/player/**). Akses lewat assertSubModuleAccessible + markStarted (GET). Ping: delta = min(klaim, 30, elapsed+2), ping pertama maks 5, baris dikunci FOR UPDATE (ping serentak diserialkan). learn-complete idempoten dengan details insufficient_active_time / subtab_not_visited.
- Rute: GET /sub-modules/[sub_module], POST learn-progress, learn-complete, mini-task/complete, GET /assets/[asset_id]/file. withApi kini boleh mengembalikan Response mentah (berkas biner; X-Request-Id tetap ditambahkan). Aset: 200/304 ETag, nosniff, Cache-Control private max-age=3600, DOCUMENT attachment, mime putih, 404 bila berkas hilang (log asset_file_missing tanpa path), 403 bila semua sub-modul perujuk LOCKED.
- Hook baru src/server/activity/hooks.ts (activityHooks, dipanggil learn-complete, mini-task, submit drill).

### Keputusan / deviasi
1. Next melarang [sub_module_code] dan [sub_module_id] sejajar: satu segmen [sub_module]; path publik tidak berubah.
2. Regex kode sub-modul spec ([1-4]...) bertentangan dengan AC "9.9.9 -> 404"; dilonggarkan ke satu digit tier. Dicatat di Revision History spec 005.
3. Aditif atas usul Frontend: progress.min_active_seconds (dicatat di spec 005 dan _api-contract.md).
4. Video/slide/lampiran dengan aset hilang atau video_id korup dibuang dari payload (konsisten dengan syarat learn_ready).
5. Dependensi TASK-004 belum done saat dikerjakan (didelegasikan Orchestrator).

### Verifikasi W2 Backend (dijalankan di codes/, 2026-11-03, Postgres 16 lokal port 55432)
| Perintah | Hasil |
|---|---|
| npx eslint . --max-warnings=0 | lulus (0 galat/peringatan) |
| npx tsc --noEmit | berkas Backend bersih; 4 galat TS2352/TS2493 tersisa hanya di src/hooks/hooks.test.tsx (milik Frontend) |
| npx vitest run (unit + komponen FE) | 30 berkas, 339 tes lulus |
| npm run test:integration | 8 berkas, 175 tes lulus (baseline, auth, admin, gatekeeping, content, player 30, attempts 36, resume 14+) |
Tidak diverifikasi: E2E Playwright, next build penuh setelah perubahan W2, Docker/Node 22, uji beban.


---

## [BACKEND] 2026-11-03 12:30 (Backend Engineer, wave W3) - perbaikan temuan QA W2
- F-05-01: `learnDelta = min(klaim, 30, elapsed)` (sebelumnya `elapsed + 2`); total <= waktu dinding sejak ping pertama + 5. Spec 005 diamandemen. Tes: `player-rules.test.ts` (salvo 30 ping), `qa-w2-fixes.itest.ts`, `player.itest.ts`.
