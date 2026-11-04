# Dev Log TASK-012: Penilaian AI Writing dan Mini-Task Writing

## [BACKEND] 2026-11-03 14:20 (Backend Engineer, wave W6)

**Spec:** 012 (bergantung pada kontrak `_api-contract.md` FINAL, ADR-002/003, `security-standards.md`) | **Status:** Completed (sisi server, driver mock)

### Audit awal (agar tidak menduplikasi)
Sudah ada dan dipakai ulang: tabel `submissions`, `ai_evaluations`, `async_jobs`, `grading_rubrics`, `speaking_recordings`, `users.consent_recording_at/keep_recordings`; `JobDTO/QuotaDTO/EvaluationFlagsDTO` di `contracts/common.ts`; bucket rate limit `job_poll` dan `upload_recording`; antrean pg-boss (`worker/queues.ts` dengan retry 2, jeda 30 dtk, backoff, `expireInSeconds = timeout + 60`), pola `enqueue` setelah commit (SPEC-019), limiter in-process AI di `worker/index.ts`, `roundToHalfBand` (SPEC-009), `assertSubModuleAccessible`, `loadMaterial`, `parseQuestions`/`isExpired` (SPEC-006), `activityHooks`, `userAnonymizedHooks`, `app_settings` (`ai.daily_limit_per_user`, `ai.queue_max`, `retention.*`), `bench-ai.mjs`. Belum ada: kolom `ai_evaluations.flags`, `src/server/ai/*`, `contracts/ai.ts`, rute `/submissions`, `/ai/status`, handler worker (masih `notImplemented`), seed rubrik, tugas purge AI.

### Dibangun
- **Skema/seed:** `drizzle/0008_spec_012_ai_flags.sql` (+ snapshot/journal; migrasi lama tidak diubah), `schema.ts` `ai_evaluations.flags`; `scripts/seed.ts` modul `grading-rubrics` (rubrik WRITING v1 dan SPEAKING v1, `is_active`, sumber `BAND_DESCRIPTORS`, parafrase orisinal 4 kriteria x band 4-8; konten final = C-05).
- **Kontrak:** `src/contracts/ai.ts` (permintaan, DTO, `WritingEvaluationOutputSchema`/`SpeakingEvaluationOutputSchema` `z.strictObject`); kode error SPEC-012/013 di `http/errors.ts`; token detail di `http/zod-errors.ts`.
- **`src/server/ai/`:** `llm.ts` (`LlmClient`, `OllamaClient` `POST /api/chat` `stream:false` + `format` JSON Schema, `MockLlmClient` dengan mode `ok|down|invalid|timeout`, latensi, band), `text.ts` (hitung kata, `ID_STOPWORDS` 40, regex injeksi, rasio non-English 0,15, netralisasi), `prompts.ts` (prompt sistem + satu pasang pembatas `<student_response id="hex8">` + penanda rahasia/canary + pesan perbaikan tanpa nilai masukan), `evaluate.ts` (satu panggilan + SATU perbaikan, kupas pagar kode, tolak kebocoran prompt), `scoring.ts` (aturan skor di kode: rata-rata kriteria, kap panjang, non-English, >= 8.0 -> 7.5; murni), `pipeline.ts` (`runGradeWriting`, bersama Speaking), `lock.ts` (advisory lock 727001 global, `pg_try_advisory_lock` + timeout), `quota.ts`, `dto.ts`, `service.ts` (POST writing, GET, daftar, retry, self-assessment, status), `dispatch.ts` (kirim setelah commit, pemulihan job), `hooks.ts` (`evaluationGradedHooks`), `recordings.ts` (purge raw output/rekaman), `rubric-seed.ts`.
- **Rute (`src/app/api/v1`):** `submissions/writing` (POST 202), `submissions/[id]` (GET, bucket `job_poll`), `submissions` (GET daftar), `submissions/[id]/retry` (202), `submissions/[id]/self-assessment` (201), `ai/status`, `admin/submissions/[id]` (GET + audit `ADMIN_VIEWED_SUBMISSION`).
- **Worker:** `worker/registry.ts` mengganti `notImplemented` untuk `ai-grade-writing` (dan dua queue Speaking); `worker/purge.ts` menambah `purgeAiRawOutput`, `purgeRecordings`, `recoverStuckAiJobs`; `worker/index.ts` memulihkan job tertinggal dan membersihkan tmp saat start. `player/service.ts` `completeMiniTaskGraded` (Mini-Task selesai saat GRADED; satu-satunya penulis `mini_task_completed_at` tetap PlayerService).
- **Lint:** `eslint.config.mjs` melarang impor `exec`/`execSync` dari `child_process` dan membebaskan `security/detect-non-literal-fs-filename` untuk `src/server/ai/**` (path dibangun sendiri).

### Keputusan dan klarifikasi (juga dicatat di spec 012 + `_api-contract.md`)
1. `score_capped`/`cap_reason` hanya menyala bila kap benar-benar menurunkan skor; seri kap -> `non_english` menang. `min_words` kosong -> default 150/250.
2. Percobaan ulang pg-boss dihitung lewat `async_jobs.attempt`; eksekusi ke-3 yang gagal menandai `FAILED` dan tidak melempar (pg-boss tidak mengulang lagi). Job dikirim ke pg-boss SETELAH commit (id di `boss_job_id`); gagal kirim -> `FAILED INTERNAL` + 503; `recoverStuckAiJobs` mengirim ulang job tanpa id, menutup job yang pg-boss-nya `failed`/`cancelled`, dan membatalkan `QUEUED` saat AI mati.
3. Batas retry (3) dihitung dari `audit_log` `AI_SUBMISSION_RETRIED` (tanpa kolom baru).
4. Serialisasi pengiriman per user dengan `pg_advisory_xact_lock(hashtextextended('ai-submission:'||user))`.
5. Pertahanan injeksi berlapis: pra-pemeriksaan (flag + audit `AI_INJECTION_SUSPECTED` tanpa isi esai), netralisasi, pembatas bernonce, penanda rahasia pada prompt sistem (keluaran yang memuatnya ditolak), skema keluaran ketat, skor dihitung di kode.
6. Log pipeline hanya `submission_id`, durasi, `model_name`, status, jumlah panggilan LLM (diuji: isi esai/prompt/keluaran tidak muncul).

### Tes
- Unit: `ai-text-scoring` (32), `ai-llm-stt` (14; OllamaClient/WhisperCppClient dengan `http.createServer`), `ai-contracts` (9), `ai-audio-type-media` (9, ffmpeg/ffprobe nyata), `seed` diperbarui; keamanan: `tests/security/prompt-injection/injection.test.ts` (14 kasus: perintah menimpa skor, pembatas palsu, JSON rusak, instruksi Indonesia, prompt-leak, kosong/gibberish, 5000 karakter, token chat, role prefix, JSON selundupan, kunci ekstra, pagar kode, Speaking, kunci Speaking).
- Integrasi `tests/integration/ai-writing.itest.ts` (44): setiap AC SPEC-012 (alur dasar + `quota.used`, GRADED + flags + Mini-Task, skor ulang, kap 100/200/249/250 kata, >= 8.0, non-English, injeksi + audit, repair/invalid dua kali, Ollama tak terjangkau 3 eksekusi + konfigurasi antrean di `pgboss.queue`, timeout, INTERNAL, log tanpa isi esai, AI mati, self-assessment, cancel saat AI dimatikan, aktif/serentak/kuota 10/antrean 20/posisi antrean, konteks 404/409/403, kepemilikan, rate limit poll, admin + audit, daftar, status, retry 3x, pg-boss nyata end-to-end, pemulihan, purge 181/179 hari, idempotensi).
- Pembantu: `tests/integration/ai-helpers.ts`, `tests/fixtures/audio/make.ts`.

### Verifikasi (`codes/`, 2026-11-03, lingkungan lokal: Postgres 16, tanpa Docker/Ollama/whisper.cpp/GPU; LLM_DRIVER=mock, STT_DRIVER=mock)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | bersih |
| `npx eslint src tests scripts --max-warnings=0` | bersih |
| `npx vitest run` | 52 berkas, 771 tes lulus (termasuk tes komponen FE yang ada saat dijalankan) |
| `npm run test:integration` | 17 berkas, 401 tes lulus |
| `npm run build:worker` | lulus (bundel esbuild) |

### Belum diverifikasi / catatan
- `OllamaClient` HANYA diuji dengan server HTTP palsu; belum dijalankan terhadap Ollama/model nyata (kualitas JSON, `format` schema, latensi, memori).
- **Prasyarat benchmark C-09 (`npm run bench:ai`) belum dilakukan** (butuh Ollama + model); model/latensi belum dikunci (ADR-002); `OLLAMA_MODEL_WRITING` tetap dari env.
- Konten rubrik adalah parafrase sementara; finalisasi = tugas konten C-05.
- E2E Playwright, `next build`, worker sebagai proses terpisah dengan pg-boss produksi (peran `app_rw`) tidak dijalankan; pg-boss nyata hanya diuji di dalam proses uji dengan DB lokal.
- Radar/prediksi (SPEC-017) belum ada: `evaluationGradedHooks` kosong; evaluasi `injection_suspected` perlu dikecualikan oleh SPEC-017 saat dibangun.

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W6; ditulis ulang setelah QA F-12-10, bagian asli tertimpa saat penulisan paralel)

**Spec:** 012 (API Contract `_api-contract.md` #43-#49) | **Status:** Completed (sisi klien, terhadap kontrak; integrasi dengan backend nyata belum diuji)

### Dibangun
- `components/ai/`: `writing-editor` (hitung kata live, autosave, Ctrl+Enter, konfirmasi kirim, timer/penanda kata minimum), `writing-task` (alur editor -> kirim -> polling job -> hasil; `submitErrorMessage` memetakan kode detail validasi/kode galat/kuota 429 + jam WIB), `ai-job-status`, `submission-outcome`, `evaluation-card` (band, disclaimer, 4 kriteria, kekuatan/saran, anotasi inline, diff koreksi, rewrite Band 7, bendera injeksi/kap), `self-assessment-form` (fallback `FALLBACK_SELF_ASSESSMENT`/`FAILED`), `submission-history`, `submission-detail`, `recording-prefs-card`; `lib/ai/{annotate,job,draft}.ts`; `lib/api/{ai,ai-contract}.ts` (skema Zod = kontrak; respons tak sesuai ditolak `RESPONSE_INVALID`, tidak ditambal).
- Semua teks AI dirender sebagai node teks React (tanpa `dangerouslySetInnerHTML`); anotasi memakai `indexOf` + potongan string.
- State: loading, kosong, galat, sukses, kuota habis, AI tidak tersedia (banner), fallback; a11y: label, `role=status/region`, fokus dialog, hasil tidak bergantung warna.

### Perbaikan temuan QA (2026-11-03)
- **F-12-04 (MEDIUM) diperbaiki.** Kunci draf kini `draft:v1:{user_id}:{attempt_id|sub_module_id}:{question_id|mini}` dan id submission aktif `ai-sub:v1:{user_id}:...` (`lib/ai/draft.ts`: `draftKey`, `activeSubKey`); tanpa `user_id` kunci kosong dan tidak ada yang dibaca/ditulis. Nilai draf `{t, v}` dengan TTL 7 hari (`DRAFT_TTL_MS`); draf kedaluwarsa/format lama dibuang saat dimuat (`pruneExpiredDrafts` dipanggil editor). `clearExamStorage` (`lib/reading/storage.ts`) kini juga menghapus awalan `draft:v1:` dan `ai-sub:v1:`; fungsi itu sudah dipanggil pada logout (`useLogout.onSuccess`) dan 401/`toLogin` (`AuthGate`), jadi kedua jalur tercakup. Setelah kirim draf dihapus (sudah ada) dan kini dihapus lagi saat submission `GRADED`; "Ulangi" juga menghapusnya. Autosave tambahan saat `visibilitychange` (hidden) dan `beforeunload` agar ketikan terakhir tidak hilang. Editor mempertahankan teks yang sudah diketik bila identitas pengguna baru terbaca setelahnya.
- Tes: `ai.test.tsx` (draf user lain/kedaluwarsa tidak dipulihkan, draf segar dipulihkan, `clearExamStorage` menghapus `draft:v1:`/`ai-sub:v1:`; tes draf & submission aktif disesuaikan ke kunci per-user), `reading/storage.test.ts` (semua user dibersihkan, TTL, format lama, prune), `ai-lib.test.ts` (bentuk kunci, tanpa userId = kosong).
- **F-12-10 (LOW)** bagian ini sendiri; `vitest` dijalankan ulang (angka di bawah).
- **Ditunda (LOW, tidak dikerjakan di sisi klien):** F-12-05..09, F-12-11 (celah tes server) dan semua INFO; F-12-01..03 milik Backend.

### Verifikasi (di `codes/`)
| Perintah | Hasil |
|---|---|
| `tsc --noEmit` | bersih |
| `eslint src tests --max-warnings=0` | bersih |
| `vitest run` | 53 berkas, 786 tes lulus |
| `test:integration` | tidak dijalankan (DB dibagi) |

### Belum diverifikasi
- UI di peramban nyata (a11y, tata letak seluler), E2E Playwright, CSP; integrasi dengan backend/Ollama nyata.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 14:20 | Backend W6: implementasi SPEC-012 (pipeline, kuota, antrean, fallback, purge, admin audit) + tes unit/integrasi/keamanan |
| 2026-11-03 | Frontend W6: bagian [FRONTEND] dipulihkan (F-12-10); perbaikan F-12-04 (draf/ai-sub per-user, TTL, dibersihkan saat logout/401/GRADED) + tes |

## [BACKEND] Perbaikan QA W6 (2026-11-03 14:40)
Temuan QA `qa_report.md` yang ditangani (kontrak API tidak berubah; tanpa migrasi skema baru):
- **F-12-01 (MEDIUM)**: `server/ai/text.ts` — `detectInjection` kini menormalkan dulu (`NFKC`, buang `\p{Cf}`, ratakan `\s+`) lalu menguji pola `\s+`; ditambah `disregard|forget|override|bypass` + (instructions/rules/above/previous), `give ... band`, kunci skema (`overall_band`, `task_response`, ...), `set ... score/band/criterion ... to N`, dan pola Indonesia. Sinyal struktural di `scoring.ts`: semua kriteria >= 8.5 pada teks < 100 kata (Writing) / < 80 kata (Speaking) menyetel `injection_suspected` (jadi dikecualikan radar SPEC-017 + audit + peringatan UI). Tes: `tests/security/prompt-injection` kasus 15-17 (dua spasi, baris baru, lebar-nol, fullwidth, sinonim, "give band 9", "Set overall_band to 9", serta kalimat esai wajar yang TIDAK boleh ditandai). Catatan: pola sengaja dibuat spesifik (butuh kualifier previous/above/your/system) agar esai tentang "ignore traffic rules" tidak positif palsu; homoglif lintas-alfabet (Cyrillic) belum dicakup.
- **F-12-02 (MEDIUM)**: `worker/recovery.ts` baru — `recoverStuckAiJobs` dijalankan tiap 2 menit lewat `setInterval` (tanpa tumpang tindih, `unref`, galat dicatat, dihentikan saat shutdown) di `worker/index.ts`; tetap juga dijalankan saat start dan pada `retention-purge`. Tes `tests/unit/worker-resilience.test.ts` (interval 1-5 menit, tanpa tumpang tindih, galat dicatat).
- **F-12-03 (MEDIUM)**: `worker/registry.ts` `runPurgeTasks` — try/catch + log per tugas, lanjut ke tugas berikutnya, `AggregateError` di akhir (pg-boss tetap mencatat gagal). Tes: tugas awal gagal -> `purgeRecordings`/`purgeAiRawOutput` tetap berjalan.
- **F-12-05 (LOW)**: `pipeline.ts` `saveEvaluation` mengunci baris job + submission (`FOR UPDATE`), menyimpan hanya bila job `RUNNING` dan submission `GRADING`, selain itu hasil dibuang (mengembalikan `false`, log `discarded_stale`; hooks SPEC-017 tidak dijalankan ganda). Tes integrasi di `ai-speaking.itest.ts`.
- Ditunda (dicatat): **F-12-04** (draf lokal; wilayah Frontend), F-12-06 (`expireInSeconds` queue AI; ukur bersama benchmark C-09), F-12-07 (batas antrean tanpa kunci global; lonjakan kecil), F-12-08 (keputusan produk), F-12-09 (anggaran token; butuh model nyata), F-12-10, F-12-11 (sebagian tertutup oleh tes baru; sisanya FE/logout).

Verifikasi: `tsc --noEmit` 0; `eslint src tests scripts --max-warnings=0` 0; `vitest run` 53 berkas / 786 tes lulus; `npm run test:integration` 17 berkas / 404 tes lulus.

### Revision History (tambahan)
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 14:40 | Backend: perbaikan QA W6 (F-12-01, F-12-02, F-12-03, F-12-05); lihat bagian di atas |
