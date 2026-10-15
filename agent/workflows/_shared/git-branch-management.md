# Git Branch Management (Shared)

## Rules
1. **NEVER** commit/push langsung ke `main` atau `development`.
2. **PENTING — Struktur Repo:** Workspace ini terdiri dari DUA repo git terpisah:
   - **Agent repo** (root): `{project-name}/` — berisi semua file agent, spec, task, logs. Jangan commit kode produk di sini.
   - **Product repo** (subfolder): `codes/` — repo git terpisah yang di-push ke `{repo-url}`. Semua operasi git untuk kode produk dilakukan DI DALAM folder `codes/`.
3. **Semua perintah git untuk kode produk harus dijalankan dari dalam folder `codes/`.**
4. **Konvensi Nama Branch:** gunakan format `feature/nama-fitur`, `fix/nama-bug`, atau `test/nama-fitur`.
5. **Konvensi Commit (CRITICAL):** Wajib menggunakan **Conventional Commits** format:
   - `feat: [pesan]` untuk fitur baru.
   - `fix: [pesan]` untuk bug fix.
   - `chore: [pesan]` untuk update tooling/config.
   - `docs: [pesan]` untuk perubahan dokumentasi.
   - `test: [pesan]` untuk penambahan test.

## Steps
1. **Cek branch saat ini** dengan `git -C codes/ branch --show-current`.
2. **Cek apakah ada perubahan yang belum di-commit** dengan `git -C codes/ status`.
   - **Jika ada perubahan belum ter-commit:** HENTIKAN pekerjaan. Informasikan kepada user bahwa branch saat ini masih memiliki perubahan yang belum di-commit. Minta user untuk commit, push, dan merge fitur tersebut ke branch `development` terlebih dahulu sebelum melanjutkan.
3. **Jika working tree clean:**
   - Pindah ke branch `development`: `git -C codes/ checkout development`.
   - Pull perubahan terbaru: `git -C codes/ pull origin development`.
   - Buat atau pindah ke branch yang sesuai dengan task: `git -C codes/ checkout -b [type]/[nama-task]`.
4. **JANGAN lakukan commit dan push otomatis** setelah pekerjaan selesai. Hasil pekerjaan perlu diverifikasi oleh user terlebih dahulu.
