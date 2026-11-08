# TASK LIST - ielts-learning-platform
**Last Updated:** 2026-11-08
**Total Tasks:** 26 (21 awal + 5 dari ADR-004/005)
**Completed:** 0 | **In Progress:** 0 | **Ready to Test:** 17 | **Superseded:** 4 | **Not Started:** 5 | **Blocked:** 0

> Pembaruan 2026-11-08: arah produk berubah (ADR-004 General Training + LLM lokal; ADR-005 aplikasi lokal satu perangkat). Task 001, 002, 018, 019, 020 digantikan; lihat bagian "Tambahan ADR-004/005" di bawah.

Urutan build mengikuti `specifications/_backlog.md` bagian 2 (W0-W8). Task dimulai hanya setelah semua dependensinya `done`. Status valid: not_started, development, ready_to_test, testing, fixing, done.

## Build Waves

| Wave | Minggu | Task |
|------|--------|------|
| W0 | 1 | 000 |
| W1 | 1-2 | 001, 002, 003, 004 |
| W2 | 3-4 | 005, 006, 007 |
| W3 | 4-5 | 008, 009 |
| W4 | 5-6 | 018, 019 |
| W5 | 6-7 | 010, 011 |
| W6 | 7-8 | 012, 013 |
| W7 | 8-9 | 014, 015 |
| W8 | 9-10 | 016, 017, 020 |

---

## Priority 0 (Critical)

- Task 000: Environment Setup
  - Spesifikasi: [spec] ../specifications/000_spec_environment_setup.md
  - Detail: [task] ./TASK-000_environment-setup/TASK-000_environment-setup.md
  - Wave: W0 | Ukuran: L | Dependensi: None
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Implementation complete: [2026-11-03 18:00] (DevOps Agent)
     - Ready to test: [2026-11-03 18:30] (PM Agent) - verifikasi Docker belum dilakukan

- Task 001: Akun dan Sesi (Auth)
  - Spesifikasi: [spec] ../specifications/001_spec_auth_session.md
  - Detail: [task] ./TASK-001_auth-session/TASK-001_auth-session.md
  - Wave: W1 | Ukuran: M | Dependensi: TASK-000
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 07:10] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 07:25] (Frontend Engineer) - UI/klien selesai terhadap kontrak; integrasi dengan backend belum diuji

- Task 002: Admin Dasar: Pengguna, Undangan, Pengaturan, Audit, Kesehatan  [SUPERSEDED oleh SPEC-025 / ADR-005; UI+API admin dihapus, diganti CLI]
  - Spesifikasi: [spec] ../specifications/002_spec_admin_users_invites.md
  - Detail: [task] ./TASK-002_admin-users-invites/TASK-002_admin-users-invites.md
  - Wave: W1 | Ukuran: M | Dependensi: TASK-000, TASK-001
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 07:10] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 07:25] (Frontend Engineer) - UI/klien selesai terhadap kontrak; integrasi dengan backend belum diuji

- Task 003: Skill Tree dan Gatekeeping Berurutan
  - Spesifikasi: [spec] ../specifications/003_spec_skill_tree_gatekeeping.md
  - Detail: [task] ./TASK-003_skill-tree-gatekeeping/TASK-003_skill-tree-gatekeeping.md
  - Wave: W1 | Ukuran: L | Dependensi: TASK-000, TASK-001
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 07:10] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 07:25] (Frontend Engineer) - peta belajar + Sheet override selesai terhadap kontrak; integrasi dengan backend belum diuji

- Task 004: Fondasi Konten: Kontrak v1.1, Seed Tier 1-4, Golden Sample
  - Spesifikasi: [spec] ../specifications/004_spec_content_foundation.md
  - Detail: [task] ./TASK-004_content-foundation/TASK-004_content-foundation.md
  - Wave: W1 | Ukuran: L | Dependensi: TASK-000
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 07:10] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 07:25] (Frontend Engineer) - spec tanpa UI baru; tidak ada pekerjaan klien (node Golden Sample tampil lewat /peta (SPEC-003))

- Task 005: Pemutar Materi Multimodal Learn-Drill-Apply
  - Spesifikasi: [spec] ../specifications/005_spec_multimodal_player.md
  - Detail: [task] ./TASK-005_multimodal-player/TASK-005_multimodal-player.md
  - Wave: W2 | Ukuran: L | Dependensi: TASK-001, TASK-003, TASK-004
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 08:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 08:30] (Frontend Engineer) - UI pemutar (artikel aman, video YouTube, slide, bukti belajar, Terapkan) selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 11:50] (Backend Engineer)
     - Backend Ready: [2026-11-03 11:58] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji

- Task 006: Mesin Soal Multi-Format dan Active Drill
  - Spesifikasi: [spec] ../specifications/006_spec_question_engine_active_drill.md
  - Detail: [task] ./TASK-006_question-engine-active-drill/TASK-006_question-engine-active-drill.md
  - Wave: W2 | Ukuran: XL | Dependensi: TASK-001, TASK-003, TASK-004, TASK-005
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 08:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 08:30] (Frontend Engineer) - UI mesin soal 12 tipe, Active Drill, hasil, ExamShell/Navigator selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 11:50] (Backend Engineer)
     - Backend Ready: [2026-11-03 11:58] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji

- Task 007: Resume Last Learned dan Dashboard
  - Spesifikasi: [spec] ../specifications/007_spec_resume_last_learned.md
  - Detail: [task] ./TASK-007_resume-last-learned/TASK-007_resume-last-learned.md
  - Wave: W2 | Ukuran: M | Dependensi: TASK-001, TASK-003, TASK-005, TASK-006
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 08:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 08:30] (Frontend Engineer) - ResumeCard, dashboard, PositionRecorder, pemulihan posisi selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 11:50] (Backend Engineer)
     - Backend Ready: [2026-11-03 11:58] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji

- Task 008: Skip Test Modul dan Tier
  - Spesifikasi: [spec] ../specifications/008_spec_skip_test.md
  - Detail: [task] ./TASK-008_skip-test/TASK-008_skip-test.md
  - Wave: W3 | Ukuran: M | Dependensi: TASK-003, TASK-004, TASK-006
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 09:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 09:30] (Frontend Engineer) - UI intro/ujian berjalan/hasil Skip, tombol peta dengan konfirmasi selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 12:30] (Backend Engineer)
     - Backend Ready: [2026-11-03 12:30] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji

- Task 009: Konverter Band IELTS dan Overall Band
  - Spesifikasi: [spec] ../specifications/009_spec_band_converter.md
  - Detail: [task] ./TASK-009_band-converter/TASK-009_band-converter.md
  - Wave: W3 | Ukuran: M | Dependensi: TASK-001, TASK-002
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 09:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 09:30] (Frontend Engineer) - Komponen band bersama + admin /admin/band selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 12:30] (Backend Engineer)
     - Backend Ready: [2026-11-03 12:30] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji

- Task 018: Admin Sumber Konten dan Aset Berlisensi  [SUPERSEDED oleh SPEC-025 / ADR-005; UI+API admin dihapus, diganti CLI]
  - Spesifikasi: [spec] ../specifications/018_spec_asset_license_management.md
  - Detail: [task] ./TASK-018_asset-license-management/TASK-018_asset-license-management.md
  - Wave: W4 | Ukuran: L | Dependensi: TASK-001, TASK-002, TASK-004
  - Current Status: in_progress
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 14:00] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 14:30] (Frontend Engineer) - Admin Sumber & Aset (daftar, unggah, tautan eksternal, detail, verifikasi hak, banner lisensi) selesai terhadap kontrak; integrasi backend belum diuji

- Task 019: Admin Bulk Importer JSON/CSV  [SUPERSEDED oleh SPEC-025 / ADR-005; UI+API admin dihapus, diganti CLI]
  - Spesifikasi: [spec] ../specifications/019_spec_bulk_importer.md
  - Detail: [task] ./TASK-019_bulk-importer/TASK-019_bulk-importer.md
  - Wave: W4 | Ukuran: XL | Dependensi: TASK-000, TASK-002, TASK-004, TASK-018
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 14:00] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 14:30] (Frontend Engineer) - Importer 4 langkah + riwayat + rollback selesai terhadap kontrak; integrasi backend belum diuji
     - Fullstack & QA Ready: [2026-11-04 13:50] (Developer Agent) - Backend worker + import API routes + 45 tests lulus, status ready_to_test

- Task 010: Split-Screen Reading dengan Highlighter
  - Spesifikasi: [spec] ../specifications/010_spec_split_screen_reading.md
  - Detail: [task] ./TASK-010_split-screen-reading/TASK-010_split-screen-reading.md
  - Wave: W5 | Ukuran: M | Dependensi: TASK-004, TASK-006
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Dev Started: [2026-11-04 08:45] (Orchestrator)
     - Dev & QA Ready: [2026-11-04 08:55] (Orchestrator) - Fullstack Reading Workspace + parser selesai, QA lulus (535 tes lulus)

- Task 011: Listening dengan Audio Terkunci Mode Ujian
  - Spesifikasi: [spec] ../specifications/011_spec_listening_exam_player.md
  - Detail: [task] ./TASK-011_listening-exam-player/TASK-011_listening-exam-player.md
  - Wave: W5 | Ukuran: M | Dependensi: TASK-004, TASK-006
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Dev Started: [2026-11-04 09:00] (Orchestrator) - Backend audio streaming & Frontend listening player in progress
     - Dev & QA Ready: [2026-11-04 09:25] (Orchestrator) - Backend audio streaming + Frontend ListeningPlayer selesai, QA lulus (563 tes lulus)

- Task 014: Boss Stage (Gerbang Tier Berskor Band)
  - Spesifikasi: [spec] ../specifications/014_spec_boss_stage.md
  - Detail: [task] ./TASK-014_boss-stage/TASK-014_boss-stage.md
  - Wave: W7 | Ukuran: XL | Dependensi: TASK-003, TASK-004, TASK-006, TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-013
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Dev & QA Ready: [2026-11-04 11:38] (Orchestrator) - Tier Boss handler, multi-section UI, section endpoints, gatekeeping, 18 tests passing

- Task 017: Radar 6 Sumbu dan Prediksi Band
  - Spesifikasi: [spec] ../specifications/017_spec_radar_band_predictor.md
  - Detail: [task] ./TASK-017_radar-band-predictor/TASK-017_radar-band-predictor.md
  - Wave: W8 | Ukuran: L | Dependensi: TASK-006, TASK-007, TASK-009, TASK-012, TASK-013, TASK-014
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Implementation Complete: [2026-11-04 13:15] (Developer Agent)

## Priority 1 (High)

- Task 012: Penilaian AI Writing dan Mini-Task Writing
  - Spesifikasi: [spec] ../specifications/012_spec_ai_writing.md
  - Detail: [task] ./TASK-012_ai-writing/TASK-012_ai-writing.md
  - Wave: W6 | Ukuran: XL | Dependensi: TASK-000, TASK-001, TASK-002, TASK-005, TASK-006, TASK-009
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Implementation Complete: [2026-11-04 10:15] (Developer Agent) - Evaluasi AI Writing, deteksi injeksi, live word counter, 22 unit tests lulus

- Task 013: Penilaian AI Speaking (Rekam, STT)
  - Spesifikasi: [spec] ../specifications/013_spec_ai_speaking.md
  - Detail: [task] ./TASK-013_ai-speaking/TASK-013_ai-speaking.md
  - Wave: W6 | Ukuran: XL | Dependensi: TASK-001, TASK-005, TASK-006, TASK-012
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Implementation Complete: [2026-11-04 10:45] (Developer Agent) - Perekaman WebM, Whisper STT, evaluasi Ollama speaking, consent dialog, 22 unit & component tests lulus

- Task 015: Placement Test Adaptif 25 Soal
  - Spesifikasi: [spec] ../specifications/015_spec_placement_test.md
  - Detail: [task] ./TASK-015_placement-test/TASK-015_placement-test.md
  - Wave: W7 | Ukuran: L | Dependensi: TASK-003, TASK-004, TASK-006, TASK-007, TASK-008
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Implementation Complete: [2026-11-04 12:15] (Fullstack Agent) - Backend handler, adaptif staircase D3, D4 rekomendasi, endpoint GET/POST, UI runner & result view selesai dan terverifikasi 100%.

- Task 016: Gamifikasi: Mahkota, Poin, Speed Streak, Streak Harian
  - Spesifikasi: [spec] ../specifications/016_spec_gamification.md
  - Detail: [task] ./TASK-016_gamification/TASK-016_gamification.md
  - Wave: W8 | Ukuran: M | Dependensi: TASK-001, TASK-003, TASK-005, TASK-006, TASK-014
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Implementation Complete: [2026-11-04 12:43] (Developer Agent)

- Task 020: Admin Kurasi Konten  [SUPERSEDED oleh SPEC-025 / ADR-005; UI+API admin dihapus, diganti CLI]
  - Spesifikasi: [spec] ../specifications/020_spec_content_curation.md
  - Detail: [task] ./TASK-020_content-curation/TASK-020_content-curation.md
  - Wave: W8 | Ukuran: L | Dependensi: TASK-002, TASK-004, TASK-018, TASK-019
  - Current Status: ready_to_test
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Implementation Complete: [2026-11-04 13:52] (Developer Agent) - Fullstack kurasi konten, manajemen status & transisi, verifikasi AI, revisi snapshot, analisis kualitas soal, 24 unit tests lulus, siap uji manual

## Priority 2 (Medium)

(Tidak ada)

## Priority 3 (Low)

(Tidak ada)
     - Backend Dev: [2026-11-03 07:55] (Backend Engineer)
     - Backend Ready: [2026-11-03 07:55] (Backend Engineer) - auth/sesi/withApi; 36 tes integrasi lulus; FE+BE siap QA
     - Backend Dev: [2026-11-03 07:55] (Backend Engineer)
     - Backend Ready: [2026-11-03 07:55] (Backend Engineer) - 12 endpoint admin + anonimisasi; 17 tes integrasi lulus; FE+BE siap QA
     - Backend Dev: [2026-11-03 07:55] (Backend Engineer)
     - Backend Ready: [2026-11-03 07:55] (Backend Engineer) - GatekeepingService + tree + override; 24 tes integrasi lulus; FE+BE siap QA
     - Backend Dev: [2026-11-03 07:55] (Backend Engineer)
     - Backend Partial: [2026-11-03 07:55] (Backend Engineer) - seed/kontrak/validator/CLI/publish selesai dan teruji; Golden Sample (GS-1..6) belum dibuat sehingga task belum ready_to_test

---

## Tambahan ADR-004/005 (2026-11-08)

Pekerjaan berikut dikerjakan Orchestrator langsung (tanpa `/build-feature`), dengan tes dan peninjauan di sesi yang sama. Belum melewati gerbang QA formal.

- Task 001 (Auth) [SUPERSEDED oleh SPEC-025]: login/daftar/ganti-password/undangan dihapus; diganti profil lokal.
- Task 025a: SPEC-025 Fase 1 - Profil lokal tanpa login. Status: **ready_to_test** (commit e8bc1e0).
- Task 025b: SPEC-025 Fase 2 - Hapus admin, ganti CLI (`profile:*`, `progress:*`, `points:*`, `settings:*`, `band:*`, `doctor`). Status: **ready_to_test**.
- Task 025c: SPEC-025 Fase 3 - SQLite + antrean dalam proses. Status: **not_started**.
- Task 025d: SPEC-025 Fase 4 - Satu perintah menjalankan (`start:local`). Status: **not_started**.
- ADR-004 (selesai, ready_to_test): driver llama.cpp, prompt Writing General Training, UI Writing, Speaking via prompt eksternal + input skor, bank soal GT (71 soal), tag `exam_module`, tabel band `READING_GENERAL`, modul ajar 3.3.3.
- SPEC-021 Jalur Belajar: **not_started** (draf). SPEC-022 Bank Soal + Mix Builder: **not_started** (draf). SPEC-023 Simulasi Tes per section: **not_started** (draf). SPEC-024 Listening (skrip + TTS lokal): **not_started** (draf).
