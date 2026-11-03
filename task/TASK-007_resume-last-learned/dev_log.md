# Dev Log TASK-007: Resume Last Learned dan Dashboard

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W2)

Spec: `specifications/007_spec_resume_last_learned.md` (UI/UX + klien API).

### Yang dibangun
- **Kontrak (baru, hanya ditambah)**: `src/contracts/resume.ts` (`UpdateLastLearnedRequestSchema` strict, `ResumeCardResponseSchema`). Dibuat Frontend karena belum ada; Backend boleh menambah, jangan menimpa.
- **Klien API**: `src/lib/api/resume.ts` (`get`, `update` dengan opsi `keepalive`).
- **Dashboard `/`**: `components/home/dashboard.tsx` (sapaan, `ResumeSection` PALING ATAS, `#dashboard-slots` kosong untuk SPEC-016/017); `HomePlaceholder` dihapus. `components/home/resume-card.tsx`: varian highlight, label "Lanjutkan Belajar"/"Berikutnya untuk Anda", judul, breadcrumb, `position_label`, Progress (`aria-valuenow`), satu CTA primer `lg` berupa tautan ke `resume_path` (nama aksesibel "Lanjutkan Belajar: {judul}"), tautan "Ganti sub-modul"; empty state "Mulai perjalanan Anda" + "Mulai dari Tier 1" (Placement tersembunyi, prop `placementAvailable` default false); Skeleton; galat + "Coba lagi" + tautan Peta.
- **PositionRecorder**: `hooks/use-position-recorder.ts` (normalisasi sisi klien selaras server, throttle video 5 dtk, perubahan tab/soal segera dengan jarak minimum 2,5 dtk menghormati bucket `heartbeat`, `pagehide`/hidden = keepalive, gagal = ulang pada simpan berikutnya, 401 menghentikan pengiriman, `online` mengirim ulang posisi terakhir). Dipakai di `sub-module-player.tsx` untuk tab, sub-tab, video (PLAYING tiap 5 dtk + jeda), soal drill (indeks + attempt).
- **Pemulihan**: query `tab/sub/t/q/attempt` -> tab, sub-tab, `playerVars.start=t` (di luar rentang kembali ke `start_sec`), drill ke soal `q` dari attempt valid (`GET /attempts/{id}`; tidak valid -> layar pembuka).

### Keputusan dan asumsi
1. Posisi awal direkam saat halaman sub-modul dibuka (menimpa posisi sebelumnya sesuai perilaku "satu baris per pengguna").
2. Ikon awan "Tersimpan" opsional tidak dibuat.

### Verifikasi W2 Frontend (dijalankan di `codes/`, 2026-11-03)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus (0 galat) |
| `npx eslint . --max-warnings=0` | lulus (0 galat/peringatan) |
| `npx vitest run` | 338 dari 339 lulus. Satu kegagalan: `tests/security/endpoint-guards.test.ts` (milik Backend) timeout 5 dtk pada impor `audit-log/route.ts` saat seluruh suite berjalan paralel; berkas yang sama lulus penuh (33/33) bila dijalankan sendiri, jadi dinilai flake beban. Tes FE W2: player 7+5+14, hooks 10, quiz 13+14+2, home 4. |
| `next build` / `next dev` / Playwright | TIDAK dijalankan (arahan: jangan berbagi `.next`/port; E2E butuh server+DB). |
Belum diverifikasi: integrasi dengan backend nyata (kontrak diuji lewat `fetch` tiruan), YouTube nyata + CSP, tampilan visual terang/gelap dan 375/768/1024/1440, zoom 200%, pembaca layar, kontras otomatis, p95 < 10 detik resume (E2E).

---

## [BACKEND] 2026-11-03 11:58 (Backend Engineer, wave W2)

**Spec:** 007 | **Status:** Completed (sisi server)

### Implementasi
- src/server/resume/{card,service}.ts: ResumeService penulis tunggal user_last_learned_state. PUT: assertSubModuleAccessible, validasi video milik sub-modul (video_not_in_sub_module), normalisasi tab/subtab/video/indeks, attempt hanya disimpan bila IN_PROGRESS milik pengguna untuk drill sub-modul itu (selain itu NULL tanpa error), UPSERT ON CONFLICT. GET: kartu dari snapshot gerbang (recomputeStatuses) + satu query posisi (+ satu query attempt bila DRILL); D-RESUME 1-5, position_label dan resume_path sebagai fungsi murni (tes unit).
- Rute GET/PUT /me/last-learned; bucket heartbeat dengan kunci per endpoint (user:last-learned).

### Keputusan
1. FALLBACK_NEXT mengisi updated_at = null (skema FE nullable).
2. p95 < 150 ms belum diukur terpisah (hanya fungsional); jumlah query tunak: recompute (2) + baris posisi (1) + opsional attempt (1).

### Verifikasi W2 Backend (dijalankan di codes/, 2026-11-03, Postgres 16 lokal port 55432)
| Perintah | Hasil |
|---|---|
| npx eslint . --max-warnings=0 | lulus (0 galat/peringatan) |
| npx tsc --noEmit | berkas Backend bersih; 4 galat TS2352/TS2493 tersisa hanya di src/hooks/hooks.test.tsx (milik Frontend) |
| npx vitest run (unit + komponen FE) | 30 berkas, 339 tes lulus |
| npm run test:integration | 8 berkas, 175 tes lulus (baseline, auth, admin, gatekeeping, content, player 30, attempts 36, resume 14+) |
Tidak diverifikasi: E2E Playwright, next build penuh setelah perubahan W2, Docker/Node 22, uji beban.
