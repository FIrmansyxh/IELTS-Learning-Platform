# ADR-005: Aplikasi Lokal Satu Perangkat (Tanpa Login/Admin, Profil Lokal, SQLite)

**Status:** `Accepted` (human 2026-11-08); Fase 1 selesai
**Date:** 2026-11-08
**Author Agent:** Orchestrator (atas permintaan human)
**Phase:** Planning / perubahan lingkup

## Context

Platform dibuat untuk pemilik (dan sedikit kenalan) berjalan di satu mesin. Permintaan human:
hapus modul admin dan login/register, jalankan 100% lokal tanpa internet, dan tambah modul/bank soal lewat
kode (vibecode), bukan lewat admin. Jawaban keputusan human: (1) beberapa **profil lokal tanpa password**,
(2) fungsi admin yang masih berguna diganti **skrip CLI**, (3) database langsung ke **SQLite**, (4) video YouTube
**tetap** (tampil bila online).

Ukuran (diukur 2026-11-08): ±131 berkas terkait admin/auth (45 endpoint admin, 36 komponen admin); permukaan
Postgres yang harus diport: 28 berkas server dengan SQL mentah, ±40 cast `::uuid`, 34 `now()`, 9 `pg_advisory`,
4 `FOR UPDATE`, 31 enum, 62 kolom uuid, 20 jsonb, 13 numeric, 1 berkas trigger/view kustom; 15 berkas tes integrasi.
Node 24 membawa `node:sqlite` (SQLite 3.53) sehingga tidak perlu kompilasi native.

## Decision

1. **Profil lokal tanpa password.** Tabel `users` dipertahankan sebagai tabel profil; login/daftar/ganti-password/
   undangan dihapus. Memilih profil menerbitkan cookie sesi bertanda tangan (mekanisme sesi yang ada dipakai ulang).
   Satu profil = otomatis terpilih.
2. **Keamanan lokal menggantikan autentikasi:** bind `127.0.0.1` saja, tolak `Host` selain loopback, pertahankan
   pemeriksaan `Origin`/CSRF, cookie `SameSite=Strict`, hapus profil Docker `proxy`/Tailscale.
3. **Admin dihapus**, fungsi yang masih berguna menjadi CLI (profil, reset/buka progres, poin, pengaturan, tabel band,
   impor konten, validasi bank). Konten ditambah lewat berkas di repo + `content:import`/`bank:validate`.
4. **Urutan kerja:** Fase 1 profil + hapus login, Fase 2 hapus admin + CLI, Fase 3 SQLite + antrean dalam proses,
   Fase 4 paket aplikasi. SQLite dikerjakan SETELAH penghapusan agar kode yang akan dibuang tidak ikut diport.
5. **Offline:** seluruh belajar, Reading/Listening/Writing (LLM lokal) berjalan tanpa internet. Pengecualian yang
   diakui: video YouTube (butuh internet), evaluasi Speaking lewat AI pihak ketiga (aplikasi lain di browser),
   build pertama (unduh font) dan unduhan awal model.

## Consequences

- Aplikasi menjadi satu pengguna/perangkat; "kenalan" memasang salinan sendiri. Spec 001/002 (auth, admin) dibatalkan
  (superseded); spec 018-020 (aset/impor/kurasi via UI) direduksi menjadi CLI.
- Banyak tes ditulis ulang atau dihapus (auth.itest, admin.itest, bagian endpoint-guards); tes integrasi pindah ke SQLite.
- Risiko terbesar: porting semantik Postgres (kunci, transaksi, numeric, jsonb, trigger) ke SQLite; mitigasi lewat
  fase terpisah, tes integrasi dijalankan pada kedua mesin selama transisi bila perlu, dan inventaris SQL di SPEC-025.
- Kehilangan fitur yang disadari: audit viewer, panel kesehatan, kurasi UI, undangan, manajemen pengguna.

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | ADR dibuat (Proposed) |
| 2026-11-08 | Orchestrator | Disetujui; Fase 1 (profil lokal, hapus login/daftar/undangan/password) selesai |
