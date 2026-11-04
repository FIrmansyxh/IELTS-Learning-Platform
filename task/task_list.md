# TASK LIST - ielts-learning-platform
**Last Updated:** 2026-11-03 13:45
**Total Tasks:** 21
**Completed:** 0 | **In Progress:** 1 | **Ready to Test:** 11 | **Not Started:** 9 | **Blocked:** 0

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
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Implementation complete: [2026-11-03 18:00] (DevOps Agent)
     - Ready to test: [2026-11-03 18:30] (PM Agent) - verifikasi Docker belum dilakukan
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-000/test_report.md

- Task 001: Akun dan Sesi (Auth)
  - Spesifikasi: [spec] ../specifications/001_spec_auth_session.md
  - Detail: [task] ./TASK-001_auth-session/TASK-001_auth-session.md
  - Wave: W1 | Ukuran: M | Dependensi: TASK-000
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 07:10] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 07:25] (Frontend Engineer) - UI/klien selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Issues Reported: [2026-11-03 18:35] (Test Agent) - D-001; lihat e2e_report.md
     - Fixing Issues: [2026-11-03 19:00] (Fixer Agent)
     - Ready to Test: [2026-11-03 19:05] (Fixer Agent) - perbaikan E2E Fase 3; lihat fixing_log.md
     - Done: [2026-11-03 19:30] (Test Agent) - run penuh bersih Fase 3 (105 lulus/0 gagal/1 skip + fase AI mati lulus); lihat e2e_report.md

- Task 002: Admin Dasar: Pengguna, Undangan, Pengaturan, Audit, Kesehatan
  - Spesifikasi: [spec] ../specifications/002_spec_admin_users_invites.md
  - Detail: [task] ./TASK-002_admin-users-invites/TASK-002_admin-users-invites.md
  - Wave: W1 | Ukuran: M | Dependensi: TASK-000, TASK-001
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 07:10] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 07:25] (Frontend Engineer) - UI/klien selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Issues Reported: [2026-11-03 18:35] (Test Agent) - D-005; lihat e2e_report.md
     - Fixing Issues: [2026-11-03 19:00] (Fixer Agent)
     - Ready to Test: [2026-11-03 19:05] (Fixer Agent) - perbaikan E2E Fase 3; lihat fixing_log.md
     - Done: [2026-11-03 19:30] (Test Agent) - run penuh bersih Fase 3 (105 lulus/0 gagal/1 skip + fase AI mati lulus); lihat e2e_report.md

- Task 003: Skill Tree dan Gatekeeping Berurutan
  - Spesifikasi: [spec] ../specifications/003_spec_skill_tree_gatekeeping.md
  - Detail: [task] ./TASK-003_skill-tree-gatekeeping/TASK-003_skill-tree-gatekeeping.md
  - Wave: W1 | Ukuran: L | Dependensi: TASK-000, TASK-001
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 07:10] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 07:25] (Frontend Engineer) - peta belajar + Sheet override selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Issues Reported: [2026-11-03 18:35] (Test Agent) - D-001, D-004; lihat e2e_report.md
     - Fixing Issues: [2026-11-03 19:00] (Fixer Agent)
     - Ready to Test: [2026-11-03 19:05] (Fixer Agent) - perbaikan E2E Fase 3; lihat fixing_log.md
     - Done: [2026-11-03 19:30] (Test Agent) - run penuh bersih Fase 3 (105 lulus/0 gagal/1 skip + fase AI mati lulus); lihat e2e_report.md

- Task 004: Fondasi Konten: Kontrak v1.1, Seed Tier 1-4, Golden Sample
  - Spesifikasi: [spec] ../specifications/004_spec_content_foundation.md
  - Detail: [task] ./TASK-004_content-foundation/TASK-004_content-foundation.md
  - Wave: W1 | Ukuran: L | Dependensi: TASK-000
  - Current Status: development
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 07:10] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 07:25] (Frontend Engineer) - spec tanpa UI baru; tidak ada pekerjaan klien (node Golden Sample tampil lewat /peta (SPEC-003))
     - Testing: [2026-11-03 18:35] (Test Agent) - E2E fondasi lulus (6/6); task tetap development (konten Golden Sample menunggu pemilik)

- Task 005: Pemutar Materi Multimodal Learn-Drill-Apply
  - Spesifikasi: [spec] ../specifications/005_spec_multimodal_player.md
  - Detail: [task] ./TASK-005_multimodal-player/TASK-005_multimodal-player.md
  - Wave: W2 | Ukuran: L | Dependensi: TASK-001, TASK-003, TASK-004
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 08:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 08:30] (Frontend Engineer) - UI pemutar (artikel aman, video YouTube, slide, bukti belajar, Terapkan) selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 11:50] (Backend Engineer)
     - Backend Ready: [2026-11-03 11:58] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Issues Reported: [2026-11-03 18:35] (Test Agent) - D-001, D-002; lihat e2e_report.md
     - Fixing Issues: [2026-11-03 19:00] (Fixer Agent)
     - Ready to Test: [2026-11-03 19:05] (Fixer Agent) - perbaikan E2E Fase 3; lihat fixing_log.md
     - Done: [2026-11-03 19:30] (Test Agent) - run penuh bersih Fase 3 (105 lulus/0 gagal/1 skip + fase AI mati lulus); lihat e2e_report.md

- Task 006: Mesin Soal Multi-Format dan Active Drill
  - Spesifikasi: [spec] ../specifications/006_spec_question_engine_active_drill.md
  - Detail: [task] ./TASK-006_question-engine-active-drill/TASK-006_question-engine-active-drill.md
  - Wave: W2 | Ukuran: XL | Dependensi: TASK-001, TASK-003, TASK-004, TASK-005
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 08:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 08:30] (Frontend Engineer) - UI mesin soal 12 tipe, Active Drill, hasil, ExamShell/Navigator selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 11:50] (Backend Engineer)
     - Backend Ready: [2026-11-03 11:58] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-006/test_report.md

- Task 007: Resume Last Learned dan Dashboard
  - Spesifikasi: [spec] ../specifications/007_spec_resume_last_learned.md
  - Detail: [task] ./TASK-007_resume-last-learned/TASK-007_resume-last-learned.md
  - Wave: W2 | Ukuran: M | Dependensi: TASK-001, TASK-003, TASK-005, TASK-006
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 08:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 08:30] (Frontend Engineer) - ResumeCard, dashboard, PositionRecorder, pemulihan posisi selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 11:50] (Backend Engineer)
     - Backend Ready: [2026-11-03 11:58] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Issues Reported: [2026-11-03 18:35] (Test Agent) - D-004 (axe pada /); lihat e2e_report.md
     - Fixing Issues: [2026-11-03 19:00] (Fixer Agent)
     - Ready to Test: [2026-11-03 19:05] (Fixer Agent) - perbaikan E2E Fase 3; lihat fixing_log.md
     - Done: [2026-11-03 19:30] (Test Agent) - run penuh bersih Fase 3 (105 lulus/0 gagal/1 skip + fase AI mati lulus); lihat e2e_report.md

- Task 008: Skip Test Modul dan Tier
  - Spesifikasi: [spec] ../specifications/008_spec_skip_test.md
  - Detail: [task] ./TASK-008_skip-test/TASK-008_skip-test.md
  - Wave: W3 | Ukuran: M | Dependensi: TASK-003, TASK-004, TASK-006
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 09:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 09:30] (Frontend Engineer) - UI intro/ujian berjalan/hasil Skip, tombol peta dengan konfirmasi selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 12:30] (Backend Engineer)
     - Backend Ready: [2026-11-03 12:30] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-008/test_report.md

- Task 009: Konverter Band IELTS dan Overall Band
  - Spesifikasi: [spec] ../specifications/009_spec_band_converter.md
  - Detail: [task] ./TASK-009_band-converter/TASK-009_band-converter.md
  - Wave: W3 | Ukuran: M | Dependensi: TASK-001, TASK-002
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 09:30] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 09:30] (Frontend Engineer) - Komponen band bersama + admin /admin/band selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Dev: [2026-11-03 12:30] (Backend Engineer)
     - Backend Ready: [2026-11-03 12:30] (Backend Engineer) - API server selesai + unit/integration lulus; E2E belum diuji
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-009/test_report.md

- Task 018: Admin Sumber Konten dan Aset Berlisensi
  - Spesifikasi: [spec] ../specifications/018_spec_asset_license_management.md
  - Detail: [task] ./TASK-018_asset-license-management/TASK-018_asset-license-management.md
  - Wave: W4 | Ukuran: L | Dependensi: TASK-001, TASK-002, TASK-004
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 14:00] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 14:30] (Frontend Engineer) - Admin Sumber & Aset (daftar, unggah, tautan eksternal, detail, verifikasi hak, banner lisensi) selesai terhadap kontrak; integrasi backend belum diuji
     - Backend Dev: [2026-11-03 12:40] (Backend Engineer)
     - Backend Ready: [2026-11-03 12:40] (Backend Engineer) - API sumber/aset/lisensi selesai; tsc/eslint/vitest/integration lulus; E2E belum diuji
     - Backend Fix QA: [2026-11-03 13:45] (Backend Engineer) - perbaikan temuan QA W4 selesai; menunggu QA ulang/Tester
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-018/test_report.md

- Task 019: Admin Bulk Importer JSON/CSV
  - Spesifikasi: [spec] ../specifications/019_spec_bulk_importer.md
  - Detail: [task] ./TASK-019_bulk-importer/TASK-019_bulk-importer.md
  - Wave: W4 | Ukuran: XL | Dependensi: TASK-000, TASK-002, TASK-004, TASK-018
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 14:00] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 14:30] (Frontend Engineer) - Importer 4 langkah + riwayat + rollback selesai terhadap kontrak; integrasi backend belum diuji
     - Backend Dev: [2026-11-03 12:40] (Backend Engineer)
     - Backend Ready: [2026-11-03 12:40] (Backend Engineer) - API impor + worker import-validate/import-publish + rollback selesai; tsc/eslint/vitest/integration lulus; E2E belum diuji
     - Backend Fix QA: [2026-11-03 13:45] (Backend Engineer) - perbaikan temuan QA W4 selesai; menunggu QA ulang/Tester
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-019/test_report.md

- Task 010: Split-Screen Reading dengan Highlighter
  - Spesifikasi: [spec] ../specifications/010_spec_split_screen_reading.md
  - Detail: [task] ./TASK-010_split-screen-reading/TASK-010_split-screen-reading.md
  - Wave: W5 | Ukuran: M | Dependensi: TASK-004, TASK-006
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Backend Dev: [2026-11-03 13:15] (Backend Engineer)
     - Backend Ready: [2026-11-03 13:15] (Backend Engineer) - audit: kontrak data (passage_markdown/passage_no) dan validator server sudah ada; ditambah tes unit+integrasi; tidak ada endpoint/perubahan kontrak
     - Frontend Dev: [2026-11-03 13:00] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 13:20] (Frontend Engineer) - ReadingWorkspace split-screen
     - Frontend Fix QA: [2026-11-03 14:10] (Frontend Engineer) - F-10-03/04/07 diperbaiki; sisanya ditunda (dev_log) + highlighter + parsePassages + backoff simpan selesai terhadap kontrak; integrasi dengan backend nyata dan E2E belum diuji
     - Backend Fix QA W5: [2026-11-03 14:30] (Backend Engineer) - F-10-01 diperbaiki (passage-core bersama server+klien, empty_passage, tes paritas); tsc/eslint/vitest/test:integration hijau
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Issues Reported: [2026-11-03 18:35] (Test Agent) - D-003; lihat e2e_report.md
     - Fixing Issues: [2026-11-03 19:00] (Fixer Agent)
     - Ready to Test: [2026-11-03 19:05] (Fixer Agent) - perbaikan E2E Fase 3; lihat fixing_log.md
     - Done: [2026-11-03 19:30] (Test Agent) - run penuh bersih Fase 3 (105 lulus/0 gagal/1 skip + fase AI mati lulus); lihat e2e_report.md

- Task 011: Listening dengan Audio Terkunci Mode Ujian
  - Spesifikasi: [spec] ../specifications/011_spec_listening_exam_player.md
  - Detail: [task] ./TASK-011_listening-exam-player/TASK-011_listening-exam-player.md
  - Wave: W5 | Ukuran: M | Dependensi: TASK-004, TASK-006
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Backend Dev: [2026-11-03 13:15] (Backend Engineer)
     - Backend Ready: [2026-11-03 13:15] (Backend Engineer) - GET /attempts/{id}/audio (Range, 200/206/416, deadline+status+section Boss) selesai + tes unit/integrasi; E2E/CSP belum diuji
     - Frontend Dev: [2026-11-03 13:00] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 13:20] (Frontend Engineer) - ListeningPlayer terkunci
     - Frontend Fix QA: [2026-11-03 14:10] (Frontend Engineer) - F-11-01/04 diperbaiki, spec 011 dan design-system 5.14 diperbarui mode ujian + pra-cek audio + Section Tabs selesai terhadap kontrak; deviasi aria-readonly dicatat; audio nyata/E2E belum diuji
     - Backend Fix QA W5: [2026-11-03 14:30] (Backend Engineer) - F-11-02 (audio_stream 60/menit, 4 serentak, 6 tanpa Range/attempt) dan F-11-03 (listening null bila tak dapat dilayani) diperbaiki; tsc/eslint/vitest/test:integration hijau
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-011/test_report.md

- Task 014: Boss Stage (Gerbang Tier Berskor Band)
  - Spesifikasi: [spec] ../specifications/014_spec_boss_stage.md
  - Detail: [task] ./TASK-014_boss-stage/TASK-014_boss-stage.md
  - Wave: W7 | Ukuran: XL | Dependensi: TASK-003, TASK-004, TASK-006, TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-013
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 14:20] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 14:50] (Frontend Engineer) - intro Boss, layar transisi section (SectionGate/SectionDone), section Listening/Reading memakai ExamSession (audio ?section=), Writing/Speaking memakai WritingTask/SpeakingTask dengan attempt_id/question_id, hasil band per section + gerbang + estimasi Overall + polling pending_ai 10 dtk maks 10 menit selesai terhadap kontrak; integrasi dengan backend belum diuji; tsc/eslint bersih, vitest 59 berkas 893 tes lulus
     - Frontend QA Fix: [2026-11-03 15:20] (Frontend Engineer) - F-14-07 beforeunload merata, F-14-08 tautan umpan balik memakai submission terbaru (fallback), tes waktu-habis W/S; F-14-09 menunggu field ai_status backend
     - Frontend QA Fix (W7 lanjutan): [2026-11-03 16:05] (Frontend Engineer) - F-14-08/09 ditutup: tautan umpan balik Boss memakai graded_submission_id ?? latest_submission_id (fallback submission_ids), kartu W/S membedakan 'menunggu AI' vs 'tanpa band' lewat ai_status; 2 tes baru
     - Backend Dev: [2026-11-03 15:00] (Backend Engineer)
     - Backend Ready: [2026-11-03 15:00] (Backend Engineer) - Backend: sections start/submit, penilaian band L+R, gerbang Tier (applyBossResult), estimasi Overall (D8), audit BOSS_PASSED/FAILED selesai; tsc/eslint bersih, vitest 59 berkas/893 tes, test:integration 19 berkas/461 tes lulus; E2E dan Boss hasil impor belum diverifikasi
     - Backend Fix QA W7: [2026-11-03 15:40] (Backend Engineer) - F-14-01 (migrasi 0009 unik + guard + blocker publish), F-14-02, F-14-03, F-14-05, F-14-08/09 (field aditif boss.sections[].latest_submission_id/graded_submission_id/ai_status) diperbaiki; sisanya ditunda (ADR-003 #32); tsc/eslint bersih, vitest 905 tes, test:integration 484 tes lulus
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-014/test_report.md

- Task 017: Radar 6 Sumbu dan Prediksi Band
  - Spesifikasi: [spec] ../specifications/017_spec_radar_band_predictor.md
  - Detail: [task] ./TASK-017_radar-band-predictor/TASK-017_radar-band-predictor.md
  - Wave: W8 | Ukuran: L | Dependensi: TASK-006, TASK-007, TASK-009, TASK-012, TASK-013, TASK-014
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 15:40] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 16:05] (Frontend Engineer) - radar SVG 6 sumbu + target + singkatan <400px + tabel alternatif, kartu Prediksi (Indikatif/lengkap), RadarCard dashboard, /riwayat/ujian (grafik Perkembangan Band + tabel + filter), tab Ujian|Penilaian AI, navigasi Riwayat aktif selesai terhadap kontrak; integrasi/E2E belum diuji; tsc bersih, vitest 65 berkas 1051 tes lulus
     - Backend Dev: [2026-11-03 17:30] (Backend Engineer)
     - Backend Ready: [2026-11-03 17:55] (Backend Engineer) - SkillScoreService (R1-R5), `evaluationGradedHooks` terisi, `GET /me/skills/radar`, `/me/band-predictions`, `/me/exam-history` (radar 2 query SQL); tsc/eslint bersih, vitest 66 berkas/1063 tes, test:integration 22 berkas/576 tes lulus; E2E belum diverifikasi
     - Frontend Fix QA W8: [2026-11-03 19:00] (Frontend Engineer) - F-17-03 (EstimasiNotice di /riwayat/ujian, titik indikatif berbentuk belah ketupat berongga + kolom Jenis + legenda, proksi Grammar/Vocab bertanda * pada radar), F-17-02 sisi klien (sample_size + lencana "Sampel kecil (n)" dari low_sample); tsc/eslint bersih, vitest 66 berkas/1086 tes lulus
     - Backend Fix QA W8: [2026-11-03 20:00] (Backend Engineer) - F-17-01 (R1 dedupe per soal unik), F-17-02 (min sampel 10, rentang menurut sampel, prediction.sample_size/low_sample; ADR-003 #36, spec 017 diamandemen, perlu tinjauan human) diperbaiki; F-17-03 data diverifikasi; F-17-05/06/11/12 ditunda; tsc/eslint bersih, vitest 1086, test:integration 23 berkas/593 tes lulus
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-017/test_report.md

## Priority 1 (High)

- Task 012: Penilaian AI Writing dan Mini-Task Writing
  - Spesifikasi: [spec] ../specifications/012_spec_ai_writing.md
  - Detail: [task] ./TASK-012_ai-writing/TASK-012_ai-writing.md
  - Wave: W6 | Ukuran: XL | Dependensi: TASK-000, TASK-001, TASK-002, TASK-005, TASK-006, TASK-009
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Backend Dev: [2026-11-03 14:20] (Backend Engineer)
     - Frontend Dev: [2026-11-03 14:00] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 14:30] (Frontend Engineer) - UI editor Writing, status job, EvaluationCard, fallback self-assessment, kuota, riwayat penilaian selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Ready: [2026-11-03 14:20] (Backend Engineer) - endpoint #43-#49 + pipeline AI Writing (mock LLM) + kuota/antrean/fallback/purge selesai; 44 tes integrasi + unit + set injeksi 14 kasus; OllamaClient hanya diuji dengan server HTTP palsu; benchmark C-09 belum dilakukan
     - Frontend Fix (QA W6): [2026-11-03 14:45] (Frontend Engineer) - F-12-04 draf/ai-sub per-user + TTL + dibersihkan saat logout/401/GRADED, F-12-10 dev_log [FRONTEND] dipulihkan, F-13-11 deviasi dicatat; tsc/eslint bersih, vitest 53 berkas 786 tes lulus
     - Backend QA Fix: [2026-11-03 14:40] (Backend Engineer) - perbaikan QA W6: F-12-01 (deteksi injeksi), F-12-02 (pemulihan job tiap 2 menit), F-12-03 (isolasi tugas retensi), F-12-05 (guard status simpan); tsc/eslint bersih, vitest 786 lulus, test:integration 404 lulus
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-012/test_report.md

- Task 013: Penilaian AI Speaking (Rekam, STT)
  - Spesifikasi: [spec] ../specifications/013_spec_ai_speaking.md
  - Detail: [task] ./TASK-013_ai-speaking/TASK-013_ai-speaking.md
  - Wave: W6 | Ukuran: XL | Dependensi: TASK-001, TASK-005, TASK-006, TASK-012
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Backend Dev: [2026-11-03 14:20] (Backend Engineer)
     - Frontend Dev: [2026-11-03 14:00] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 14:30] (Frontend Engineer) - UI perekam Speaking, persetujuan rekaman, unggah, status dua tahap, hasil, hapus rekaman, fallback selesai terhadap kontrak; integrasi dengan backend belum diuji
     - Backend Ready: [2026-11-03 14:20] (Backend Engineer) - endpoint #50-#55 + STT/penilaian Speaking (mock) + retensi/purge rekaman selesai; 37 tes integrasi (ffmpeg/ffprobe nyata); WhisperCppClient hanya diuji dengan server HTTP palsu; benchmark C-09 dan perekaman peramban belum diuji
     - Frontend Fix (QA W6): [2026-11-03 14:45] (Frontend Engineer) - F-12-04 draf/ai-sub per-user + TTL + dibersihkan saat logout/401/GRADED, F-12-10 dev_log [FRONTEND] dipulihkan, F-13-11 deviasi dicatat; tsc/eslint bersih, vitest 53 berkas 786 tes lulus
     - Backend QA Fix: [2026-11-03 14:40] (Backend Engineer) - perbaikan QA W6: F-13-01 (HIGH: durasi otoritatif dari WAV, ffmpeg -t/-fs, format dipaksa, tmpfs 128m, STT timeout terbatas), F-13-02 (keep_recordings=false pada jalur gagal), F-13-06 (sebagian); CSP F-13-03 ditunda ke Fase 4; tsc/eslint bersih, vitest 786 lulus, test:integration 404 lulus
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-013/test_report.md

- Task 015: Placement Test Adaptif 25 Soal
  - Spesifikasi: [spec] ../specifications/015_spec_placement_test.md
  - Detail: [task] ./TASK-015_placement-test/TASK-015_placement-test.md
  - Wave: W7 | Ukuran: L | Dependensi: TASK-003, TASK-004, TASK-006, TASK-007, TASK-008
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 14:20] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 14:50] (Frontend Engineer) - sesi adaptif satu-soal, hasil + rekomendasi Tier, penerapan /placement/apply dengan konfirmasi, titik masuk di dashboard dan /peta selesai terhadap kontrak; integrasi dengan backend belum diuji; tsc/eslint bersih, vitest 59 berkas 893 tes lulus
     - Backend Dev: [2026-11-03 15:00] (Backend Engineer)
     - Backend Ready: [2026-11-03 15:00] (Backend Engineer) - Backend: GET /placement, placement adaptif staircase, rekomendasi, POST /placement/apply selesai; tsc/eslint bersih, vitest 59 berkas/893 tes, test:integration 19 berkas/461 tes lulus; E2E dan set hasil impor belum diverifikasi
     - Backend Fix QA W7: [2026-11-03 15:40] (Backend Engineer) - F-15-01 (batas bukti rekomendasi; D4 + ADR-003 #30, perlu tinjauan human), F-15-03, F-15-04, F-15-05, F-15-08 diperbaiki; F-15-02/06/07 ditunda; tsc/eslint bersih, vitest 905 tes, test:integration 484 tes lulus
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-015/test_report.md

- Task 016: Gamifikasi: Mahkota, Poin, Speed Streak, Streak Harian
  - Spesifikasi: [spec] ../specifications/016_spec_gamification.md
  - Detail: [task] ./TASK-016_gamification/TASK-016_gamification.md
  - Wave: W8 | Ukuran: M | Dependensi: TASK-001, TASK-003, TASK-005, TASK-006, TASK-014
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 15:40] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 16:05] (Frontend Engineer) - chip header (streak/poin) di top bar, CrownBadge 16/24/48 + animasi hemat (reduced-motion), hasil Drill (poin, rincian, streak, confetti hanya Gold), StatsCard, statistik profil + Riwayat poin selesai terhadap kontrak; integrasi/E2E belum diuji; tsc bersih, vitest 65 berkas 1051 tes lulus; eslint FE bersih (3 peringatan di berkas Backend skills)
     - Backend Dev: [2026-11-03 17:00] (Backend Engineer)
     - Backend Ready: [2026-11-03 17:25] (Backend Engineer) - F-08-06 + F-14-06 diselesaikan lebih dulu; GamificationService (poin Drill/Speed/Mahkota/Boss/Mini-Task/Harian, ledger append-only + `point_ledger_once_uq` migrasi 0010), `GET /me/stats` dan `/me/points`, blok `gamification` pada hasil; tsc/eslint bersih, vitest 66 berkas/1063 tes, test:integration 22 berkas/576 tes lulus; E2E belum diverifikasi
     - Frontend Fix QA W8: [2026-11-03 19:00] (Frontend Engineer) - F-16-06 (chip poin role=status kini bernama dari teks terlihat) dan F-16-04 sisi klien (riwayat poin toleran terhadap tipe ledger tak dikenal, baris asing berlabel "Poin lainnya"); tsc/eslint bersih, vitest 66 berkas/1086 tes lulus; tidak menjalankan test:integration/E2E
     - Backend Fix QA W8: [2026-11-03 20:00] (Backend Engineer) - F-16-01 (batas manusia 2000 ms untuk kredit speed streak; ADR-003 #34, perlu tinjauan human), F-16-04 (filter ADJUSTMENT), F-16-05 (APP_TIMEZONE IANA) diperbaiki; F-16-02/03/07/08/09 ditunda; tsc/eslint bersih, vitest 1086, test:integration 23 berkas/593 tes lulus
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Done: [2026-11-03 18:35] (Test Agent) - E2E lulus; lihat TASK-016/test_report.md

- Task 020: Admin Kurasi Konten
  - Spesifikasi: [spec] ../specifications/020_spec_content_curation.md
  - Detail: [task] ./TASK-020_content-curation/TASK-020_content-curation.md
  - Wave: W8 | Ukuran: L | Dependensi: TASK-002, TASK-004, TASK-018, TASK-019
  - Current Status: done
  - Status Logs:
     - Task Created: [2026-11-03 18:30] (PM Agent)
     - Frontend Dev: [2026-11-03 15:40] (Frontend Engineer)
     - Frontend Ready: [2026-11-03 16:05] (Frontend Engineer) - /admin/konten/kurikulum (pohon, status, penghalang, sheet sub-modul/modul), /admin/konten/soal(+[set_id]) (kualitas, sheet soal, banner K3), /admin/konten/revisi, tautan Dipakai oleh (TASK-018) selesai terhadap kontrak; catatan kontrak untuk Backend di dev_log; integrasi/E2E belum diuji; tsc bersih, vitest 65 berkas 1051 tes lulus
     - Backend Dev: [2026-11-03 18:00] (Backend Engineer)
     - Backend Ready: [2026-11-03 18:25] (Backend Engineer) - CurationService + 11 endpoint admin (status K1/K2/penghalang, sunting modul/sub-modul/materi/set/soal, revisi K4, kualitas K5, pagar K3 menutup F-15-07 jalur admin); tsc/eslint bersih, vitest 66 berkas/1063 tes, test:integration 22 berkas/576 tes lulus; jalur impor SPEC-019 tidak dijaga K3; E2E belum diverifikasi
     - Frontend Fix QA W8: [2026-11-03 19:00] (Frontend Engineer) - F-20-13 (curation-contract.ts kini re-export penuh contracts/curation.ts; has_active_attempts mengunci sejak muat; SetRef.origin untuk konfirmasi AI; blocker.asset_id terstruktur tanpa regex) dan F-20-03 sisi UI (dialog publikasi impor: kotak reviu AI + confirm_reviewed); tsc/eslint bersih, vitest 66 berkas/1086 tes lulus
     - Backend Fix QA W8: [2026-11-03 20:00] (Backend Engineer) - F-20-01 (K3 modul/sub-modul + Gatekeeping toleran), F-20-02 (PRACTICE basi/beda versi -> ABANDONED), F-20-03 (confirm_reviewed pada publikasi impor), F-20-04 (satu hasActiveAttempts untuk kurasi+impor) diperbaiki; ADR-003 #37, spec 019/020 diamandemen; F-20-05..12 ditunda; tsc/eslint bersih, vitest 1086, test:integration 23 berkas/593 tes lulus

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
     - Testing: [2026-11-03 18:35] (Test Agent)
     - Issues Reported: [2026-11-03 18:35] (Test Agent) - D-004 (axe /admin/konten/kurikulum); lihat e2e_report.md
     - Fixing Issues: [2026-11-03 19:00] (Fixer Agent)
     - Ready to Test: [2026-11-03 19:05] (Fixer Agent) - perbaikan E2E Fase 3; lihat fixing_log.md
     - Done: [2026-11-03 19:30] (Test Agent) - run penuh bersih Fase 3 (105 lulus/0 gagal/1 skip + fase AI mati lulus); lihat e2e_report.md
