# Dev Log TASK-006: Mesin Soal Multi-Format dan Active Drill

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W2)

Spec: `specifications/006_spec_question_engine_active_drill.md` (UI/UX + klien API). Penilaian, pengacakan, dan kunci jawaban sepenuhnya di server; klien hanya mengirim `{ response }`.

### Yang dibangun
- **Kontrak (baru, hanya ditambah)**: `src/contracts/attempts.ts` (`QuestionPublicSchema`, `AttemptSchema`, `FeedbackSchema`, `AttemptResultSchema`, `AnswerResponseSchema` strict, `StartAttemptRequestSchema`, `SubmitAnswerRequestSchema`). Dibuat Frontend karena belum ada; Backend boleh menambah, jangan menimpa.
- **Klien API**: `src/lib/api/attempts.ts` (`start`, `get`, `answer`, `submit`, `result`). Body jawaban hanya `{ response }` (tanpa `is_correct`/`score`/`time_spent_ms`).
- **Komponen** (`src/components/quiz/`): `question-renderer.tsx` (fieldset/legend, legend = target fokus), renderer per tipe di `renderers/`: `McqRenderer` (radio/checkbox 56px, huruf A-D, "Pilih {n} jawaban", dibatasi `choose_count`), `TriChoiceRenderer` (TFNG/YNNG segmented + Tooltip Indonesia), `TextRenderer` (helper batas kata, penghitung live, `role=alert` bila melebihi; Periksa tetap aktif), `MatchingRenderer` (dropdown `<select>` DAN drag `@dnd-kit` ambang 8px + pengumuman aria-live; default dropdown < 768px; toggle antar-mode), `ReorderRenderer` (drag handle + tombol Naik/Turun keyboard + pengumuman), `ErrorRecognitionRenderer` (garis bawah bergelombang + ikon + teks "Ditandai", maks 3), `AiTaskSlot` (WRITING/SPEAKING, tidak memblokir Lanjut). `feedback-panel.tsx` (`role=status aria-live=polite`, ikon+teks+warna), `active-drill.tsx`, `drill-result.tsx`, `exam-shell.tsx`, `question-navigator-grid.tsx`.
- **ActiveDrill**: Periksa (disabled sampai ada jawaban, "Memeriksa...") -> umpan balik instan -> Lanjut; soal terakhir "Lihat Hasil" memanggil submit. Timer per soal naik (warning lewat target atau 20 dtk) dan timer total hitung mundur sebagai panduan (Toast sekali saat 0, tidak menghentikan; `role=timer` tanpa aria-live per detik). Pemulihan: jawaban tersimpan + indeks awal = `min(q, soal tak terjawab pertama)`. Galat jaringan saat PUT: Toast error tetap dengan "Coba lagi", tidak maju. `ATTEMPT_EXPIRED`/`ATTEMPT_NOT_ACTIVE`: Dialog "Waktu habis" lalu hasil. `QUESTION_ALREADY_ANSWERED`: muat ulang attempt. Pintasan Enter dan 1-4/A-D (dapat dimatikan; kartu preferensi baru di `/profil`, `components/auth/shortcut-pref.tsx`, disimpan di localStorage hanya sebagai kenyamanan per peramban).
- **DrillResult**: skor besar, garis ambang, status Lulus/Belum lulus (ikon+teks), "Terbuka: ...", `CrownBadge` bila bukan NONE, pesan suportif, "Ulangi Latihan"/"Tinjau Materi", "Sub-Modul Berikutnya" (ke `next_sub_module_code`), tinjauan soal via `<details>`. Semua angka lulus/gagal dari server (klien tidak menghitung ulang).
- **ExamShell/QuestionNavigatorGrid**: kerangka siap pakai SPEC-008/014/015 (header tipis, timer, `aria-live` hanya tonggak 10/5/1 menit, `beforeunload`, Dialog "Akhiri ujian?" dengan jumlah belum dijawab, grid status berikon + nama aksesibel).
- **Integrasi**: `components/player/drill-tab.tsx` (ringkasan, "Mulai Latihan" via `POST /attempts`, pemulihan `?attempt=`, hasil, ulangi).

### Keputusan dan asumsi
1. Rute `/ujian/*` TIDAK dibuat: handler tipe selain ACTIVE_DRILL belum aktif (`ASSESSMENT_TYPE_NOT_ENABLED`); `ExamShell` disiapkan untuk spec yang membangunnya.
2. `passage_markdown`/`listening` pada `AttemptDTO` belum dirender (SPEC-010/011).
3. Pada hasil yang dipulihkan via refresh (`GET .../result`) teks soal tidak tersedia pada tinjauan (DTO review hanya `question_id`); ditampilkan sebagai "Soal n".
4. Tidak ada mode perpanjang waktu; spec 006 menyatakan timer Drill hanya panduan.

### Verifikasi
Lihat ringkasan gabungan di dev_log TASK-007. Tes khusus: `renderers.test.tsx` (13 renderer/aksesibilitas keyboard), `active-drill.test.tsx` (14 termasuk DrillResult), `exam.test.tsx` (2).
Belum diverifikasi: drag-and-drop sentuh/pointer nyata (hanya alternatif dropdown/tombol yang diuji di jsdom), E2E dengan 10 soal nyata, tampilan visual terang/gelap/375px, pembaca layar.

---

## [BACKEND] 2026-11-03 11:58 (Backend Engineer, wave W2)

**Spec:** 006 | **Status:** Completed (sisi server)

### Implementasi
- src/server/attempts/: prng.ts (mulberry32, ID opak CSPRNG), engine.ts (murni: pemilihan D4, pengacakan D5, DTO allow-list D9, validasi bentuk response dengan kode details kontrak, normalisasi D6, penilaian D7 dalam sentesimal bilangan bulat, ambang tepat tanpa float, waktu/streak D8), dto.ts, handlers.ts (registri assessmentTypeHandlers; hanya ACTIVE_DRILL; handler memanggil GatekeepingService.applyDrillResult), hooks.ts (attemptCompletedHooks), service.ts.
- Rute: POST /attempts (201/200), GET /attempts/[id], PUT .../answers/[question_id], POST .../submit, GET .../result.
- Transaksi tunggal per permintaan dengan SELECT FOR UPDATE pada attempt; advisory lock per (user,set) pada start; submit idempoten (hasil dibangun ulang dari kolom + attempts.result_json, hook sekali); kedaluwarsa EXAM diproses dan di-commit sebelum 409 ATTEMPT_EXPIRED dilempar; kegagalan hook membatalkan submit (500, attempt tetap IN_PROGRESS).
- src/server/clock.ts: jam server yang dapat dikendalikan tes (deadline, D8).

### Keputusan / deviasi
1. state attempt ditambah pass_percent (ambang dibekukan saat mulai). result_json = {v:1, progress, skip, boss, placement}; spec 008/014/015 mengisi kuncinya.
2. current_index mengabaikan soal AI; review dan per_skill hanya memuat soal objektif.
3. Persen yang diberikan ke gerbang diklem satu sentesimal di bawah ambang bila perbandingan tepat tidak lulus namun pembulatan mencapai ambang (mis. 74,996 -> 75,00).
4. GET /attempts/{id} memperbarui state.last_resume_at (D8); konsekuensi: refresh dapat mereset basis waktu streak (risiko kecil, hanya bonus kecepatan SPEC-016).
5. Handler EXAM diuji lewat handler uji (SKIP_MODULE_TEST didaftarkan di tes saja).
6. Error baru di registri http/errors.ts: 11 kode SPEC-005/006.

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
- F-06-01: pengacakan memakai seed rahasia 128-bit CSPRNG di `attempts.state.rng_seed` (bukan turunan `attempt.id`). Spec 006 D4 diamandemen. Tes: `attempts-engine.test.ts`, `qa-w2-fixes.itest.ts`.
- F-06-02: `GET /attempts/{id}` bebas efek samping; `POST /attempts` (resume) menggeser `last_resume_at` hanya bila jeda > 60 detik. Spec 006 D8 diamandemen. Tes: `qa-w2-fixes.itest.ts`.
