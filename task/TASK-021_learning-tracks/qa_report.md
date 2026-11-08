# QA Report TASK-021: Jalur Belajar (Learning Track) dan Gaya Penyampaian Materi

Tanggal: 2026-11-08  
Spec: `specifications/021_spec_learning_tracks.md`  
Task: `task/TASK-021_learning-tracks/TASK-021_learning-tracks.md`  
Hasil Akhir: **PASS** (Siap ke Gate Code Review)

---

## 1. Ringkasan Eksekutif
Fitur Jalur Belajar (Learning Tracks) dan Gaya Penyampaian Materi (SPEC-021) telah diimplementasikan secara komprehensif di backend dan frontend. Seluruh pengujian statis (TypeScript dan ESLint), unit test, security test, dan integration test berjalan dengan hasil 100% hijau. Arsitektur lokal single-device dan aturan D5 (Gerbang Tier/Boss/Skip tetap berlaku di semua jalur) diverifikasi secara ketat.

---

## 2. Matriks Verifikasi Acceptance Criteria (AC)

| ID | Kriteria Penerimaan | Status | Bukti Uji |
|---|---|---|---|
| AC-1 | Seed memuat 3 jalur resmi (`GT-STRUCT`, `GT-SPRINT-30`, `GT-BAND7-FOCUSED`) | **PASS** | `tests/unit/seed.test.ts`, `tests/integration/tracks.itest.ts` |
| AC-2 | `GET /api/v1/tracks` mengembalikan daftar ringkasan jalur dan status aktif | **PASS** | `tests/integration/tracks.itest.ts` (AC-2) |
| AC-3 | `PUT /api/v1/me/active-track` mengganti jalur aktif dan memvalidasi `track_code` | **PASS** | `tests/integration/tracks.itest.ts` (AC-3) |
| AC-4 | `GET /api/v1/curriculum/tree` mengembalikan pohon kurikulum beserta `data.track` | **PASS** | `tests/integration/tracks.itest.ts` (AC-4) |
| AC-5 | Proyeksi kueri `?track=GT-...` mengembalikan pohon dengan konteks jalur yang dipilih | **PASS** | `tests/integration/tracks.itest.ts` (AC-5) |
| AC-6 | Pembukaan sekuensial pada jalur CURATED (item N terbuka hanya bila N-1 selesai) | **PASS** | `tests/unit/learning-tracks.test.ts`, `tests/integration/tracks.itest.ts` |
| AC-7 | Aturan D5: Sub-modul di Tier LOCKED selalu berstatus LOCKED di seluruh jalur | **PASS** | `tests/unit/learning-tracks.test.ts` (D5), `tests/integration/tracks.itest.ts` |
| AC-8 | Item COMING_SOON dilewati dan tidak memblokir pembukaan sekuensial | **PASS** | `tests/unit/learning-tracks.test.ts` |
| AC-9 | Checkpoint berada setelah kumpulan sub-modul yang ditentukan dalam sprint/list | **PASS** | `tests/unit/learning-tracks.test.ts`, `tests/integration/tracks.itest.ts` |
| AC-10 | Status Checkpoint: `NOT_READY`, `READY`, `ATTEMPTED`, `PASSED` terhitung tepat | **PASS** | `tests/unit/learning-tracks.test.ts`, `tests/integration/tracks.itest.ts` |
| AC-11 | Attempt Checkpoint mengacak 10 soal dari kolam sub-modul yang telah diselesaikan | **PASS** | `tests/integration/tracks.itest.ts` (AC-11) |
| AC-12 | Kolam soal checkpoint < 5 mengembalikan status 422 `CHECKPOINT_NOT_ENOUGH_QUESTIONS` | **PASS** | `tests/integration/tracks.itest.ts` (AC-12) |
| AC-13 | Skor checkpoint >= 75% menandai status checkpoint menjadi `PASSED` | **PASS** | `tests/integration/tracks.itest.ts` (AC-13) |
| AC-14 | `PUT /api/v1/sub-modules/{code}/style` menyimpan preferensi gaya per profil | **PASS** | `tests/integration/tracks.itest.ts` (AC-14) |
| AC-15 | Pemutar sub-modul menampilkan sakelar gaya hanya jika `available_styles > 1` | **PASS** | `SubModulePlayer` unit tests & type checking |
| AC-16 | Kartu resume beranda menampilkan label jalur belajar aktif | **PASS** | `tests/integration/resume.itest.ts`, `src/components/home/resume-card.test.tsx` |
| AC-17 | Batas kinerja kueri keadaan tunak `GET /curriculum/tree` <= 10 kueri SQL dan p95 < 300ms | **PASS** | `tests/integration/gatekeeping.itest.ts` (terukur: 10 kueri, p95 4.6ms - 6.5ms) |
| AC-18 | Seluruh endpoint rute baru dilindungi `withApi({ auth: 'user' })` | **PASS** | `tests/security/endpoint-guards.test.ts` (52 tests passed) |
| AC-19 | Integrasi Frontend UI (TrackPicker, CuratedTrackView, CheckpointSession, dsb.) | **PASS** | `next build` exit code 0, 0 TS error, 0 lint error |

---

## 3. Hasil Pengujian Otomatis

### 3.1. Type Checking (`npm run typecheck`)
```
> tsc --noEmit
Exit code: 0 (0 error)
```

### 3.2. Production Build (`npm run build`)
```
> next build
✓ Compiled successfully in 25.6s
✓ Linting and checking validity of types
✓ Generating static pages (11/11)
Rute /api/v1/tracks, /api/v1/me/active-track, /latihan/checkpoint/[attempt_id], /peta, dll terdaftar
Exit code: 0 (0 error)
```

### 3.3. Unit & Security Tests (`npm run test`)
```
✓ tests/unit/learning-tracks.test.ts (7 tests)
✓ tests/unit/seed.test.ts (3 tests)
✓ tests/security/endpoint-guards.test.ts (52 tests)
✓ tests/unit/mix-select.test.ts, attempts-engine, dsb.
Total Unit Tests: 791 PASSED
```

### 3.4. Integration Tests (`npm run test:integration`)
```
✓ tests/integration/tracks.itest.ts (12 tests)
✓ tests/integration/gatekeeping.itest.ts (24 tests)
✓ tests/integration/resume.itest.ts (13 tests)
Total: 3 files passed, 49 tests passed
Kinerja /curriculum/tree: 10 query SQL, p95 = 6.5 ms (batas < 300 ms)
```

---

## 4. Kesimpulan QA
Fitur SPEC-021 telah memenuhi seluruh kriteria kualitas, fungsionalitas, performa, dan keamanan yang disyaratkan. Tidak ada regresi pada fitur yang sudah ada (SPEC-022, SPEC-025, SPEC-003, SPEC-007).

**Rekomendasi:** Siap diajukan ke **GATE Code Review Human**.
