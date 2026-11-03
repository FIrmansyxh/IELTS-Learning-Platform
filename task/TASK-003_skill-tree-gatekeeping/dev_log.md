# Dev Log TASK-003: Skill Tree dan Gatekeeping

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W1)

Spec: `specifications/003_spec_skill_tree_gatekeeping.md` (UI/UX + `GET /curriculum/tree` + `POST /admin/users/{id}/progress/unlock`). Mesin gerbang adalah milik Backend; klien hanya membaca pohon dan tidak pernah mengirim status/skor.

### Yang dibangun
- **Rute**: `src/app/(app)/peta/page.tsx` -> `components/skill-tree/skill-tree-view.tsx` (query `['curriculum-tree']`, `staleTime: 0`, state loading Skeleton berstruktur, error "Peta belajar gagal dimuat" + "Coba lagi").
- **Komponen** (`components/skill-tree/`): `skill-tree.tsx` (orkestrasi, `findActiveNodeId`, auto-scroll ke node `IN_PROGRESS` pertama lalu `UNLOCKED`, mati pada reduced-motion), `tier-section.tsx` (header Tier: judul, "Target Band a–b", CEFR, Progress, Badge status, tombol Boss Stage disabled + Tooltip alasan, "Uji Kompetensi" bila `skip_test.available`), `module-card.tsx` (expand/collapse `aria-expanded`, Progress, "Uji Kompetensi" modul), `sub-module-node.tsx` (lingkaran 40px ikon + judul + label status + mahkota; tautan ke `/belajar/{kode}` untuk status terbuka; `LOCKED` = tombol fokusable + Popover `lock_reason.message` + tombol "Uji Kompetensi" bila modul/tier mendukung; `COMING_SOON` = teks "Segera hadir" tak dapat diklik), `detail-panel.tsx` (sticky >= lg), `status.tsx` (pemetaan status -> ikon Lucide + label + token warna, tidak hanya warna). `components/gamification/crown-badge.tsx` (mahkota Emas/Perak + label teks + `aria-label` skor).
- Semantik `<ol>` bersarang per Tier (`aria-label="Tier n"`), garis penghubung vertikal 2px (hijau selesai, biru aktif, putus-putus abu terkunci), denyut node aktif `motion-safe`, grid 2 kolom modul di xl, 1 kolom di mobile.
- **Admin override** (`components/admin/unlock-sheet.tsx`, dipicu dari menu aksi baris di `/admin/pengguna`): Select level (Tier/Modul/Sub-Modul) + Select target; daftar target diambil dari `GET /curriculum/tree` (struktur/ID sama untuk semua pengguna; entitas `COMING_SOON` dinonaktifkan), `POST .../progress/unlock` dengan `{ level, target_id }` saja; galat `ALREADY_UNLOCKED`/`NOT_AVAILABLE` tampil sebagai Toast Indonesia.

### Keputusan dan asumsi
1. Detail panel menampilkan node yang di-hover/fokus (default: node aktif); klik tetap berpindah halaman.
2. Asumsi: ID Tier/Modul/Sub-Modul pada tree admin sama dengan ID untuk pengguna target (data konten global, bukan per-pengguna). Bila Backend ingin target dikirim per pengguna, perlu endpoint/param tambahan (di luar kontrak sekarang).
3. Nilai `lock_reason.message` dan teks alasan Boss dipakai sebagai-ada dari server / kamus Indonesia (`id.tree.bossBlocked`).

### Verifikasi W1 Frontend (dijalankan di `codes/`, 2026-11-03)
| Perintah | Hasil |
|---|---|
| `npx vitest run` | 86 dari 87 lulus. Kegagalan: `tests/unit/seed.test.ts` (milik W0/Backend; registri seed berubah oleh Backend). Seluruh 73 test frontend lulus (`src/lib/*`, `src/components/**`). |
| `npx tsc --noEmit` | Berkas frontend bersih. Galat tersisa hanya milik Backend: `scripts/admin-bootstrap.ts(14,36)` TS2559. |
| `npx eslint . --max-warnings=0` | Berkas frontend bersih (0 galat/peringatan di `src/app`, `src/components`, `src/hooks`, `src/lib`, `src/i18n`, `tests`). 3 peringatan milik Backend: `src/contracts/auth.ts:9` (unsafe-regex), `src/server/admin/health.ts:38,41` (non-literal-fs). |
| `npx next build` | GAGAL pada tahap tipe/lint karena berkas Backend di atas (`scripts/admin-bootstrap.ts`); tahap kompilasi berhasil ("Compiled successfully"). Build penuh belum dapat dinyatakan lulus. |
| Dev server (`next dev`) | `/masuk`, `/daftar`, `/peta`, `/profil`, `/ganti-password`, `/admin`, `/admin/pengguna` merespons 200 dengan judul benar. `/masuk` dan `/daftar` diperiksa visual pada 375x812 (tema gelap), tanpa overflow horizontal. |
| Playwright E2E | Belum dijalankan (butuh server + DB hidup). `tests/e2e/home.spec.ts` disesuaikan (redirect `/masuk?next=`). |

Belum diverifikasi: peta belajar dan halaman admin dengan data nyata dari Backend, tampilan terang (hanya tema gelap yang dilihat), 768/1024/1440, zoom 200%, uji pembaca layar, kontras otomatis.


---

## [BACKEND] 2026-11-03 07:55 (Backend Engineer, wave W1)

**Target Spec:** `specifications/003_spec_skill_tree_gatekeeping.md` | **Status:** Completed (sisi server)

### 1. Implementation Summary
- **Aturan murni** (`src/server/gatekeeping/rules.ts`): D1-D9 di atas snapshot dalam memori (rantai per Tier, `recompute` Tier 1..4 monoton, persentase D7, `bossState` D9 dengan urutan alasan, `lockReasonOf`). Diuji unit tanpa DB.
- **Service** (`src/server/gatekeeping/service.ts`), satu-satunya penulis kolom gerbang: `ensureProgressRows` (satu statement `WITH ... INSERT ... ON CONFLICT DO NOTHING`), `initializeProgress`, `recomputeStatuses`, `markStarted`, `assertSubModuleAccessible` (`NOT_FOUND` / `LOCKED_CONTENT` dengan `details[0] = { path: 'sub_module_id', code, message }`), `applyDrillResult` (sentesimal via `toHundredths`, pass = `assessment_sets.pass_percent` PUBLISHED bila ada kalau tidak `sub_modules.passing_score_percent`), `applySkipResult`, `applyBossResult`, `applyPlacementResult`, `adminOverride`. Setiap `apply*` mengunci baris progres berurutan (tier -> modul -> sub-modul, urut id) dengan `SELECT ... FOR UPDATE`, memuat snapshot (SATU query datar), mengubah, `recompute`, lalu menulis hanya entitas yang berubah (satu `UPDATE ... FROM jsonb_to_recordset` per tabel) dan mengembalikan `{ unlocked: [{kind,id,label}] }`.
- **Pohon** (`tree.ts`) + `GET /api/v1/curriculum/tree` (`auth: 'user'`): ensure + recompute dalam satu transaksi, lalu menyusun respons sesuai `CurriculumTreeResponseSchema` (kontrak FE `src/contracts/curriculum.ts` dipakai apa adanya). `POST /api/v1/admin/users/{id}/progress/unlock` (`auth: 'admin'`) memanggil `adminOverride` (audit `PROGRESS_OVERRIDE`).
- **Lint**: `no-restricted-imports` melarang impor `userTierProgress/userModuleProgress/userSubModuleProgress` dari `@/db/schema` di luar `src/server/gatekeeping/**` (SPEC-005/016 menambah override terbatas di `eslint.config.mjs` untuk kolom `learn_*`, `mini_task_completed_at`, `mastery_crown`).

### 2. Files Created/Modified
`src/server/gatekeeping/{rules,service,tree}.ts`, `src/app/api/v1/curriculum/tree/route.ts`, `src/app/api/v1/admin/users/[user_id]/progress/unlock/route.ts`, `eslint.config.mjs`, `tests/unit/gatekeeping-rules.test.ts` (12), `tests/integration/gatekeeping.itest.ts` (24).

### 3. Technical Notes (keputusan konservatif / tafsir spec)
1. **D6 literal**: Tier `IN_PROGRESS` bila ada sub-modul yang dimulai/selesai/dilewati, juga saat Tier masih terkunci (mis. Skip Test Modul 2.1 pada Tier 2 terkunci). Akibatnya sub-modul pertama modul berikutnya terbuka sesuai AC "sub-modul pertama modul berikutnya UNLOCKED". `unlock_source` Tier diisi dari sub-modul pertama yang dimulai (`SKIP_TEST`).
2. **Modul `UNLOCKED`** bila SEBAGIAN sub-modul `UNLOCKED` (spec: sub pertama), agar override admin pada sub-modul tengah tetap konsisten.
3. **Skip** hanya menyentuh sub-modul/modul `AVAILABLE`; entitas yang sudah `COMPLETED/SKIPPED/IN_PROGRESS` tidak diubah; `applySkipResult` pada target yang sudah terminal tidak mengubah apa pun (juga `skip_best_percent`). Skip Tier hanya berlaku bila Tier `LOCKED/UNLOCKED`. `unlock_source` entitas yang beralih ke `SKIPPED` ditimpa `SKIP_TEST`/`PLACEMENT` (spec butir `applySkipResult`/`applyPlacementResult`).
4. **Alasan Boss** untuk Tier `SKIPPED` tanpa boss lulus: `ALREADY_PASSED` (enum alasan tidak punya nilai lain). `skip_test` pada pohon hanya mengisi `assessment_set_id/time_limit_seconds/question_count` saat `available=true`; `boss.assessment_set_id` diisi walau belum tersedia.
5. `assertSubModuleAccessible` pada sub-modul `COMING_SOON` -> `NOT_FOUND`; kode `details[0].code` selalu `PREVIOUS_INCOMPLETE` atau `TIER_LOCKED` (sesuai pemilik kode di spec).
6. Override admin untuk Modul/Tier juga membuka sub-modul pertama rantai (`ADMIN`); `NOT_AVAILABLE` bila tidak ada sub-modul AVAILABLE; target/pengguna tak ada atau terhapus -> 404.
7. **Jumlah query**: keadaan tunak `GET /curriculum/tree` = 6 query termasuk auth dan BEGIN/COMMIT (ukur nyata: `[perf] tree: 6 query/permintaan, p95=4.2 ms` pada 4x31 sub-modul PUBLISHED). Permintaan pertama/saat ada perubahan: + 3 kunci + 1 muat ulang + <= 3 UPDATE (di atas 8) karena kunci baris hanya diambil bila ada yang berubah.
8. `applyDrillResult` pada sub-modul `LOCKED` melempar Error (500 internal), bukan `LOCKED_CONTENT`: pemanggil (SPEC-006) wajib memanggil `assertSubModuleAccessible` lebih dulu.

### 4. Verifikasi seluruh W1 Backend (dijalankan di `codes/`, 2026-11-03, Node v24.21.0, Postgres 16.15 lokal port 55432)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus (0 galat, termasuk berkas Frontend) |
| `npx eslint . --max-warnings=0` | lulus (0 galat/peringatan) |
| `npx vitest run` (unit + komponen FE) | 18 berkas, 199 tes lulus |
| `npx vitest run --coverage` | lulus; lines 90,55% (ambang 70%; modul terikat DB dikecualikan dari coverage unit dan diverifikasi oleh integration) |
| `npm run test:integration` (Postgres lokal, `ielts_test`) | 5 berkas, 96 tes lulus (baseline, auth, admin, gatekeeping, content) |
| `npm run build` (tanpa `NODE_ENV=development`) | lulus (Next 15.5.28; 11 endpoint v1 + halaman FE) |
| `npm run build:worker` | lulus |
| Smoke server standalone + curl | login admin bootstrap -> `PASSWORD_CHANGE_REQUIRED` -> ganti password -> tree 200 -> buat undangan -> health 200 -> Origin asing 403 |
Tidak diverifikasi: Docker/Compose, Node 22 (target), Playwright E2E, pg-boss `retention-purge` end-to-end, uji beban selain 20 iterasi pohon, penetrasi manual.

### 5. Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 07:55 | Backend W1: mesin gerbang, pohon, override admin |
