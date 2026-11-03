# QA & Security Report: TASK-007 Resume Last Learned dan Dashboard
**Date:** 2026-11-03 12:10
**Target Branch:** claude/ielts-learning-platform-a3ccc4 (working tree, belum di-commit)
**Reviewer:** QA Agent (review statis; WORK_DEPTH standard). Tidak menjalankan next build/dev, E2E, maupun tes integrasi (butuh Postgres).
**Verifikasi yang dijalankan (di `codes/`):** `tsc --noEmit` lulus; `eslint . --max-warnings=0` lulus; `vitest run` 30 berkas / 339 tes lulus (satu flake timeout `endpoint-guards` yang dilaporkan Frontend tidak muncul pada proses ini).
**Status keseluruhan:** LULUS (0 CRITICAL, 0 HIGH, 0 MEDIUM, 5 LOW/INFO). Aman lanjut ke Tester.

## 1. Code Quality & Standards
- [x] Pass
- `card.ts` murni (label, path, fallback) sehingga dapat diuji unit (`resume-card.test.ts`); `ResumeService` kecil dan terbaca; kontrak `resume.ts` strict pada request (`strictObject`, `video_id` regex 11 karakter, `video_progress_sec` 0..21600, indeks 0..199).

## 2. Security Assessment
- [x] Pass (tidak ada secret hardcoded, tidak ada injeksi, tidak ada IDOR)
- **Terverifikasi baik:**
  - Authz `PUT /me/last-learned`: `user_id` dari sesi, tidak pernah dari body; `assertSubModuleAccessible` -> 404/403 `LOCKED_CONTENT` (`resume/service.ts:18`); `active_video_id` harus milik materi sub-modul (422/400 `video_not_in_sub_module`, `:21-26`); `active_attempt_id` hanya disimpan bila attempt milik pengguna, `IN_PROGRESS`, tipe `ACTIVE_DRILL` dan set milik sub-modul itu, selain itu `NULL` tanpa galat (`:39-45`), sehingga tidak ada oracle keberadaan attempt orang lain dan tidak ada cara menaruh id attempt asing pada kartu.
  - `GET /me/last-learned`: hanya mengembalikan sub-modul AVAILABLE dan bukan LOCKED/COMPLETED/SKIPPED (`:87-88`); attempt divalidasi ulang kepemilikannya (`:92-96`); `resume_path` dirakit dari kode DB + enum + angka + UUID tervalidasi (`card.ts:33-41`), `change_path` konstan `/peta` (tidak ada open redirect atau injeksi query).
  - Penulis tunggal `user_last_learned_state` = `ResumeService`: grep `src/` tidak menemukan penulis lain. Catatan: aturan ESLint hanya menjaga tabel progres gerbang, bukan tabel ini (lihat F-07-03).
  - UPSERT `ON CONFLICT (user_id)` atomik; "perangkat terakhir menang" sesuai spec. SQL terparameter (`::uuid`), tanpa `sql.raw`.
  - Rate limit `heartbeat` 30/mnt dengan kunci per endpoint `user:last-learned` (`last-learned/route.ts:14`), sesuai kontrak baris 153. Tanpa PII pada log.
  - **Klien keepalive/pagehide**: `usePositionRecorder` memakai `fetch keepalive` hanya pada `pagehide`/`visibilitychange=hidden`/unmount (`use-position-recorder.ts:203-218`), mengirim posisi terakhir saja (`pending` dikosongkan sebelum kirim sehingga tidak dobel), throttle video 5 dtk dan jarak minimum 2,5 dtk menjaga di bawah 30/mnt; 401 menghentikan pengiriman; kegagalan lain dikembalikan ke `pending` hanya bila belum ada posisi lebih baru. Tidak ada token/rahasia di body; origin sama sehingga cek CSRF `withApi` terpenuhi. Normalisasi sisi klien (`buildPositionBody`) selaras dengan normalisasi server (server tetap otoritatif).
  - Query `tab/sub/t/q/attempt` dari URL diperlakukan tidak tepercaya: whitelist enum, `\d{1,6}`, UUID regex (`query.ts:14-40`).
- **Temuan:**

| ID | Sev | Lokasi | Ringkas |
|---|---|---|---|
| F-07-01 | LOW | `src/server/resume/service.ts:81-83` | `GET /me/last-learned` menjalankan `recomputeStatuses` dalam transaksi tulis pada setiap pemuatan dashboard (2 query + potensi penulisan gerbang), lalu query posisi di luar transaksi (dua snapshot berbeda). Target p95 < 150 ms belum diukur (diakui Backend). Aman fungsional; ukur saat E2E, dan pertimbangkan cache snapshot singkat per pengguna. Bila `recomputeStatuses` gagal sebagian, kartu tidak tersedia (galat 500), tangani dengan empty state di klien (sudah ada "Coba lagi"). |
| F-07-02 | LOW | `src/components/player/sub-module-player.tsx` (perekaman saat halaman dibuka), dev_log FE keputusan #1 | Membuka halaman sub-modul langsung merekam posisi awal dan menimpa posisi video/soal sebelumnya (satu baris per pengguna). Pelajar yang masuk dari Peta (bukan kartu) kehilangan posisi video lama padahal belum menonton ulang. Perilaku sesuai "satu baris", tetapi dapat mengejutkan; opsi: jangan timpa `video_progress_sec` bila sub-modul sama dan tab/sub-tab sama. Keputusan produk. |
| F-07-03 | LOW | `eslint.config.*:52-68` | Seperti catatan TASK-005: tidak ada penjaga otomatis bahwa hanya `ResumeService` menulis `user_last_learned_state`, dan aturan impor lolos untuk impor relatif. Tambah tes statis (grep `userLastLearnedState` di `src/server` hanya di `resume/`). |
| F-07-04 | INFO | `use-position-recorder.ts:116`; dev_log BE | Komentar klien menyebut bucket "dibagi dengan learn-progress", padahal server memakai kunci terpisah per endpoint (`user:last-learned` vs `user:learn-progress`). Tidak berbahaya (klien lebih konservatif); perbaiki komentar/dokumen. |
| F-07-05 | INFO | `resume/service.ts:34` | `video_progress_sec` (maks 21600) tidak dibandingkan dengan `start_sec/end_sec` video; nilai di luar rentang dinormalkan klien (`effectiveStart`) sehingga tidak ada dampak keamanan, hanya label "Video mm:ss" yang bisa janggal. |

### Deviasi dan keputusan Backend yang dinilai
- `FALLBACK_NEXT` mengisi `updated_at=null` (skema FE nullable): **LOW/diterima**, sesuai kontrak klien.
- Atribut `active_attempt_id` diam-diam `NULL` untuk attempt yang tidak valid: **diterima dan lebih aman** daripada galat (tidak ada oracle).
- Hubungan dengan deviasi TASK-006 #4: `GET /attempts/{id}` mereset basis waktu streak (lihat F-06-02, MEDIUM di `TASK-006_question-engine-active-drill/qa_report.md`). Resume `?attempt=` memanggil GET tersebut sehingga setiap lanjut dari kartu juga mereset basis; perbaikan F-06-02 menyelesaikan keduanya.

## 3. Architecture Alignment
- [x] Pass
- `GET/PUT /api/v1/me/last-learned` (baris 33-34 kontrak, 200), `src/server/resume/*`, `contracts/resume.ts`, `components/home/*`, `hooks/use-position-recorder.ts` sesuai struktur. Dashboard menyediakan slot `#dashboard-slots` untuk 016/017 dan Resume paling atas sesuai UX spec. Algoritma D-RESUME 1-5 tercermin di kode: posisi tersimpan valid -> RESUME; sub-modul LOCKED/COMPLETED/SKIPPED atau hilang -> fallback IN_PROGRESS pertama lalu UNLOCKED pertama; tidak ada kandidat -> `null` (empty state).
- Akses sub-modul tetap lewat `GatekeepingService` (tidak ada pembacaan langsung tabel progres di `resume/`).

## 4. Recommendations
1. (LOW) F-07-01 ukur p95 pada E2E; pertimbangkan hanya satu snapshot dalam satu transaksi.
2. (LOW) F-07-02 putuskan perilaku timpa posisi saat membuka sub-modul dari Peta; F-07-03 tes statis penulis tunggal.
3. (INFO) F-07-04/05 rapikan komentar dan normalisasi label.
4. Prasyarat lintas task: tutup F-06-02 (GET attempt mereset basis streak) sebelum SPEC-016.

**Keputusan:** Aman dilanjutkan ke Tester (E2E). Belum diverifikasi oleh QA: 14+ tes integrasi resume (butuh DB), pemulihan nyata video/soal di peramban, p95 resume < 10 detik.
