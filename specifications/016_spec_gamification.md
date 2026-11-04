# SPEC-016: Gamifikasi (Mahkota Silver/Gold, Poin, Speed Streak, Streak Harian; TRK-03)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-001, SPEC-003, SPEC-005, SPEC-006, SPEC-014
- **Prioritas:** P1
- **Cakupan:** Backend (hook penghitung, ledger poin, statistik) + Frontend (chip header, lencana mahkota, hasil, kartu statistik)

## User Story
Sebagai Learner, saya ingin mendapat mahkota Silver/Gold per sub-modul, poin, bonus Speed Streak untuk jawaban benar yang cepat, dan streak belajar harian, sehingga saya termotivasi belajar teratur dan akurat tanpa mengubah gerbang kurikulum.

## Non-Goals / Out of Scope
- Tidak ada leaderboard, perbandingan antar pengguna, atau fitur sosial.
- Tidak ada penukaran poin, hadiah, atau monetisasi.
- Poin, mahkota, dan streak TIDAK memengaruhi gerbang apa pun (kelulusan hanya dari SPEC-006/008/014).
- Tidak ada penyesuaian poin manual oleh Admin (nilai `ADJUSTMENT` pada enum tidak dipakai).
- Tidak ada notifikasi push/email pengingat streak.
- Tidak ada maskot atau gaya kartun; gamifikasi tampil sebagai aksen kecil (design-system prinsip 4).
- Tidak ada poin untuk Skip Test, Placement, atau menyelesaikan materi (hanya aktivitas harian).
- Tidak menghitung ulang riwayat sebelum spec ini aktif (tidak ada backfill).

## Definisi Tetap
**Pengaturan** (`app_settings`, `_api-contract.md` bagian 8): `points.correct_answer`=10, `points.speed_streak_min`=3, `points.speed_streak_bonus`=5, `points.crown_silver`=50, `points.crown_gold`=100, `points.mini_task`=20, `points.boss_pass`=200, `points.daily_activity`=5, `crown.silver_min`=75, `crown.gold_min`=90.

**G1. Poin Drill** (hook pada attempt `ACTIVE_DRILL` selesai): `drill_points = correct_count * points.correct_answer` dengan `correct_count` = jumlah `attempt_answers.is_correct = true`.
**G2. Speed Streak:** `speed_count` = jumlah jawaban dengan `speed_streak_len >= points.speed_streak_min` (SPEC-006 D8); `speed_points = speed_count * points.speed_streak_bonus`.
**G3. Hanya peningkatan (anti-farming):** poin yang DIBERIKAN = `max(0, nilai_baru - total_sudah_diberikan_untuk_set_itu)`, dengan `total_sudah_diberikan` = `SUM(point_ledger.points)` untuk `user_id`, `source` yang sama (`DRILL` atau `SPEED_STREAK`), dan `source_id` = id attempt-attempt user pada `assessment_set_id` yang sama. Baris ledger hanya ditulis bila poin diberikan > 0; `source_id` = `attempt.id`.
**G4. Mahkota** (hanya bila attempt `passed=true`): `computed = GOLD` bila `score_percent >= crown.gold_min`; `SILVER` bila `>= crown.silver_min`; selain itu `NONE`. `new = max(existing, computed)` berurutan `NONE < SILVER < GOLD` (tidak pernah turun). Bila `new > existing`: tulis `user_sub_module_progress.mastery_crown` dan poin mahkota = `nilai(new) - nilai(existing)` dengan `nilai(NONE)=0`, `nilai(SILVER)=points.crown_silver`, `nilai(GOLD)=points.crown_gold`; ledger `source='CROWN'`, `source_id = attempt.id`.
**G5. Boss:** saat `applyBossResult` MENGISI `boss_passed_at` untuk pertama kali: ledger `source='BOSS'`, `source_id = attempt.id`, `points = points.boss_pass`.
**G6. Mini-Task:** saat `mini_task_completed_at` terisi untuk pertama kali pada sub-modul: ledger `source='MINI_TASK'`, `source_id = sub_module_id`, `points = points.mini_task`.
**G7. Aktivitas harian:** `recordActivity(tx, userId, now)` dipanggil pada: Drill selesai, Skip/Boss selesai, `learn-complete`, penyelesaian Mini-Task. Hari dihitung pada zona `APP_TIMEZONE` (default `Asia/Jakarta`): `today = tanggal lokal(now)`, `last = tanggal lokal(user_stats.last_active_date)`. Dengan baris `user_stats` terkunci `FOR UPDATE`: `last == today` -> tidak ada perubahan; `last == today - 1` -> `daily_streak_days += 1`; selain itu (termasuk NULL) -> `daily_streak_days = 1`; kemudian `longest_daily_streak = max(longest_daily_streak, daily_streak_days)`, `last_active_date = now`, ledger `source='DAILY'`, `source_id = NULL`, `points = points.daily_activity` (sekali per hari lokal karena cabang `last == today` tidak menulis).
**G8. Statistik:** `user_stats.total_points += poin diberikan` pada transaksi yang sama; `best_speed_streak = max(lama, max(speed_streak_len) attempt)`; `gold_crowns`/`silver_crowns` = `COUNT(*)` sub-modul pengguna dengan `mastery_crown='GOLD'`/`'SILVER'` setelah pembaruan. `attempts.points_awarded` = jumlah poin DRILL + SPEED_STREAK + CROWN dari attempt itu.
**G9. Streak saat dibaca:** `GET /me/stats` melaporkan `daily_streak_days = 0` bila `last` lebih awal dari `today - 1` (nilai tersimpan tidak diubah sampai aktivitas berikutnya). `streak_at_risk = true` bila `last == today - 1`.

## Technical Flow
1. Spec ini mendaftarkan `userCreatedHooks` -> `INSERT INTO user_stats(user_id) ... ON CONFLICT DO NOTHING`, dan `attemptCompletedHooks` -> `gamificationHook` (setelah `GatekeepingService`).
2. Learner menyelesaikan Drill; `POST /attempts/{id}/submit` (SPEC-006) memanggil `gamificationHook` dalam transaksi yang sama.
3. Hook menghitung G1-G4, G8 untuk Drill; G5 untuk Boss; memanggil `recordActivity` (G7).
4. Hook mengisi `attempts.points_awarded` dan blok `gamification` pada `AttemptResultDTO`.
5. `PlayerService` (SPEC-005) memanggil `recordActivity` pada `learn-complete` dan G6 + `recordActivity` pada penyelesaian Mini-Task.
6. Klien memuat `GET /api/v1/me/stats` untuk chip header dan kartu statistik, dan `GET /api/v1/me/points` untuk riwayat poin.
7. Klien menampilkan animasi mahkota/poin pada hasil bila `gamification.crown.changed`.

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/gamification.ts`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `RATE_LIMITED`, `INTERNAL_ERROR`. **Auth: user**.

### GET /api/v1/me/stats
- **Success status:** 200 | **Zod:** `StatsResponseSchema`
**Response (Success):**
```json
{ "data": { "total_points": 365, "daily_streak_days": 5, "longest_daily_streak": 7, "best_speed_streak": 6, "gold_crowns": 2, "silver_crowns": 4, "last_active_date": "2026-11-03", "streak_at_risk": false } }
```
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `total_points` | int | tidak | `user_stats.total_points` (>= 0) |
| `daily_streak_days` | int | tidak | G9 |
| `longest_daily_streak` | int | tidak | |
| `best_speed_streak` | int | tidak | |
| `gold_crowns`, `silver_crowns` | int | tidak | G8 |
| `last_active_date` | string `YYYY-MM-DD` (tanggal lokal `APP_TIMEZONE`) | ya | null bila belum pernah aktif |
| `streak_at_risk` | boolean | tidak | G9 |
Pengguna tanpa baris `user_stats`: respons semua 0 dan `last_active_date=null` (baris dibuat lazily).

### GET /api/v1/me/points
- **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `page` | int | tidak | >= 1, default 1 |
| `page_size` | int | tidak | 1-50, default 20 |
Urutan `id DESC`; hanya milik user.
**Response (Success):**
```json
{ "data": [ { "id": 1042, "source": "CROWN", "points": 50, "note": "Mahkota Perak 2.1.3", "source_id": "9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a", "created_at": "2026-11-03T10:34:12.000Z" } ], "meta": { "page": 1, "page_size": 20, "total": 1 } }
```
`source` salah satu `DRILL`, `SPEED_STREAK`, `CROWN`, `MINI_TASK`, `BOSS`, `DAILY`; `note` <= 200 karakter (mis. "Latihan 2.1.3: 8 benar", "Speed streak 3x", "Aktivitas harian"); `source_id` uuid atau null.
**Response (Error):** hanya kode umum (`VALIDATION_ERROR` bila `page_size` > 50).

### Ekstensi `AttemptResultDTO.gamification` (SPEC-006, field baru; null sebelum SPEC ini aktif dan untuk tipe selain `ACTIVE_DRILL`/`TIER_BOSS_EXAM`)
```json
{ "gamification": { "points": { "drill": 80, "speed_streak": 15, "crown": 50, "boss": 0, "daily": 5, "total": 150 },
  "crown": { "previous": "NONE", "current": "SILVER", "changed": true },
  "best_speed_streak": 4, "daily_streak_days": 5 } }
```
`points.total` = jumlah poin diberikan pada attempt ini termasuk `daily`; `attempt.points_awarded` = `drill + speed_streak + crown` (tanpa `boss` dan `daily`). Untuk Boss: `crown` null, `points.boss` terisi.

## Database Changes
Migrasi bertag `spec_016_points_unique`: indeks unik parsial pada `point_ledger`:
```sql
CREATE UNIQUE INDEX point_ledger_once_uq ON point_ledger (user_id, source, source_id)
  WHERE source IN ('DRILL','SPEED_STREAK','CROWN','MINI_TASK','BOSS');
```
Tidak ada tabel/kolom baru lain (memakai `user_stats`, `point_ledger`, `user_sub_module_progress.mastery_crown`, `attempts.points_awarded`, `attempt_answers.speed_streak_len`). Seed `app_settings`: kesepuluh kunci di atas. Penulisan `user_stats` dan `point_ledger` hanya lewat `GamificationService` (`src/server/gamification/service.ts`); `app_rw` tidak boleh UPDATE/DELETE `point_ledger` (SPEC-000). `user_stats.last_active_date` bertipe timestamptz (instan aktivitas terakhir).

## UI/UX
Rujukan: `design-system.md` 5.18 Mahkota Silver/Gold, 2.3 token Gamifikasi, 5.7 Badge/Toast, 5.5 Navbar (top bar), 6 Interaction & Motion (reduced motion), 8.1 wireframe Dashboard.

- **Chip header** (top bar `AppShell`): ikon `Flame` (token `streak`) + angka `daily_streak_days`, ikon `Sparkles` (chip amber) + `total_points`; `aria-label` "Streak belajar 5 hari, 365 poin". Disembunyikan pada Mode Ujian.
- **`CrownBadge`** (ukuran 16/24/48): Gold fill `crown-gold`, Silver `crown-silver`, belum = outline putus-putus `crown-none`; selalu disertai label "Emas"/"Perak" atau `aria-label` ("Mahkota Emas, skor 92%"). Tampil di node sub-modul (SPEC-003), ringkasan sub-modul, `DrillResult`, dan profil.
- **`DrillResult`:** menampilkan `CrownBadge` besar, chip poin "+150 poin" (rincian Drill, Speed Streak, Mahkota, Harian dalam Tooltip/daftar), streak harian. Momen perolehan: mahkota turun skala 0.8 -> 1 (300 ms, spring ringan) + kilau satu kali; confetti halus 1x maks 1,2 detik HANYA saat berubah menjadi Gold; dimatikan pada `prefers-reduced-motion` (diganti fade 100 ms).
- **Kartu `StatsCard`** di dashboard (slot SPEC-007): total poin, streak, mahkota emas/perak; bila `streak_at_risk`: teks lembut "Belajar hari ini untuk menjaga streak {n} hari." (tanpa nada menekan, tanpa warna merah).
- **Profil** `/profil`: Card "Statistik" (semua angka) dan tautan "Riwayat poin" membuka Sheet berisi Table `GET /me/points` (kolom Waktu, Sumber, Poin; mobile kartu; kosong: "Belum ada poin.").
- State: loading Skeleton chip; error memuat stats = chip disembunyikan tanpa Toast (non-kritis).

## Acceptance Criteria
- [ ] **Given** drill pertama 8 dari 10 benar dengan streak per jawaban `[1,2,3,4,0,1,2,3,0,1]` dan `speed_streak_min=3` **When** `submit` **Then** ledger berisi `DRILL +80` dan `SPEED_STREAK +15` (3 jawaban >= 3), `attempts.points_awarded = 95 + 50` bila lulus dengan skor 80 (juga `CROWN +50` SILVER) = 145, dan `user_stats.total_points` naik 150 termasuk `DAILY +5` bila hari baru.
- [ ] **Given** attempt kedua pada set sama dengan 9 benar (90) dan streak count 4 **When** `submit` **Then** `DRILL +10` (90 - 80), `SPEED_STREAK +5` (20 - 15), dan mahkota berubah ke GOLD (`score 90.0 >= gold_min`) dengan `CROWN +50` (100 - 50); attempt ketiga dengan 7 benar -> tidak ada baris ledger DRILL/SPEED/CROWN baru.
- [ ] **Given** skor 74.99 pada ambang lulus 75 **When** `submit` **Then** `passed=false`, `mastery_crown` tetap `NONE`, tidak ada poin `CROWN`.
- [ ] **Given** skor 89.99 lulus **When** dihitung **Then** SILVER (bukan GOLD); skor 90.00 -> GOLD.
- [ ] **Given** mahkota GOLD tercapai **When** attempt berikutnya skor 76 **Then** `mastery_crown` tetap GOLD dan tidak ada poin mahkota.
- [ ] **Given** `submit` dipanggil dua kali (atau serentak) **When** diperiksa **Then** baris ledger tidak ganda dan `total_points` hanya naik sekali (indeks unik `point_ledger_once_uq` + idempotensi SPEC-006).
- [ ] **Given** jawaban salah menyela streak **When** `speed_streak_len` dihitung **Then** direset ke 0 dan jawaban benar berikutnya dalam target mulai dari 1.
- [ ] **Given** Boss lulus pertama kali **When** `submit` **Then** ledger `BOSS +200` sekali; Boss lulus lagi tidak mungkin (`BOSS_ALREADY_PASSED`); Boss gagal -> tidak ada poin Boss.
- [ ] **Given** Mini-Task selesai pertama kali **When** `mini_task_completed_at` terisi **Then** ledger `MINI_TASK +20` sekali per sub-modul; menyelesaikan lagi tidak menambah.
- [ ] **Given** aktivitas pada 2026-11-03 10:00 WIB, 2026-11-04 09:00 WIB, lalu 2026-11-06 **When** `recordActivity` dipanggil **Then** `daily_streak_days` = 1, 2, 1 dan `longest_daily_streak=2`; dua aktivitas pada hari lokal yang sama menambah `DAILY` sekali.
- [ ] **Given** aktivitas pukul 23:59 WIB lalu 00:01 WIB (hari berikutnya) **When** dihitung dengan `APP_TIMEZONE=Asia/Jakarta` **Then** dianggap dua hari berbeda (streak naik 1); dengan `APP_TIMEZONE=UTC` aktivitas pukul 16:59 UTC dan 17:01 UTC tetap hari yang sama.
- [ ] **Given** `last_active_date` 3 hari lalu **When** `GET /me/stats` **Then** `daily_streak_days=0`, `streak_at_risk=false`; `last_active_date` kemarin -> `streak_at_risk=true` dan `daily_streak_days` sesuai tersimpan.
- [ ] **Given** pengguna baru **When** `GET /me/stats` **Then** semua angka 0 dan `last_active_date=null`.
- [ ] **Given** `GET /me/points?page_size=51` **When** dipanggil **Then** 400 `VALIDATION_ERROR`; ledger milik user lain tidak pernah muncul.
- [ ] **Given** `app_rw` **When** mencoba `UPDATE`/`DELETE` pada `point_ledger` **Then** ditolak DB.
- [ ] **Given** hasil drill **When** payload diperiksa **Then** klien tidak mengirim dan server tidak menerima field `points`/`crown` dari body mana pun (uji `unrecognized_key` pada endpoint attempt).
- [ ] **Given** E2E Playwright (fixture drill) **When** learner lulus dengan skor 92 pertama kali **Then** `DrillResult` menampilkan `CrownBadge` Emas berlabel teks, chip poin, dan confetti satu kali; dengan `prefers-reduced-motion` tidak ada confetti; header menampilkan streak 1.
- [ ] **Given** audit aksesibilitas **When** chip header dan `CrownBadge` diperiksa **Then** semua punya nama aksesibel teks dan kontras >= 4.5:1 light/dark.

## Edge Cases & Validation
- [ ] Hook gagal (error DB): seluruh `submit` dibatalkan; tidak ada poin parsial.
- [ ] Set tanpa soal objektif benar (`correct_count=0`): tidak ada baris DRILL/SPEED; mahkota tidak berubah; `recordActivity` tetap dipanggil.
- [ ] `target_time_ms` null: memakai `app_settings['speed.default_target_ms']` (SPEC-006 D8).
- [ ] Perubahan `crown.silver_min`/`gold_min` oleh Admin: berlaku untuk attempt berikutnya, mahkota lama tidak turun.
- [ ] Pengaturan poin bernilai 0: tidak ada baris ledger untuk sumber itu.
- [ ] Akun terhapus/dianonimisasi: `user_stats`/`point_ledger` dipertahankan tanpa identitas (SPEC-002).

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; streak harian (ADR-003 #5), indeks unik ledger (security 6.3.6) |
| 2026-11-03 | Backend Engineer | Implementasi backend (aditif; migrasi `0010_spec_016_points_unique`). Klarifikasi: (1) hook `userCreatedHooks` membuat `user_stats`; baris juga dibuat lazily untuk pengguna lama; `activityHooks` menangani `LEARN_COMPLETE` dan `MINI_TASK_COMPLETE` (+poin G6) sedangkan `DRILL_SUBMIT` diabaikan: aktivitas Drill/Skip/Boss dicatat `gamificationHook` sesuai tipe (Placement dan `BOSS_SECTION` tidak mencatat aktivitas); (2) ambang mahkota dibandingkan dalam bilangan bulat tepat (`raw*100 >= min*max`), jadi 89,996% tetap SILVER walau tampil 90,00; (3) blok `gamification` disimpan di `attempts.result_json.gamification` sehingga `GET result`/submit ulang identik, dan `result.progress.mastery_crown` diperbarui; (4) G5 Boss: sekali per set Boss (baris `BOSS` pada attempt lain di set yang sama menutup klaim ulang); `attempts.points_awarded` Boss = 0; (5) `daily_streak_days` pada blok = streak terkini, `best_speed_streak` = nilai pengguna setelah pembaruan; (6) hari lokal memakai jam server dan `APP_TIMEZONE` yang dibaca tiap panggilan (zona tidak valid jatuh ke Asia/Jakarta); jam mundur (`last >= today`) tidak mengubah apa pun; (7) bonus kecepatan hanya dari Drill dan bergantung pada amandemen SPEC-006 D8 (F-08-06) dan F-14-06; (8) `gold_crowns`/`silver_crowns` dihitung ulang hanya saat mahkota berubah; (9) format `note`: `Latihan 2.1.3: 8 benar`, `Speed streak 3x`, `Mahkota Perak|Emas 2.1.3`, `Mini-Task 2.1.3`, `Boss Stage Tier 2 lulus`, `Aktivitas harian`. Skema Zod `src/contracts/gamification.ts`; `AttemptResultSchema.gamification` kini bertipe. |
| 2026-11-03 | Backend Engineer | Amandemen QA W8 (ADR-003 #34-#35): (1) F-16-01: kredit `within_target_time` (dan streak) hanya bila `time_spent_ms >= 2000` (batas manusia, konstanta `MIN_HUMAN_MS`); `time_spent_ms` tetap jujur; berlaku pada PUT answers, hitung ulang EXAM, dan Placement; (2) F-16-04: `GET /me/points` menyaring `source = 'ADJUSTMENT'` (baris dan `meta.total`) agar kontrak `PointSource` FE tidak pecah; `total_points` tetap memuat penyesuaian; (3) F-16-05: `APP_TIMEZONE` divalidasi sebagai zona IANA saat `parseEnv` (gagal cepat). Tanpa migrasi. |
