# SPEC-003: Skill Tree Kurikulum & Gatekeeping Berurutan (CUR-01, CUR-02)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-000, SPEC-001
- **Prioritas:** P0
- **Cakupan:** Backend (mesin status gerbang + API pohon) + Frontend (peta belajar)

## User Story
Sebagai Learner, saya ingin melihat peta belajar Tier > Modul > Sub-Modul dengan status Terkunci/Sedang dipelajari/Selesai/Dilewati dan hanya bisa membuka sub-modul berikutnya setelah menyelesaikan materi dan lulus latihan, sehingga saya belajar berurutan dan selalu tahu syarat membuka level berikutnya.

## Non-Goals / Out of Scope
- Tidak membuat pemutar materi (SPEC-005), mesin soal/Active Drill (SPEC-006), Skip Test (SPEC-008), Boss Stage (SPEC-014), Placement (SPEC-015); spec ini hanya mendefinisikan mesin status (`GatekeepingService`) beserta fungsi `apply*` yang dipanggil spec-spec itu.
- Tidak ada endpoint yang menerima "tandai selesai" dari klien. Status HANYA berubah sebagai efek samping fungsi `apply*` di dalam transaksi server.
- Tidak ada seed struktur Tier/Modul/Sub-Modul (SPEC-004).
- Tidak ada mahkota/poin (SPEC-016). Tree hanya MEMBACA `mastery_crown` dan `best_score_percent`.
- Tidak ada peta bebas koordinat/zig-zag (design-system 5.9: hanya daftar bertingkat).
- Tidak ada penguncian ulang (downgrade) status yang sudah `COMPLETED`/`SKIPPED`.
- Tidak ada pengaturan urutan modul per pengguna.

## Definisi Tetap (WAJIB diikuti persis)
**D1. Visibilitas konten.** Sub-modul `AVAILABLE` bila `sub_modules.status='PUBLISHED'` DAN `modules.status='PUBLISHED'`. Sub-modul/modul berstatus `DRAFT`, `IN_REVIEW`, `APPROVED` ditampilkan sebagai `COMING_SOON` (tidak dapat dibuka, tidak masuk rantai urutan). Status `ARCHIVED` disembunyikan dari tree dan dari rantai.

**D2. Rantai urutan per Tier.** `chain(T)` = semua sub-modul `AVAILABLE` pada Tier T diurutkan `(modules.order_index ASC, sub_modules.order_index ASC)`. "Sub-modul N+1" = elemen berikutnya dalam `chain(T)`; elemen pertama chain Tier berikutnya TIDAK menjadi N+1 dari elemen terakhir Tier sebelumnya (dibuka lewat aturan Tier).

**D3. Status.** Enum `progress_status`: `LOCKED`, `UNLOCKED`, `IN_PROGRESS`, `COMPLETED`, `SKIPPED`. Pemetaan label UI: `LOCKED`="Terkunci", `UNLOCKED`/`IN_PROGRESS`="Sedang dipelajari", `COMPLETED`="Selesai", `SKIPPED`="Dilewati".

**D4. Aturan status Sub-Modul** (disimpan di `user_sub_module_progress`):
- `UNLOCKED` bila Tier terbuka (status Tier bukan `LOCKED`) DAN (sub-modul pertama `chain(T)` ATAU predecessor di chain berstatus `COMPLETED`/`SKIPPED`). Perubahan `LOCKED -> UNLOCKED` mengisi `unlock_source`: `DEFAULT` untuk sub-modul pertama Tier 1; `unlock_source` Tier untuk sub-modul pertama Tier lain; `SEQUENTIAL` untuk sub-modul lain.
- `IN_PROGRESS`: `markStarted()` memindahkan `UNLOCKED -> IN_PROGRESS` (dipanggil SPEC-005 saat halaman sub-modul pertama kali dibuka).
- `COMPLETED`: Active Drill lulus (`score_percent >= pass_percent`, lihat `applyDrillResult`). `learn_completed_at` sudah terisi karena Drill hanya dapat dimulai setelah materi selesai (SPEC-006). Mini-Task TIDAK menjadi syarat `COMPLETED`.
- `SKIPPED`: lewat `applySkipResult` atau `applyPlacementResult`.
- Status tidak pernah turun (monoton): `COMPLETED`/`SKIPPED` bersifat sticky.

**D5. Aturan status Modul** (disimpan di `user_module_progress`, dihitung ulang dari sub-modul AVAILABLE-nya):
- Tanpa sub-modul AVAILABLE: `LOCKED`, diberi `content_state=COMING_SOON`, tidak dihitung dalam syarat Tier.
- Semua sub-modul `SKIPPED`: `SKIPPED`. Semua sub-modul `COMPLETED`/`SKIPPED` (minimal satu `COMPLETED`): `COMPLETED` (`completed_at = now()` sekali).
- Ada sub-modul `IN_PROGRESS`/`COMPLETED`/`SKIPPED` tetapi belum semua selesai: `IN_PROGRESS`.
- Sub-modul pertamanya `UNLOCKED` dan tidak ada yang dimulai: `UNLOCKED`.
- Selain itu: `LOCKED`.
- `COMPLETED`/`SKIPPED` sticky (modul yang sudah selesai tidak turun walau sub-modul baru dipublikasikan).

**D6. Aturan status Tier** (disimpan di `user_tier_progress`):
- Tier 1: minimal `UNLOCKED` sejak progres diinisialisasi (`unlock_source=DEFAULT`).
- Tier n>1: `UNLOCKED` bila Tier n-1 `COMPLETED` (`unlock_source=BOSS_PASS`) atau `SKIPPED` (`unlock_source` = `unlock_source` Tier n-1), atau bila diatur oleh `applyPlacementResult`/`adminOverride` (`PLACEMENT`/`ADMIN`).
- `IN_PROGRESS` bila ada sub-modul pada Tier yang `IN_PROGRESS`/`COMPLETED`/`SKIPPED`.
- `COMPLETED` bila `boss_passed_at IS NOT NULL` DAN semua modul AVAILABLE (minimal satu) `COMPLETED`/`SKIPPED`.
- `SKIPPED` bila `applySkipResult(TIER)` atau `applyPlacementResult` (Tier di bawah Tier terpilih) sukses.
- Selain itu: `LOCKED`.

**D7. Persentase progres.** Sub-modul: bila status `COMPLETED`/`SKIPPED` = 100; selain itu `L` = `learn_completed_at IS NOT NULL` (1/0), `D` = `best_score_percent >= pass` (1/0), `M` = `mini_task_completed_at IS NOT NULL` (1/0). Jika sub-modul punya Mini-Task (`learning_materials.mini_task_json` tidak kosong): `40*L + 40*D + 20*M`; jika tidak: `50*L + 50*D`. Modul dan Tier: `floor(100 * jumlah sub-modul AVAILABLE berstatus COMPLETED/SKIPPED / jumlah sub-modul AVAILABLE)`, 0 bila tidak ada sub-modul AVAILABLE; Tier `COMPLETED`/`SKIPPED` = 100.

**D8. Skip Test tersedia** (`skip_test.available=true`) untuk Modul/Tier bila: status entitas `LOCKED` atau `UNLOCKED` (belum ada sub-modul di bawahnya yang `IN_PROGRESS`/`COMPLETED`/`SKIPPED`), dan ada `assessment_sets` bertipe `SKIP_MODULE_TEST`/`SKIP_TIER_TEST` berstatus `PUBLISHED` untuk entitas itu.

**D9. Boss tersedia** (`boss.available=true`) bila: status Tier `UNLOCKED`/`IN_PROGRESS`, semua modul AVAILABLE (minimal satu) `COMPLETED`/`SKIPPED`, `boss_passed_at IS NULL`, dan ada set `TIER_BOSS_EXAM` `PUBLISHED`. `boss.blocked_reason` bila tidak tersedia: `TIER_LOCKED` | `MODULES_INCOMPLETE` | `NO_BOSS_PUBLISHED` | `ALREADY_PASSED` (urutan prioritas persis seperti ditulis).

## Technical Flow
1. Pengguna baru terdaftar; callback `userCreatedHooks` (SPEC-001) memanggil `GatekeepingService.initializeProgress(tx, userId)`: menyisipkan baris progres `LOCKED` untuk setiap Tier, Modul, Sub-Modul non-`ARCHIVED`, lalu menjalankan `recomputeStatuses`.
2. Pengguna membuka `/peta`; browser memanggil `GET /api/v1/curriculum/tree`.
3. Server menjalankan, dalam satu transaksi, `ensureProgressRows(tx, userId)` (menyisipkan baris yang belum ada dengan `ON CONFLICT DO NOTHING`, mencakup konten yang dipublikasikan setelah pengguna terdaftar) lalu `recomputeStatuses(tx, userId)`.
4. Server membaca Tier, Modul, Sub-Modul, progres, set Skip/Boss `PUBLISHED`, menyusun respons, dan mengembalikannya dengan `Cache-Control: private, no-store`.
5. Spec lain memanggil `assertSubModuleAccessible(tx, userId, subModuleId)` sebelum melayani materi/soal: bila status `LOCKED` melempar `LOCKED_CONTENT` (403); bila sub-modul tidak ada/`ARCHIVED`/bukan `AVAILABLE` melempar `NOT_FOUND` (404).
6. Setelah attempt dinilai, handler tipe attempt (SPEC-006/008/014/015) memanggil fungsi `apply*` di bawah dalam transaksi yang sama dengan penulisan skor, setelah `SELECT ... FOR UPDATE` pada baris progres terkait.
7. Setiap `apply*` diakhiri `recomputeStatuses(tx, userId)` sehingga pembukaan sub-modul/Tier berikutnya langsung tercatat.

### Kontrak Fungsi `GatekeepingService` (`src/server/gatekeeping/service.ts`)
| Fungsi | Masukan | Efek (semua idempoten dan monoton) |
|---|---|---|
| `initializeProgress(tx, userId)` | uuid | membuat baris, lalu `recomputeStatuses` |
| `ensureProgressRows(tx, userId)` | uuid | `INSERT ... ON CONFLICT DO NOTHING` baris yang kurang |
| `recomputeStatuses(tx, userId)` | uuid | menerapkan D4 (hanya `LOCKED -> UNLOCKED`), lalu D5, lalu D6, berurutan Tier 1..4; tidak pernah menurunkan status |
| `markStarted(tx, userId, subModuleId)` | uuid, uuid | `UNLOCKED -> IN_PROGRESS` pada sub-modul; selain itu tidak berubah |
| `assertSubModuleAccessible(tx, userId, subModuleId)` | uuid, uuid | mengembalikan `{ subModule, progress }` atau melempar `NOT_FOUND`/`LOCKED_CONTENT` |
| `applyDrillResult(tx, userId, { subModuleId, scorePercent })` | `scorePercent` numeric 0-100 (2 desimal) | `attempts_count += 1`; `best_score_percent = max(lama, floor(scorePercent))`; bila `scorePercent >= pass_percent` (`sub_modules.passing_score_percent` kecuali `assessment_sets.pass_percent` terisi): status `COMPLETED`, `completed_at` (sekali); bila tidak dan status `UNLOCKED`: `IN_PROGRESS`. Perbandingan lulus memakai aritmetika desimal (sentesimal), bukan float |
| `applySkipResult(tx, userId, { scope: 'MODULE'\|'TIER', targetId, scorePercent, passed })` | | `passed=false`: hanya `skip_best_percent = max(lama, scorePercent)` untuk MODULE; `passed=true`: semua entitas di bawah target yang berstatus `LOCKED`/`UNLOCKED` menjadi `SKIPPED` (`unlock_source='SKIP_TEST'`, `completed_at=now()`), target menjadi `SKIPPED` |
| `applyBossResult(tx, userId, { tierId, percent, band, passed })` | | `boss_best_percent = max`, `boss_best_band = max`; `passed=true`: `boss_passed_at` (sekali), dan bila semua modul selesai Tier menjadi `COMPLETED` |
| `applyPlacementResult(tx, userId, { tierNumber })` | 1-4 | Tier `< tierNumber` beserta isinya `SKIPPED` (`unlock_source='PLACEMENT'`); Tier `tierNumber` menjadi `UNLOCKED` (`PLACEMENT`); `users.placement_completed_at = now()` |
| `adminOverride(tx, adminId, userId, { level, targetId })` | | entitas `LOCKED` menjadi `UNLOCKED` (`unlock_source='ADMIN'`); Tier -> sub-modul pertama chain juga `UNLOCKED`; `audit_log` `PROGRESS_OVERRIDE` |

Fungsi mengembalikan `{ unlocked: Array<{ kind: 'TIER'|'MODULE'|'SUB_MODULE', id: uuid, label: string }> }` (entitas yang berubah ke `UNLOCKED`/`SKIPPED` pada panggilan itu) agar UI hasil menampilkan "Terbuka: ...".

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/curriculum.ts`.

### GET /api/v1/curriculum/tree
- **Auth:** user
- **Success status:** 200
- **Zod:** `CurriculumTreeResponseSchema`
- **Request:** tanpa parameter.

**Response (Success)** (contoh dipotong: respons nyata berisi 4 elemen `tiers`; hanya Tier 1 > Modul 1.1 > dua sub-modul ditampilkan):
```json
{ "data": { "tiers": [ {
  "id": "7a1b2c3d-0001-4000-8000-000000000001", "tier_number": 1, "title": "Foundation", "cefr_level": "A1-A2",
  "target_band_min": 3.0, "target_band_max": 4.0, "status": "IN_PROGRESS", "unlock_source": "DEFAULT", "progress_percent": 12,
  "boss": { "available": false, "blocked_reason": "MODULES_INCOMPLETE", "gate_type": "PERCENT", "gate_value": 80.0, "assessment_set_id": null, "best_percent": null, "best_band": null, "passed_at": null },
  "skip_test": { "available": false, "assessment_set_id": null, "threshold_percent": 85, "time_limit_seconds": null, "question_count": null },
  "modules": [ {
    "id": "7a1b2c3d-0011-4000-8000-000000000011", "module_code": "1.1", "skill_category": "GRAMMAR", "title": "Core Sentence Architecture",
    "order_index": 1, "status": "IN_PROGRESS", "content_state": "AVAILABLE", "progress_percent": 25,
    "skip_test": { "available": false, "assessment_set_id": null, "threshold_percent": 85, "time_limit_seconds": null, "question_count": null },
    "sub_modules": [
      { "id": "7a1b2c3d-0111-4000-8000-000000000111", "sub_module_code": "1.1.1", "title": "Nouns, Pronouns, Articles (a/an/the), & Plurals", "order_index": 1, "status": "COMPLETED", "content_state": "AVAILABLE", "mastery_crown": "SILVER", "best_score_percent": 80, "progress_percent": 100, "has_mini_task": true, "lock_reason": null },
      { "id": "7a1b2c3d-0112-4000-8000-000000000112", "sub_module_code": "1.1.2", "title": "Present Simple vs. Present Continuous", "order_index": 2, "status": "LOCKED", "content_state": "COMING_SOON", "mastery_crown": "NONE", "best_score_percent": 0, "progress_percent": 0, "has_mini_task": false,
        "lock_reason": { "code": "NOT_PUBLISHED", "blocking_sub_module_id": null, "message": "Materi ini belum tersedia. Segera hadir." } }
    ] } ] } ] } }
```
| Field | Tipe | Nullable | Constraint |
|---|---|---|---|
| `tiers[]` | array | tidak | urut `tier_number ASC`; 4 elemen |
| `tiers[].status`, `modules[].status`, `sub_modules[].status` | enum `progress_status` | tidak | D3 |
| `tiers[].unlock_source` | enum `unlock_source` | ya (null bila `LOCKED`) | |
| `*.progress_percent` | int 0-100 | tidak | D7 |
| `boss.gate_type` | `"PERCENT"` \| `"BAND"` | tidak | dari `tiers.boss_gate_type` |
| `boss.gate_value` | number | tidak | 80.0, 5.0, 6.0, 7.0 |
| `boss.assessment_set_id` | uuid | ya | set `TIER_BOSS_EXAM` PUBLISHED, null bila tidak ada |
| `boss.best_percent`, `best_band`, `passed_at` | number / number / string | ya | dari `user_tier_progress` |
| `skip_test.threshold_percent` | int | tidak | `tiers.skip_threshold_percent` (default 85) |
| `skip_test.time_limit_seconds`, `question_count` | int | ya | dari set Skip PUBLISHED |
| `modules[].content_state`, `sub_modules[].content_state` | `"AVAILABLE"` \| `"COMING_SOON"` | tidak | D1 |
| `sub_modules[].mastery_crown` | `"NONE"` \| `"SILVER"` \| `"GOLD"` | tidak | |
| `sub_modules[].lock_reason` | object | ya (null bila tidak `LOCKED`) | `code`: `TIER_LOCKED` \| `PREVIOUS_INCOMPLETE` \| `NOT_PUBLISHED`; `blocking_sub_module_id` uuid atau null; `message` string Indonesia |
Pesan `lock_reason.message`: `TIER_LOCKED` = "Selesaikan Boss Stage Tier {n-1} atau ikuti Uji Kompetensi untuk membuka Tier ini."; `PREVIOUS_INCOMPLETE` = "Selesaikan {judul predecessor} dan capai skor latihan {pass}% untuk membuka."; `NOT_PUBLISHED` = "Materi ini belum tersedia. Segera hadir."

**Response (Error):** hanya kode umum (`UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `RATE_LIMITED`, `INTERNAL_ERROR`).

### POST /api/v1/admin/users/{user_id}/progress/unlock
- **Auth:** admin
- **Success status:** 200
- **Zod:** `AdminUnlockProgressRequestSchema`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `level` | enum | ya | `TIER` \| `MODULE` \| `SUB_MODULE` |
| `target_id` | uuid | ya | id entitas pada level itu |
```json
{ "level": "SUB_MODULE", "target_id": "7a1b2c3d-0112-4000-8000-000000000112" }
```
**Response (Success) 200:**
```json
{ "data": { "level": "SUB_MODULE", "target_id": "7a1b2c3d-0112-4000-8000-000000000112", "status": "UNLOCKED", "unlock_source": "ADMIN" } }
```
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | `user_id` atau `target_id` tidak ada atau `ARCHIVED` |
| 409 | ALREADY_UNLOCKED | Status entitas bukan `LOCKED`. Pesan: "Level ini sudah terbuka." |
| 409 | NOT_AVAILABLE | Entitas `COMING_SOON` (tidak `AVAILABLE`) |

**Kode error yang dilempar service ke endpoint lain** (didaftarkan di sini sebagai pemilik): `LOCKED_CONTENT` (403; body `error.details[0] = { "path": "sub_module_id", "code": "PREVIOUS_INCOMPLETE" | "TIER_LOCKED", "message": "<lock_reason.message>" }`).

## Database Changes
Tidak ada tabel/kolom baru. Memakai `user_tier_progress`, `user_module_progress`, `user_sub_module_progress`, `tiers`, `modules`, `sub_modules`, `assessment_sets`. Kolom yang ditulis service ini: `status`, `unlock_source`, `completed_at`, `best_score_percent`, `attempts_count`, `skip_best_percent`, `boss_best_percent`, `boss_best_band`, `boss_passed_at`, `users.placement_completed_at`. Penulisan ke kolom ini HANYA lewat `GatekeepingService` (aturan lint: impor tabel progres di luar `src/server/gatekeeping/**` dilarang kecuali `learn_*`, `mini_task_completed_at`, `mastery_crown` yang ditulis SPEC-005/016). Penguncian: setiap `apply*` mengambil `SELECT ... FOR UPDATE` pada baris `user_sub_module_progress`/`user_module_progress`/`user_tier_progress` yang disentuh, berurutan menurut `(tier, module, sub_module)` untuk mencegah deadlock.

## UI/UX
Rujukan: `design-system.md` 5.8 Status Skill Tree, 5.9 Skill Tree, 5.3 Card (`locked`), 5.7 Badge/Progress/Skeleton, 8.2 wireframe Peta Belajar.

- Rute `/peta` (komponen `SkillTree`): 4 section Tier berupa `<ol>` bersarang (`aria-label="Tier {n}"`). Header Tier: judul, rentang band target (mis. "Target Band 3.0–4.0"), Progress, Badge status, tombol "Boss Stage" (disabled dengan Tooltip `boss.blocked_reason` berbahasa Indonesia bila tidak tersedia), tombol sekunder "Uji Kompetensi" (hanya bila `skip_test.available`; tujuan `/ujian/mulai/{assessment_set_id}` dari SPEC-008).
- Modul: Card yang dapat di-expand (`aria-expanded`); node Sub-Modul: lingkaran 40px berisi ikon status (Lucide: `Lock`, `PlayCircle`/`CircleDot`, `CheckCircle2`, `FastForward`) + judul + mahkota kecil bila `mastery_crown <> 'NONE'` + teks status. Status tidak hanya warna: selalu ikon + label ("Terkunci", "Sedang dipelajari", "Selesai", "Dilewati").
- Klik node `UNLOCKED`/`IN_PROGRESS`/`COMPLETED`/`SKIPPED` mengarah ke `/belajar/{sub_module_code}`. Node `LOCKED`: fokusable, membuka Popover berisi `lock_reason.message` (+ tombol "Uji Kompetensi" bila Modul/Tier-nya mendukung). Node `COMING_SOON`: label "Segera hadir", tidak dapat diklik.
- Saat dibuka, layar menggulir otomatis ke node `IN_PROGRESS` pertama (atau `UNLOCKED` pertama); denyut halus dimatikan pada `prefers-reduced-motion`.
- Desktop >= lg: grid 2 kolom Modul per Tier + panel detail sub-modul sticky; mobile: satu kolom dengan garis penghubung vertikal 2px (hijau=selesai, biru=aktif, putus-putus abu=terkunci).
- State: loading = Skeleton mencerminkan struktur Tier; error = kartu "Peta belajar gagal dimuat" + Button "Coba lagi"; kosong (tidak ada sub-modul AVAILABLE sama sekali) = "Konten belum tersedia. Segera hadir." di setiap Tier.
- Rute admin: tidak ada UI baru; override progres dipicu dari baris pengguna di `/admin/pengguna` melalui Sheet "Buka level" (Select level + Select target) memanggil endpoint override.

## Acceptance Criteria
- [ ] **Given** pengguna baru dengan konten Tier 1 sub-modul 1.1.1 dan 1.1.2 `PUBLISHED` **When** `GET /curriculum/tree` **Then** Tier 1 `UNLOCKED`, 1.1.1 `UNLOCKED` (`unlock_source=DEFAULT`), 1.1.2 `LOCKED` dengan `lock_reason.code="PREVIOUS_INCOMPLETE"`, Tier 2-4 `LOCKED` dengan `lock_reason.code="TIER_LOCKED"` pada sub-modulnya.
- [ ] **Given** 1.1.1 `UNLOCKED` **When** `applyDrillResult(scorePercent=75.00)` dengan `pass=75` **Then** 1.1.1 `COMPLETED`, 1.1.2 `UNLOCKED` (`unlock_source=SEQUENTIAL`), `best_score_percent=75`, `attempts_count=1`.
- [ ] **Given** pass 75 **When** `applyDrillResult(scorePercent=74.99)` **Then** status tetap `IN_PROGRESS` (dari `UNLOCKED`), `best_score_percent=74`, sub-modul berikutnya tetap `LOCKED`.
- [ ] **Given** best 80 **When** `applyDrillResult(scorePercent=60)` **Then** `best_score_percent` tetap 80, status tetap `COMPLETED`, `attempts_count` +1.
- [ ] **Given** `applyDrillResult` dipanggil dua kali dengan hasil yang sama **When** diperiksa **Then** `completed_at` tidak berubah dan tidak ada sub-modul tambahan terbuka.
- [ ] **Given** sub-modul 1.1.2 berstatus `DRAFT` di antara 1.1.1 dan 1.1.3 `PUBLISHED` **When** 1.1.1 `COMPLETED` **Then** 1.1.3 `UNLOCKED` (rantai melewati yang tidak `AVAILABLE`) dan 1.1.2 tampil `COMING_SOON`.
- [ ] **Given** sub-modul `LOCKED` **When** `assertSubModuleAccessible` dipanggil **Then** melempar `LOCKED_CONTENT` (HTTP 403) dengan `details[0].code = "PREVIOUS_INCOMPLETE"`; untuk sub-modul `ARCHIVED` atau id tak dikenal melempar `NOT_FOUND` (404).
- [ ] **Given** semua modul AVAILABLE Tier 1 `COMPLETED` dan set Boss `PUBLISHED` **When** tree dimuat **Then** `boss.available=true`; **When** `applyBossResult(passed=true)` **Then** Tier 1 `COMPLETED`, `boss_passed_at` terisi, Tier 2 `UNLOCKED` (`unlock_source=BOSS_PASS`), sub-modul pertama Tier 2 `UNLOCKED`.
- [ ] **Given** `applyBossResult(passed=false, percent=70)` **When** dijalankan **Then** `boss_best_percent=70`, Tier 1 tetap belum `COMPLETED`, Tier 2 tetap `LOCKED`.
- [ ] **Given** Modul 2.1 `LOCKED` dengan set Skip `PUBLISHED` **When** `applySkipResult({scope:'MODULE', passed:true, scorePercent:90})` **Then** semua sub-modul 2.1 dan modul `SKIPPED` (`unlock_source=SKIP_TEST`), `skip_best_percent=90`, dan sub-modul pertama modul berikutnya `UNLOCKED`.
- [ ] **Given** Tier 2 `LOCKED` **When** `applySkipResult({scope:'TIER', passed:true})` **Then** seluruh isi Tier 2 `SKIPPED`, Tier 2 `SKIPPED`, Tier 3 `UNLOCKED` dengan `unlock_source=SKIP_TEST`.
- [ ] **Given** modul dengan satu sub-modul `IN_PROGRESS` **When** tree dimuat **Then** `skip_test.available=false` untuk modul itu (D8).
- [ ] **Given** `applyPlacementResult({tierNumber:3})` **When** dijalankan **Then** Tier 1 dan 2 beserta isinya `SKIPPED` (`unlock_source=PLACEMENT`), Tier 3 `UNLOCKED`, sub-modul pertama Tier 3 `UNLOCKED`, dan `users.placement_completed_at` terisi.
- [ ] **Given** sub-modul baru dipublikasikan setelah pengguna terdaftar **When** pengguna memuat tree **Then** baris progres dibuat otomatis (`LOCKED` atau `UNLOCKED` sesuai D4) tanpa error.
- [ ] **Given** sub-modul `COMPLETED` **When** modul mendapat sub-modul baru `PUBLISHED` **Then** status modul dan sub-modul lama tidak turun.
- [ ] **Given** dua `applyDrillResult` serentak untuk pengguna yang sama **When** dieksekusi **Then** tidak terjadi deadlock dan `attempts_count` = jumlah panggilan (uji integrasi 10 iterasi).
- [ ] **Given** admin **When** `POST /admin/users/{id}/progress/unlock` pada sub-modul `LOCKED` **Then** 200, status `UNLOCKED`, `unlock_source=ADMIN`, `audit_log` `PROGRESS_OVERRIDE`; pada sub-modul yang sudah `UNLOCKED` 409 `ALREADY_UNLOCKED`; oleh `learner` 403 `FORBIDDEN`.
- [ ] **Given** tree untuk 4 Tier x 31 sub-modul **When** `GET /curriculum/tree` diukur di mesin lokal **Then** waktu respons p95 < 300 ms dan jumlah query SQL <= 8.
- [ ] **Given** pencarian pada kode **When** `grep` impor tabel progres di luar `src/server/gatekeeping/**` **Then** hanya modul yang diizinkan (aturan lint `no-restricted-imports`) yang menulis kolom status.
- [ ] **Given** E2E Playwright dengan fixture 3 sub-modul **When** pengguna membuka `/peta`, mengetuk node terkunci **Then** Popover menampilkan alasan Indonesia; pada viewport 375x812 tidak ada scroll horizontal.

## Edge Cases & Validation
- [ ] Tier tanpa sub-modul AVAILABLE: `progress_percent=0`, `boss.blocked_reason="MODULES_INCOMPLETE"`, tidak ada error pembagian nol.
- [ ] Dua sub-modul memiliki `order_index` sama dalam modul yang sama: tidak mungkin (indeks unik `sub_modules_module_order_uq`); jika data korup, urutan dipecah oleh `id ASC` dan peringatan `warn` dicatat.
- [ ] `mini_task_json` berupa `{}`: `has_mini_task=false`; berisi `task_type`: `true`.
- [ ] `scorePercent` di luar [0,100] atau bukan angka: `apply*` melempar error internal (`INTERNAL_ERROR` 500) dan transaksi dibatalkan; endpoint publik tidak pernah menerima nilai ini dari klien.
- [ ] Pengguna dengan `status='DISABLED'`: tree 401 (ditolak di `requireUser`).
- [ ] Skip pada Modul yang sudah `SKIPPED`/`COMPLETED`: `applySkipResult` tidak mengubah apa pun (monoton) dan mengembalikan `unlocked: []`.
- [ ] Mengarsipkan sub-modul yang sudah `COMPLETED` oleh pengguna: baris progres dipertahankan, tetapi sub-modul hilang dari tree dan rantai (D1).

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft |
