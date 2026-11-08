# VERSIONS.md

Sumber kebenaran versi terkunci SPEC-000 (diselaraskan dengan `package.json` pada SPEC-025 Fase 4). Semua dependensi npm dipasang eksak (`--save-exact`); `package-lock.json` di-commit.
Tanggal verifikasi: 2026-11-03 (registri npm via `npm view <paket>@<versi>`; `npm audit --omit=dev --audit-level=high` = 0 temuan).

## Ringkasan deviasi dari SPEC-000

Seluruh versi di tabel spec ADA di registri. Deviasi dilakukan hanya karena `npm audit --audit-level=high --omit=dev` (gerbang CI job `security`) GAGAL pada versi spec (3 critical, 4 high: Next.js, next-auth/@auth/core, drizzle-orm, sharp, zod, postcss nested). Aturan spec 000 (patch tertinggi pada minor yang sama yang lolos audit) dipakai bila memadai; bila perbaikan hanya ada di minor/major berikutnya, versi stabil kompatibel dipilih:

- Minor sama (patch bump): next 15.5.28, eslint-config-next 15.5.28, next-auth 5.0.0-beta.32, file-type 21.3.4, vitest/@vitest/coverage-v8 3.2.7.
- Minor/major lebih baru karena perbaikan hanya di sana: zod 4.6.7, drizzle-orm 0.45.4 (+ drizzle-kit 0.31.11), sharp 0.35.5, csv-parse 7.0.3 (major; belum dipakai, SPEC-019 wajib uji ulang API-nya).
- `overrides.postcss = $postcss` (8.5.32): Next 15.5.x membawa salinan nested postcss 8.4.31 yang rentan dan tidak ada patch Next 15.5.x yang memperbaikinya; override membuat salinan itu ikut 8.5.32 (build Next dan Tailwind diuji lolos).
- Sisa audit hanya pada devDependencies (vitest/tinypool kelas "UI/API server"); tidak termasuk gerbang CI (`--omit=dev`) dan tidak dijalankan di proyek ini. Tinjau ulang saat Vitest 4 dievaluasi.
- Penyimpangan lingkungan: mesin pengembang saat verifikasi memakai Node v24.21.0; `engines` = `>=22.20.0` (menerima Node 22.20+ dan 24). CI memakai Node 22.20.0.

## Dependensi npm (package.json)

| Paket | Terpasang | Spec 000 | Status |
|---|---|---|---|
| @dnd-kit/core | 6.3.1 | 6.3.1 | sesuai spec |
| @dnd-kit/sortable | 10.0.0 | 10.0.0 | sesuai spec |
| @eslint/eslintrc | 3.3.1 | - | tambahan (di luar tabel spec) |
| @hookform/resolvers | 5.2.2 | 5.2.2 | sesuai spec |
| @playwright/test | 1.56.1 | 1.56.1 | sesuai spec |
| @tailwindcss/postcss | 4.1.17 | 4.1.17 | sesuai spec |
| @tanstack/react-query | 5.90.5 | 5.90.5 | sesuai spec |
| @testing-library/jest-dom | 6.9.1 | 6.9.1 | sesuai spec |
| @testing-library/react | 16.3.0 | 16.3.0 | sesuai spec |
| @types/node | 22.20.5 | - | tambahan (di luar tabel spec) |
| @types/react | 19.3.0 | - | tambahan (di luar tabel spec) |
| @types/react-dom | 19.3.0 | - | tambahan (di luar tabel spec) |
| @vitest/coverage-v8 | 3.2.7 | 3.2.4 | DEVIASI (spec 3.2.4): disamakan dengan vitest |
| class-variance-authority | 0.7.1 | - | tambahan (di luar tabel spec) |
| clsx | 2.1.1 | - | tambahan (di luar tabel spec) |
| csv-parse | 7.0.3 | 6.1.0 | DEVIASI (spec 6.1.0): advisory (prototype replacement) fix di 7.0.2+; MAJOR baru, belum dipakai (SPEC-019 wajib uji ulang) |
| drizzle-kit | 0.31.11 | 0.31.6 | DEVIASI (spec 0.31.6): pasangan drizzle-orm 0.45; `generate` menyatakan tidak ada perubahan skema |
| drizzle-orm | 0.45.4 | 0.44.7 | DEVIASI (spec 0.44.7): advisory high (SQL injection identifier) fix di 0.45.2+; skema/migrasi tidak berubah |
| embla-carousel-react | 8.6.0 | 8.6.0 | sesuai spec |
| esbuild | 0.25.11 | 0.25.11 | sesuai spec |
| eslint | 9.37.0 | 9.37.0 | sesuai spec |
| eslint-config-next | 15.5.28 | 15.5.9 | DEVIASI (spec 15.5.9): disamakan dengan next |
| eslint-plugin-security | 3.0.1 | 3.0.1 | sesuai spec |
| file-type | 21.3.4 | 21.0.0 | DEVIASI (spec 21.0.0): advisory (ASF loop, ZIP bomb) fix di 21.3.4, minor yang sama |
| jsdom | 27.0.1 | - | tambahan (di luar tabel spec) |
| lucide-react | 0.546.0 | 0.546.0 | sesuai spec |
| next | 15.5.28 | 15.5.9 | DEVIASI (spec 15.5.9): advisory DoS (Image Optimizer, deserialization) fix di 15.5.10+; 15.5.28 = patch tertinggi minor 15.5 |
| next-auth | 5.0.0-beta.32 | 5.0.0-beta.29 | DEVIASI (spec 5.0.0-beta.29): advisory kritis (email misdelivery, existence-based auth) fix di beta.30+; beta.32 = tertinggi |
| next-themes | 0.4.6 | - | tambahan (di luar tabel spec) |
| pino | 9.14.0 | 9.14.0 | sesuai spec |
| postcss | 8.5.32 | - | tambahan (di luar tabel spec): dipin 8.5.32 + override agar salinan nested di next (8.4.31, advisory high) ikut diperbarui |
| prettier | 3.6.2 | 3.6.2 | sesuai spec |
| radix-ui | 1.8.1 | - | tambahan (di luar tabel spec) |
| react | 19.2.3 | 19.2.3 | sesuai spec |
| react-dom | 19.2.3 | 19.2.3 | sesuai spec |
| react-hook-form | 7.65.0 | 7.65.0 | sesuai spec |
| react-markdown | 10.1.0 | 10.1.0 | sesuai spec |
| recharts | 3.3.0 | 3.3.0 | sesuai spec |
| remark-directive | 4.0.0 | 4.0.0 | sesuai spec |
| remark-gfm | 4.0.1 | 4.0.1 | sesuai spec |
| sharp | 0.35.5 | 0.34.4 | DEVIASI (spec 0.34.4): advisory high (libvips/libheif) fix di 0.35.x |
| sonner | 2.0.8 | - | tambahan (di luar tabel spec) |
| tailwind-merge | 3.7.0 | - | tambahan (di luar tabel spec) |
| tailwindcss | 4.1.17 | 4.1.17 | sesuai spec |
| tsx | 4.20.6 | 4.20.6 | sesuai spec |
| tw-animate-css | 1.4.0 | - | tambahan (di luar tabel spec) |
| typescript | 5.9.3 | 5.9.3 | sesuai spec |
| vitest | 3.2.7 | 3.2.4 | DEVIASI (spec 3.2.4): advisory dev-only; 3.2.7 = patch tertinggi 3.2 (sisa advisory hanya relevan bila Vitest UI/API server dijalankan; tidak dipakai) |
| zod | 4.6.7 | 4.1.12 | DEVIASI (spec 4.1.12): advisory high (memory exhaustion) fix di 4.6.6+; API v4 kompatibel |
| zustand | 5.0.8 | 5.0.8 | sesuai spec |

Catatan: `shadcn` CLI 3.4.0 (spec) dijalankan sekali lewat `npx shadcn@3.4.0 add ...` dan TIDAK menjadi dependensi proyek. Paket `radix-ui`, `sonner`, `next-themes`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` ditarik oleh komponen shadcn dan dipin eksak. Paket `cn` yang ikut tertarik oleh CLI dihapus (impor diganti ke `@/lib/utils`).

## GitHub Actions

| Action | Versi |
|---|---|
| actions/checkout | v4.2.2 |
| actions/setup-node | v4.4.0 |
| actions/upload-artifact | v4.6.2 |
| gitleaks/gitleaks-action | v2.3.9 |

Ketersediaan tag action belum diverifikasi terhadap GitHub dari mesin ini; CI baru terbukti saat dijalankan di GitHub.

## Catatan migrasi dari Postgres

Dependensi `pg`, `pg-boss`, `@types/pg`, `testcontainers`, `@testcontainers/postgresql`, dan `@node-rs/argon2`
sudah dihapus (SPEC-025, ADR-005): database kini SQLite lewat `node:sqlite`, antrean berjalan dalam proses,
dan tidak ada lagi password. Image kontainer dan Trivy tidak dipakai lagi.
