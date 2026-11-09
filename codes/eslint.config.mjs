import { FlatCompat } from '@eslint/eslintrc';
import security from 'eslint-plugin-security';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      '.next/**',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'drizzle/**',
      'next-env.d.ts',
      'scripts/bench/results/**',
      // Salinan referensi data-model; diubah hanya lewat change-management.
      'src/db/schema.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  security.configs.recommended,
  {
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'react/no-danger': 'error',
      // Terlalu banyak false positive pada akses properti dinamis bertipe; ditinjau QA secara manual.
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['tests/**', '**/*.test.ts', '**/*.test.tsx', '**/*.itest.ts'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-unsafe-regex': 'off',
    },
  },
  {
    // Path berkas di modul ini selalu divalidasi (UUID/storage_key, path paket di bawah assets/) sebelum dipakai.
    files: ['src/server/storage/**', 'src/server/content/**', 'src/server/admin/health.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
  {
    // SPEC-003: kolom status/unlock_source/completed_at/best_score_percent/... HANYA ditulis GatekeepingService.
    // Spec 005 (learn_*, mini_task_completed_at) dan 016 (mastery_crown) menambah override terbatas di sini.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/server/gatekeeping/**', 'src/server/player/**', 'src/db/**', 'src/server/db.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/db/schema',
              importNames: ['userTierProgress', 'userModuleProgress', 'userSubModuleProgress'],
              message: 'Tabel progres hanya boleh diakses lewat GatekeepingService (src/server/gatekeeping).',
            },
          ],
        },
      ],
    },
  },
  {
    // Jalur berkas berasal dari operator lokal/CLI atau paket konten di repo, bukan dari input jaringan.
    files: ['scripts/**', 'content/**', 'src/server/db.ts', 'src/server/listening/**', 'src/server/jobs/**', 'src/server/backup.ts', 'src/server/cli/doctor.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off', 'security/detect-child-process': 'off' },
  },
];

export default config;
