# Developer Log: TASK-012 Penilaian AI Writing dan Mini-Task Writing

## Summary of Work
Implementasi penuh subsistem evaluasi AI Writing dan Mini-Task Writing sesuai `specifications/012_spec_ai_writing.md`:
1. **Contracts & DTOs (`src/contracts/ai.ts`):**
   - Skema Zod deterministik: `CreateWritingSubmissionRequestSchema`, `SelfAssessmentRequestSchema`, `WritingEvaluationOutputSchema`, `SubmissionSchema`, `EvaluationSchema`, `JobSchema`, `AiStatusSchema`, `SubmissionsListQuerySchema`, `SubmissionListItemSchema`.
2. **Scoring & Sanitization Engine (`src/server/ai/scoring.ts`):**
   - `countWords`: hitung kata tokenized.
   - `isInjectionSuspected`: deteksi regex injeksi prompt (Inggris & Indonesia).
   - `isNonEnglishSuspected`: rasio stopword bahasa Indonesia (40 kata baku) >= 15%.
   - `neutralizeUserInput`: netralisasi batas `<student_response>`, token chat template, awal peran chat `system/assistant/user:`, triple backticks.
   - `roundToHalfBand`: pembulatan ke kelipatan 0.5 terdekat.
   - `postProcessScores`: kalkulasi deterministik di kode (recompute overall dari 4 kriteria, panjang <50% -> 3.5, 50-80% -> 5.0, 80-100% -> 6.0, non-Inggris -> 4.0, band >= 8.0 -> 7.5, flag `injection_suspected`).
3. **LLM Abstraction & Driver (`src/server/ai/llm.ts`):**
   - Antarmuka `LlmClient` dengan driver `OllamaClient` dan `MockLlmClient` deterministik untuk dev/testing.
4. **Worker Pipeline (`src/server/ai/pipeline.ts`):**
   - Pipeline evaluasi `processWritingEvaluation` dengan pg-boss queue `ai-grade-writing`.
   - Percobaan perbaikan otomatis 1x saat output JSON LLM gagal divalidasi skema.
   - Idempoten update progres Mini-Task lewat `completeAiMiniTask` dan hook aktivitas `activityHooks`.
   - Pencatatan log audit `AI_INJECTION_SUSPECTED`.
5. **Service Layer (`src/server/ai/service.ts`):**
   - `createWritingSubmission`: validasi batas kata, kuota harian (10), batasan antrean, konteks attempt / sub-modul (terbuka & materi selesai), fallback saat AI nonaktif.
   - `getSubmission`: detail submission, job queue position, dan evaluasi terbaru.
   - `retrySubmission`: percobaan ulang untuk status FAILED (maks 3 kali).
   - `selfAssessSubmission`: penilaian mandiri 4 kriteria dengan kalkulasi roundToHalfBand rata-rata.
   - `listSubmissions`: riwayat evaluasi pengguna dengan paginasi.
   - `getAiStatus`: ketersediaan LLM lokal, antrean, estimasi tunggu, dan kuota 24 jam.
6. **API Route Handlers:**
   - `POST /api/v1/submissions/writing` (202 Accepted)
   - `GET /api/v1/submissions/[submission_id]` (200 OK)
   - `POST /api/v1/submissions/[submission_id]/retry` (202 Accepted)
   - `POST /api/v1/submissions/[submission_id]/self-assessment` (201 Created)
   - `GET /api/v1/submissions` (200 OK)
   - `GET /api/v1/ai/status` (200 OK)
   - `GET /api/v1/admin/submissions/[submission_id]` (200 OK, audit logged)
7. **Frontend UI Components:**
   - `WritingEditor`: live word counter, 10s auto-save ke localStorage, peringatan panjang kata minimum, shortcut Ctrl+Enter, modal konfirmasi kirim.
   - `AiJobStatus`: kartu status QUEUED (dengan nomor antrean), GRADING (progress bar), FAILED (opsi coba lagi & nilai sendiri), FALLBACK_SELF_ASSESSMENT.
   - `EvaluationCard`: tampilan skor overall, 4 kartu kriteria, daftar kekuatan & pengembangan, saran perbaikan "Menuju Band 7", rekonstruksi Band 7, banner disclaimer wajib `"Perkiraan latihan, bukan skor resmi IELTS."`, dan banner pembatasan skor (flags).
   - `SelfAssessmentForm`: formulir penilaian mandiri 4 kriteria IELTS dengan kalkulasi band langsung.

## Automated Verification
- Unit test scoring & mock LLM: `codes/tests/unit/ai-writing.test.ts` (22 tests passed).
- Unit test endpoints API: `codes/tests/unit/ai-writing-routes.test.ts` (7 tests passed).
- Component test editor & card: `codes/tests/unit/writing-editor.test.tsx` (6 tests passed).
- Seluruh test suite proyek: **42 test files, 605 tests passed**.
- Typecheck: `tsc --noEmit` lulus tanpa error.
- Lint: ESLint lulus tanpa error dan tanpa warning (`--max-warnings=0`).
