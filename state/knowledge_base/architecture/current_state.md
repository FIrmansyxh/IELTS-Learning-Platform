# CURRENT STATE ARCHITECTURE: ielts-learning-platform

**Owner Agent:** SysArch
**Date:** 2026-11-03
**Phase:** Planning (Fase 1, langkah 4)
**Status:** `Approved` (didelegasikan, lihat ADR-003)
**WORK_DEPTH:** standard

> Proyek ini greenfield: belum ada `codes/`, `prisma/`, `docker-compose.yml`, atau `task/`. Dokumen ini merangkum keadaan awal dan baseline yang dipakai untuk desain infrastruktur. Acuan: `project_overview.md`, `state/knowledge_base/requirements/requirements.md`.

## 1. Ringkasan Teknologi (dari project_overview.md)
| Lapisan | Pilihan | Status |
|---|---|---|
| Runtime / bahasa | Node.js 22 LTS, TypeScript 5.x | ASUMSI (versi) |
| Web | Next.js App Router + React 19, Tailwind 4, shadcn/ui | Disepakati (Tailwind+shadcn), lainnya ASUMSI |
| DB | PostgreSQL 16 (Docker), Drizzle ORM + drizzle-kit | DISETUJUI |
| Auth | Auth.js Credentials, cookie httpOnly, argon2/bcrypt | DISETUJUI |
| Antrean job | pg-boss (di Postgres), worker Node terpisah, 1 job AI aktif | DISETUJUI |
| LLM | Ollama (REST 11434), JSON schema output, model dikonfigurasi env | Model = Open Question |
| STT | whisper.cpp sebagai service HTTP, model base/small terkuantisasi | ASUMSI |
| Aset | Filesystem (volume Docker), MinIO opsional | Disepakati |
| Video | YouTube IFrame API (embed, tanpa unduh) | Disepakati |
| Infra | Docker Compose di satu mesin lokal | Disepakati |

## 2. Metrik Kompleksitas (baseline, belum ada kode)
- Tabel DB terencana (PRD 7.2): 7 inti (`tiers`, `modules`, `sub_modules`, `learning_materials`, `assessment_sets`, `user_last_learned_state`, `user_sub_module_progress`) ditambah tabel yang akan diturunkan Data Architect: users/sessions, submission AI, band_conversion, content_sources, tabel pg-boss (skema `pgboss`, dikelola pustaka). Perkiraan akhir: 15 sampai 25 tabel.
- Endpoint API: belum ada. Perkiraan 40 sampai 60 route handler/server action (auth, kurikulum, progres, asesmen, submission, admin importer).
- Operasi berat sumber daya: (1) penilaian Writing via LLM, (2) transkripsi + penilaian Speaking (STT lalu LLM), (3) bulk importer JSON/CSV, (4) unggah rekaman audio.
- Integrasi pihak ketiga: hanya YouTube IFrame API (klien, bukan server). Semua lainnya lokal.

## 3. Kebutuhan Penyimpanan Aset
Slide WebP/PNG, dokumen PDF/DOCX, audio Listening, rekaman Speaking pengguna, serta bobot model (Ollama dan whisper). Detail angka: lihat `capacity_planning.md`.

## 4. Analisis Setup Docker Saat Ini
Belum ada. `docker-compose.yml` akan dibuat pada spesifikasi 000 (environment setup) mengikuti desain di `infrastructure.md`.

## 5. Host Saat Ini
Pengembangan berlangsung di Windows 11 (Home) per metadata sesi. Implikasi: Docker Desktop dengan backend WSL2; GPU passthrough ke container hanya praktis untuk NVIDIA. RAM/GPU host belum diketahui (lihat Open Question OQ-1 di `infrastructure.md`).

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-03 | SysArch | Dokumen dibuat (greenfield baseline) |
