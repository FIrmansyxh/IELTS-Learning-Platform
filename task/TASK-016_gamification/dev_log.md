# Dev Log TASK-016 Gamifikasi

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W8)
Dikerjakan terhadap `specifications/016_spec_gamification.md` dan `_api-contract.md` (FINAL). Skema memakai `src/contracts/gamification.ts` (ditambahkan Backend selama pekerjaan; klien dialihkan ke sana lewat `src/lib/api/gamification-contract.ts`, hanya alias tipe). Integrasi nyata dengan backend belum diuji.

### Yang dibuat (semua di `codes/`)
- **API klien** `src/lib/api/gamification.ts` (`stats`, `points`); respons di-parse Zod, drift melempar `RESPONSE_INVALID` (tidak ditambal).
- **Chip header** `components/gamification/stat-chips.tsx` + top bar baru di `components/shell/app-shell.tsx` (sticky, hanya di AppShell; Mode Ujian memakai layout sendiri sehingga tanpa chip; disembunyikan juga saat `must_change_password`): ikon `Flame` (token `streak`) + streak, `Sparkles` + poin, satu `aria-label` "Streak belajar 5 hari, 365 poin". Loading = Skeleton; galat = disembunyikan tanpa Toast.
- **`CrownBadge`** diperluas (ukuran `sm/md/lg` = 16/24/48 px, `showNone` outline putus-putus berlabel, `celebrate` animasi turun skala 0,8 -> 1 300 ms + kilau sekali). Label teks "Emas"/"Perak" dan `aria-label` tetap.
- **`GamificationResult`** (`gamification-result.tsx`) di `DrillResult`: mahkota besar beranimasi bila `crown.changed`, chip "+150 poin" dengan rincian (Jawaban benar, Speed streak, Mahkota, Harian, Total) dalam `<details>`, streak harian, speed streak terbaik, pesan anti-farming bila 0 poin. Confetti halus satu kali (`confetti.tsx`, 14 keping, 1,2 dtk) HANYA bila berubah menjadi Gold; tidak dirender sama sekali saat `prefers-reduced-motion` (hook `hooks/use-reduced-motion.ts`; CSS `@media` di `globals.css` mengganti animasi mahkota/chart menjadi fade 100 ms dan menyembunyikan kilau/confetti). Blok yang tidak sesuai kontrak diabaikan (hadiah tambahan, bukan hasil utama). Hasil Boss: `BossPointsNote` satu baris "+200 poin" tanpa animasi (Mode Ujian tenang).
- **`StatsCard`** di dashboard (slot SPEC-007, `dashboard.tsx`): poin, streak, mahkota emas/perak; `streak_at_risk` -> "Belajar hari ini untuk menjaga streak {n} hari." (nada lembut, tanpa merah); pengguna baru -> ajakan memulai.
- **Profil**: `ProfileStats` (semua angka: streak terpanjang, speed streak terbaik, terakhir aktif) + `PointsHistorySheet` ("Riwayat poin": Sheet dengan tabel `GET /me/points`, mobile kartu, kosong "Belum ada poin.", paginasi).
- `useRefreshProgressOnMount` (`use-stats.ts`): saat hasil Drill/Boss tampil, query `['me','stats']`, `['me','skills']`, `['me','band-predictions']`, `['me','exam-history']` di-invalidate.
- **Perbaikan lintas fitur**: `ui/sheet.tsx` tombol tutup kini berlabel Indonesia "Tutup" (sebelumnya "Close") dengan area sentuh 44 px; Riwayat di navigasi diaktifkan (SPEC-017).
- Teks Indonesia di `src/i18n/id.ts` (`gamification`).

### Uji (Frontend)
`gamification/gamification.test.tsx` (21 tes): CrownBadge (label/ukuran/none), GamificationResult (Silver, Gold + confetti + kilau, reduced-motion tanpa confetti, tanpa perubahan, 0 poin, blok tak valid), DrillResult terintegrasi (tanpa menggandakan mahkota; tanpa blok = hasil lama), invalidasi setelah hasil, BossPointsNote, StatsCard (normal, at-risk, pengguna baru, galat tersembunyi), ProfileStats, PointsHistorySheet (page_size 20, kosong, drift sumber tak dikenal -> galat). `shell/shell.test.tsx`: chip dengan nama aksesibel, tersembunyi tanpa Toast saat galat, tanpa top bar saat `must_change_password`, Riwayat aktif.

### Verifikasi (di `codes/`, 2026-11-03)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus (exit 0) |
| `npx eslint src tests --max-warnings=0` | 3 peringatan, SEMUA di berkas Backend di luar lingkup FE: `src/server/skills/service.ts:16` (`PredictionDTO` tak terpakai), `tests/integration/skills.itest.ts:5` (`afterEach`) dan `:26` (`subId`). `eslint` atas direktori FE (`src/components src/app src/lib src/i18n src/hooks src/contracts tests/unit tests/security`) bersih |
| `npx vitest run` | 65 berkas, 1051 tes lulus |
| `npm run test:integration` | TIDAK dijalankan (di luar lingkup FE) |

### Catatan untuk Backend (tidak ditambal di klien)
- `AttemptResultSchema.gamification` kini bertipe (sudah dilakukan Backend); klien tetap `safeParse` ulang lewat `GamificationBlockSchema` dan menyembunyikan hadiah bila tidak cocok.
- Tidak ada drift ditemukan pada `/me/stats` dan `/me/points`.

### Belum diverifikasi
E2E Playwright (AC "learner lulus skor 92: Emas + chip + confetti satu kali"), tampilan nyata di peramban 375 px / terang-gelap (tidak ada screenshot), audit kontras otomatis, integrasi dengan server nyata.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 16:00 | Frontend W8: chip header, mahkota, hasil, StatsCard, profil, riwayat poin |

## [BACKEND] 2026-11-03 17:00 (Backend Engineer, wave W8)
Target: `specifications/016_spec_gamification.md`. Status: selesai (mock LLM/STT; Postgres 16 lokal). Audit dulu: `user_stats`, `point_ledger` (append-only, REVOKE `app_rw` sudah ada sejak 0002), `attempts.points_awarded`, `attempt_answers.speed_streak_len`, `activityHooks`, `attemptCompletedHooks`, kunci `points.*`/`crown.*` di registri `app_settings`, kolom `mastery_crown` (hanya dibaca `tree`/`player`) sudah ada; yang belum ada: penulis poin/mahkota, indeks unik ledger, endpoint, pendaftaran hook.

### Prasyarat QA yang diselesaikan lebih dulu
- **F-14-06**: `finalize()` (`attempts/service.ts`) melewati hitung ulang D8 untuk `TIER_BOSS_EXAM` (soal Boss milik set anak dan basis waktu = awal section, bukan awal attempt). Tes: waktu jawaban Boss identik sebelum/sesudah submit.
- **F-08-06**: fungsi murni `answerTiming` (`attempts/engine.ts`) dipakai `PUT answers`. `time_spent_ms` tidak berubah, tetapi bila `last_resume_at` lebih baru daripada `max(jawaban sebelumnya, started_at)` (basis digeser resume) jawaban itu TIDAK dikreditkan (`within_target_time=false`, `speed_streak_len=0`). Resume sebelum menjawab tidak lagi memberi bonus; berpikir lama tanpa resume juga tidak. Amandemen SPEC-006 D8 + ADR-003 #33(a).

### Yang dibuat
- **Migrasi** `drizzle/0010_spec_016_points_unique.sql` (hasil `drizzle-kit generate`, hanya indeks) + `src/db/schema.ts`: `point_ledger_once_uq (user_id, source, source_id) WHERE source IN (DRILL, SPEED_STREAK, CROWN, MINI_TASK, BOSS)`.
- **`src/server/gamification/rules.ts`** (murni): `crownFromScore` (perbandingan bilangan bulat tepat), `crownValue`, `incrementalPoints` (G3), `drillCounts`, `appTimezone`, `localDate`, `dayDiff`, `streakStep` (G7), `streakView` (G9).
- **`src/server/gamification/service.ts`** (`GamificationService`, satu-satunya penulis `user_stats`/`point_ledger`/`mastery_crown`): `gamificationHook` (G1-G5, G8; Drill, Boss, Skip), `activityHook` (learn-complete, Mini-Task G6), `recordActivity` (G7), `getStats`, `listPoints`. Urutan kunci konsisten: baris progres sub-modul (sudah dipegang handler) lalu `user_stats FOR UPDATE`. Ledger ditulis `INSERT ... ON CONFLICT DO NOTHING RETURNING` (klaim ganda/serentak tidak mungkin).
- **`register.ts`** didaftarkan lewat `hooks-register.ts` (kini juga diimpor `attempts/service.ts` dan `player/service.ts` agar hook selalu terpasang di semua entry point): `userCreatedHooks` (baris `user_stats`), `activityHooks`, `attemptCompletedHooks` (gamifikasi sebelum skor skill SPEC-017).
- **Endpoint**: `GET /api/v1/me/stats`, `GET /api/v1/me/points` (`page_size` maks 50). Skema `src/contracts/gamification.ts`; `AttemptResultSchema.gamification` kini bertipe. Blok `gamification` disimpan di `attempts.result_json.gamification` (GET result/submit ulang identik) dan `result.progress.mastery_crown` ikut diperbarui; `attempts.points_awarded` = DRILL + SPEED + CROWN.

### Anti-abuse (diuji)
Poin tidak bisa diklaim ganda (submit 2x berurutan, 3x `Promise.all`, indeks unik langsung ke DB); tidak ada farming PRACTICE (6 attempt ulang skor sama = 0 poin tambahan; hanya selisih positif per SET); streak harian memakai jam server + `APP_TIMEZONE` (header zona/waktu klien tidak dipakai; 23:59 vs 00:01 WIB dua hari, UTC satu hari); body klien `points`/`crown` ditolak (`unrecognized_key`); ledger tidak dapat di-UPDATE/DELETE oleh `app_rw`; hook gagal membatalkan seluruh submit (tanpa poin/mahkota parsial); dua sub-modul diserahkan serentak tanpa deadlock.

### Uji
`tests/unit/gamification-rules.test.ts` (21; ambang 74,99/75/89,99/90,00/89,996, streak, zona waktu, `answerTiming`), `tests/integration/gamification.itest.ts` (29): AC contoh 145+5, attempt 2 selisih +10/+5/+50, attempt 3-4 tanpa baris, kegagalan lulus, GOLD tidak turun, Boss lulus/gagal (+F-14-06), Mini-Task sekali, learn-complete, streak 1-2-1, stats 3 hari/kemarin/baru, points pagination/tenant, F-08-06, hook gagal.

### Verifikasi (di `codes/`, dijalankan Backend)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src tests scripts --max-warnings=0` | exit 0 |
| `npx vitest run` | 66 berkas, 1063 tes lulus (sebelum W8: 59 berkas, 905 tes lulus pada catatan Backend W7; angka FE ikut tercakup) |
| `npm run test:integration` | 22 berkas, 576 tes lulus (baseline sebelum pekerjaan ini: 19 berkas, 484 tes; ditambah `gamification` 29, `skills` 28, `curation` 35) |
| `npm run build:worker` dan `next build` (NODE_ENV=production) | lulus (artefak `dist/` dan `.next/` dihapus lagi) |

### Catatan untuk Frontend (kontrak)
- `AttemptResultDTO.gamification` = `{ points:{drill,speed_streak,crown,boss,daily,total}, crown:{previous,current,changed}|null, best_speed_streak, daily_streak_days }` (null untuk Skip, Placement, PRACTICE non-Drill). Untuk Skip hanya `DAILY` yang masuk ledger (blok tetap null). `attempt.points_awarded` tidak memuat `boss` dan `daily`. Boss: `crown=null`, `points.boss=200` saat lulus pertama.
- `/me/stats.daily_streak_days` sudah memperhitungkan G9 (0 bila terlewat); `last_active_date` tanggal lokal.
- Mahkota juga muncul di `GET /curriculum/tree` (`mastery_crown`) dan `progress.mastery_crown` hasil Drill.
- `within_target_time` pada jawaban PRACTICE kini false setelah resume yang menggeser basis (hanya memengaruhi bonus kecepatan, bukan umpan balik).

### Belum diverifikasi
E2E Playwright (AC skor 92 -> Emas + confetti + header streak 1), tampilan nyata/aksesibilitas (Frontend), `next dev` terhadap UI, beban nyata (ledger besar), balapan lintas proses (hanya diuji dalam satu proses dengan banyak koneksi pool). Residual: pengguna yang melihat semua soal Drill sejak awal dapat menjawab cepat setelah membaca (D8 mengukur selang jawaban, bukan waktu tampil); dibatasi G3 (hanya selisih per set).

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 17:00 | Backend W8: poin, mahkota, speed streak, streak harian, ledger, F-08-06/F-14-06 |

---
## [FRONTEND] Perbaikan QA W8 (2026-11-03 19:00)
- **F-16-06 (LOW)**: chip poin di `gamification-result.tsx` tadinya `role="status"` + `aria-label` dengan teks `aria-hidden` (nama tidak terbaca). Kini teks terlihat ("+150 poin") menjadi isi live region; `aria-label` dan `aria-hidden` dihapus, kunci i18n `pointsChipAria` dihapus. Tes diubah mengecek isi region status.
- **F-16-04 sisi klien (LOW)**: `lib/api/gamification-contract.ts` kini punya `PointsListResponseSchema` (skema toleran: `source` string bebas) dan `gamification.ts` memakainya untuk `GET /me/points`. Tipe ledger tak dikenal (mis. `ADJUSTMENT`) tidak lagi menggagalkan seluruh daftar; barisnya berlabel umum "Poin lainnya" (`gamification.points.sourceOther`). Respons rusak lain (mis. `points` bukan angka) tetap menjadi galat. Tes: daftar campuran dan respons rusak.
- Backend tetap disarankan menyaring `ADJUSTMENT` (F-16-04 sisi server) atau menambah nilai ke `PointSource`; klien kini aman di kedua kasus.
- **Ditunda (LOW/INFO, bukan ranah FE atau menunggu keputusan produk)**: F-16-01/02/03/05 (server), F-16-07/08/09 (catatan).
- **Verifikasi (di `codes/`)**: `tsc --noEmit` bersih; `eslint src tests --max-warnings=0` bersih; `vitest run` 66 berkas / 1086 tes lulus. `test:integration`, E2E, dan pemeriksaan pembaca layar nyata tidak dijalankan.

---
## [BACKEND] Perbaikan QA W8 (2026-11-03 20:00)
Keputusan: ADR-003 #34, #35, #38 (perlu tinjauan human); amandemen spec 016.
- **F-16-01 (MEDIUM) ditutup.** `MIN_HUMAN_MS = 2000` di `attempts/engine.ts`: `within_target_time` (dan streak) hanya bila `time_spent_ms >= 2000`; berlaku di `answerTiming` (PUT answers), `computeTimings` (hitung ulang EXAM), dan Placement. `time_spent_ms` tetap jujur. Klaim ADR-003 #33(a) dikoreksi (#34): F-08-06 hanya menutup vektor resume; jawaban beruntun yang dikirim berselang > 2 dtk masih dapat dikreditkan (batasan diketahui; bonus tetap dibatasi G3). Tes: unit `answerTiming`/`computeTimings` (1999/2000 ms, burst 10 x 30 ms) dan integrasi burst 10 jawaban 50 ms -> `speed_streak` 0, `best_speed_streak` 0, tepat 2000 ms dikreditkan. Tes lama `attempts.itest` (jawaban instan menuntut `within_target_time`) kini memakai jam terkendali +3 dtk.
- **F-16-04 ditutup.** `listPoints` menyaring `ADJUSTMENT` pada baris dan `meta.total`. Tes integrasi.
- **F-16-05 ditutup.** `APP_TIMEZONE` divalidasi IANA di `parseEnv` (`Intl.DateTimeFormat`, gagal cepat; hanya nama key dilaporkan). Tes unit `env.test.ts`. Pembacaan `appTimezone()` tetap lewat `process.env` (tes mengubahnya per kasus).
- **Ditunda (LOW/INFO):** F-16-02 (aktivitas harian tanpa jawaban; perlu keputusan produk G7), F-16-03 (hafalan: sebagian dimitigasi F-17-01 untuk radar, bukan untuk poin), F-16-07/08/09 (catatan), F-16-06 (FE, sudah selesai).

### Verifikasi (di `codes/`), satu putaran untuk TASK-016/017/020
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src tests scripts --max-warnings=0` | exit 0 |
| `npx vitest run` | 66 berkas, 1086 tes lulus |
| `npm run test:integration` | 23 berkas, 593 tes lulus (sebelumnya 22 berkas/576; +`qa-w8-fixes.itest.ts` 9 tes dan tes baru di gamification, skills, import) |

### Kontrak baru untuk Frontend (aditif)
- `POST /admin/import-batches/{id}/publish`: body `confirm_reviewed: boolean` (default false); 409 `REVIEW_CONFIRMATION_REQUIRED`; `BatchDTO.summary.has_ai_generated: boolean` (opsional pada skema).
- `GET /me/skills/radar` -> `prediction.sample_size: number | null` dan `prediction.low_sample: boolean` (opsional pada skema; `basis_note` kini dapat memuat kalimat sampel kecil); `range_low/high` melebar ke +/-1,0 saat `low_sample`.
- `POST /admin/{modules|sub-modules}/{id}/status` kini dapat 409 `SET_HAS_ACTIVE_ATTEMPTS`; `PUT answers`/`submit`/`GET attempt` dapat 409 `ATTEMPT_NOT_ACTIVE` untuk PRACTICE basi atau beda versi (FE sebaiknya mengarahkan "mulai ulang").

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 20:00 | Backend QA W8: F-16-01, F-16-04, F-16-05 |
