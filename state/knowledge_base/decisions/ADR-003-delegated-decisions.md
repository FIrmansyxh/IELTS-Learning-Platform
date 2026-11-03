# ADR-003 — Keputusan yang didelegasikan ke Orchestrator

**Tanggal:** 2026-11-03
**Status:** `Accepted` (didelegasikan: human menyerahkan 100% keputusan ke rekomendasi Orchestrator sampai Fase 3 selesai; ditinjau ulang oleh human setelah Fase 3)

> Semua item di bawah mengikuti rekomendasi agen masing-masing. Human akan ditanya ulang setelah Fase 3. Perubahan lewat `_shared/change-management.md`.

| # | Topik | Keputusan |
|---|-------|-----------|
| 1 | Gerbang Boss (D3) | Band Boss dihitung dari **Listening + Reading** (objektif, server-side). Writing/Speaking wajib dikerjakan tetapi nilai AI bersifat **advisory**, tidak menjadi syarat lulus. Self-assessment tidak dapat meloloskan gerbang. Gerbang: T1 ≥80%, T2 band 5.0, T3 band 6.0, T4 band 7.0. |
| 2 | Tabel band (D4) | Seed memakai tabel Academic yang umum dipublikasikan (Listening dan Reading terpisah), disimpan sebagai data berversi yang bisa diubah admin, ditandai "perkiraan". Nilai 0–15 dan 37–40 dilengkapi dari tabel umum, bukan placeholder. |
| 3 | Reviewer soal AI (D2) | Admin (pemilik) reviewer tunggal; alur DRAFT → IN_REVIEW → APPROVED → PUBLISHED. |
| 4 | Retensi (D6/OQ-6) | Audio Speaking 90 hari (pengguna dapat hapus lebih awal); akun terhapus dianonimisasi 30 hari; batas 10 submission AI per pengguna per hari. |
| 5 | D1, D5, D7, D8, D9 | Rekomendasi Data Architect dipakai: peran enum, streak harian, rekaman boleh diulang, sesi JWT, importer menerjemahkan URL ke `asset_id`. |
| 6 | Pemetaan level (A2/D10) | Level 0→T1, 1–2→T2, 3→T3, 4–5→T4. |
| 7 | Mesin (OQ-1) | Spesifikasi tidak diketahui → default aman: `AI_ENABLED` dapat dimatikan, model kelas kecil (3B) dikonfigurasi lewat env, job asinkron dengan indikator progres, fallback self-assessment untuk latihan (bukan gerbang). Model final dikunci setelah benchmark di mesin pemilik. |
| 8 | Ollama (OQ-4) | Native di host (lebih mudah memakai GPU di Windows); URL via env. |
| 9 | Akses (OQ-2) | Default `localhost`; Tailscale direkomendasikan untuk kenalan (HTTPS diperlukan untuk mikrofon). |
| 10 | Backup (OQ-5) | Dump Postgres + aset ke folder `backups/` lokal (di-gitignore), lokasi dikonfigurasi lewat env. |
| 11 | ADR-001, ADR-002 | Diterima. |
| 12 | Desain UX | Diterima: varian warna teks AA, status "Dilewati", skill tree vertikal, bottom nav/sidebar, pemutar Listening ujian tanpa rewind, pintasan keyboard dapat dimatikan. |
| 13 | Cakupan | Academic saja (General Training out of scope). Versi: Node 22 LTS, Next.js 15 (dikunci di spec 000), CI GitHub Actions. |
| 14 | Video Indonesia | Disimpan sebagai tautan YouTube berstatus UNVERIFIED sampai diverifikasi; konten placeholder tidak dipublikasikan. |
| 15 | Signup (S-D1) | Mode `invite` bila diakses selain localhost; `open` hanya saat localhost. Dikonfigurasi di `app_settings`. |
| 16 | Akses (S-D2) | Tailscale. |
| 17 | Gerbang vs AI (S-D3) | Skor AI tidak meloloskan gerbang (sejalan dengan #1). |
| 18 | Cooldown (S-D4) | Skip/Boss: cooldown 1 jam, maks 3 percobaan per set per hari (dapat diubah di `app_settings`). |
| 19 | Rekaman (S-D5) | Retensi 90 hari + opsi "jangan simpan rekaman". |
| 20 | Enkripsi disk (S-D6) | Tidak diasumsikan; dokumentasikan BitLocker sebagai rekomendasi setup, bukan prasyarat. |
| 21 | Kuota AI (S-D7) | 10 per hari per pengguna, antrean global maks 20. |
| 22 | Sesi (S-D8) | JWT 7 hari sliding / 30 hari absolut; admin 12 jam. Reset password oleh admin (tanpa SMTP). |
| 23 | Delta data model | Tambah `users.token_version`, tabel `signup_invites`, `ai_evaluations.flags` jsonb, penanda persetujuan rekaman, pengaturan cooldown/ambang di `app_settings`. Dikerjakan Analyst/Backend sebagai delta skema. |
| 24 | Repo kode (dari DevOps) | `.gitignore` root berisi `codes/*` (repo produk terpisah) sementara CI ada di root `.github/workflows`. Dibiarkan apa adanya selama build (tidak ada commit); **ditinjau human setelah Fase 3**: monorepo (hapus ignore) atau pindahkan CI ke repo produk. |
| 25 | Docker | Tidak terpasang di mesin ini. Dev/test memakai Postgres 16 lokal (jalur B di `codes/README.md`); verifikasi stack Compose menunggu Docker. |
| 26 | Versi paket | Versi naik dari spec 000 karena `npm audit` (lihat `codes/VERSIONS.md`); diterima. |
| 27 | Hasil mode ujian (QA W3 F-08-01) | Skip/Boss/Placement menampilkan hanya hasil per skill + agregat + persen/band; **tidak** `is_correct` per `question_id` (mencegah inferensi kunci antar percobaan). Amandemen D10 spec 008 dan SPEC-014/015. PRACTICE tetap boleh per soal. |
| 28 | Pembulatan skor parsial (F-09-01) | `scaleToForty` membulatkan juga untuk max=40 agar tidak jatuh di antara baris tabel band. Amandemen spec 009. |
| 29 | Lain-lain QA W3 | `attempts.band_table_id` FK diganti RESTRICT; F-08-06 (reset basis waktu bonus kecepatan oleh resume) wajib selesai sebelum SPEC-016. |
