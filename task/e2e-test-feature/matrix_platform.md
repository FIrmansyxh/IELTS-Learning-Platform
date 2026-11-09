# Matriks AC -> E2E: PLATFORM, PELACAKAN, LINTAS-FITUR

Tester: E2E (Playwright), `/test-feature` Fase 3. Domain C. Kode uji: `codes/tests/e2e/platform-*.spec.ts`, helper `codes/tests/e2e/helpers/platform.ts`.
Legenda: **E2E** = diuji di browser/HTTP nyata oleh spec baru; **API-int** = hanya terjangkau tes integrasi/unit (berkas di `codes/tests/integration|unit`) karena butuh jam/DB/kegagalan injeksi; **Digantikan** = spec lama dibatalkan SPEC-025, yang diverifikasi adalah ketiadaan jalur lama + pengganti; **Manual** = di luar jangkauan E2E otomatis (mesin bersih, GUI OS).

## SPEC-016 Gamifikasi (spec: `platform-gamification.spec.ts`; tambahan di `platform-sweep`, `platform-radar-history`, `platform-cli`)

| AC / Edge | Jangkauan | Berkas / catatan |
|---|---|---|
| AC1: drill 1 -> ledger DRILL/SPEED_STREAK/CROWN/DAILY, `points_awarded`, total | **E2E** (disesuaikan: 10 soal disajikan dari 12, jadi vektor 8/10) | `platform-gamification` "drill #1". Angka DTO `daily`/`total` merah (BUG-1). |
| AC2: attempt ke-2 hanya selisih, naik ke GOLD; attempt ke-3 tanpa baris ledger | **E2E** | "drill #2", "drill #3" |
| AC3: skor 74,99 tidak lulus / AC4: 89,99 SILVER vs 90,00 GOLD | **API-int** (butuh skor pecahan, set 10 soal -> kelipatan 10) | `tests/integration/attempts.itest.ts`, unit gamifikasi. E2E menguji batas 80 (SILVER) dan 90 (GOLD, inklusif). |
| AC5: GOLD tidak turun saat skor 76 | **E2E** (variasi: attempt gagal 40% tidak menurunkan) | "drill #3" |
| AC6: submit ganda / serentak tidak menggandakan ledger | **E2E** (submit ulang sekuensial) ; serentak **API-int** | "submit ulang ... idempoten"; indeks unik `point_ledger_once_uq` di integrasi |
| AC7: jawaban salah mereset speed streak | **E2E** (turunan: `speed_count` dari urutan benar/salah, bonus 10 dan 25) | "drill #1", "drill #2" |
| AC8: Boss lulus +200 sekali / AC9: Mini-Task +20 sekali | **API-int** (set Boss/Mini-Task tidak terbit di konten E2E) | `tests/integration/gatekeeping.itest.ts`, `player.itest.ts` |
| AC10-AC11: streak harian lintas hari, zona waktu `APP_TIMEZONE` | **API-int** (jam server tidak dapat dimajukan di E2E) | unit/integrasi gamifikasi. E2E menguji hari pertama = streak 1, aktivitas ke-2 hari sama tidak menambah DAILY. |
| AC12: `GET /me/stats` streak lewat hari (daily_streak_days=0, `streak_at_risk`) | **API-int** | idem; E2E memverifikasi `streak_at_risk=false` pada hari aktif |
| AC13: pengguna baru semua 0 dan `last_active_date=null` | **E2E** | "profil baru" |
| AC14: `page_size=51` 400, ledger tidak bocor antar user | **E2E** | "GET /me/points", isolasi di `platform-security` |
| AC15: `app_rw` tidak dapat UPDATE/DELETE `point_ledger` | **Digantikan** (SPEC-025 menghapus peran DB; SQLite satu perangkat) | tidak ada |
| AC16: klien tidak mengirim `points`/`crown` (unrecognized_key) | **E2E** | "klien tidak dapat menyuntikkan ..." |
| AC17: E2E skor 92 -> CrownBadge Emas, confetti, reduced-motion | **E2E sebagian**: mahkota Emas/Perak berlabel teks di hasil, peta, StatsCard; confetti/animasi **tidak diuji** (visual) | `platform-gamification` |
| AC18: nama aksesibel chip dan CrownBadge, kontras 4,5:1 | **E2E sebagian**: `aria-label` chip + nama aksesibel (sweep); kontras warna **tidak diukur** | `platform-gamification`, `platform-sweep` |
| Edge: hook gagal membatalkan submit; set tanpa soal benar; target_time null; pengaturan poin 0; akun dianonimisasi | **API-int** (butuh injeksi kegagalan/konfigurasi) ; "pengaturan poin" **E2E** lewat `settings:set points.correct_answer` | `platform-cli` |
| Lintas-fitur: Mix/Simulasi tidak mengubah poin/streak/mahkota | **E2E** | `platform-radar-history` (Mix: stats+ledger identik; Simulasi: poin 0) |
| Chip header: tersembunyi pada mode ujian | **E2E** (sudah di `simulation.spec.ts`; dicek ulang di sweep `/simulasi`) | |

## SPEC-017 Radar & prediksi band (spec: `platform-radar-history.spec.ts`)

| AC / Edge | Jangkauan | Berkas / catatan |
|---|---|---|
| AC1: pengguna kosong -> 6 elemen urut, semua null, prediksi kosong | **E2E** | "pengguna baru" |
| AC2-AC3: vektor R1 (50 jawaban L 40 benar, band 7,5), 60 jawaban pakai 50 terbaru, 4 jawaban band null | **API-int** (butuh 50 jawaban Listening/Reading; konten E2E tidak menyediakan) | `tests/integration/band.itest.ts`, unit skills. E2E: sampel tepat 5 (Grammar) -> band dihitung. |
| AC4: Grammar proksi `is_proxy=true` | **E2E** | "lintas-fitur Mix" (5 soal; skor sesuai hasil attempt) |
| AC5-AC6: `is_correct IS NULL` dan attempt IN_PROGRESS tidak dihitung | **API-int** | |
| AC7-AC8: Writing AI `[6.0,6.5,5.5]`, SELF_ASSESSMENT/injection | **API-int** (AI dimatikan di E2E) | `ai-queue.itest.ts` |
| AC9-AC12: prediksi L/R/W/S, riwayat BOSS/RECALC, idempotensi | **API-int** (Boss/AI tidak terbit) ; E2E: prediksi kosong bila hanya Grammar | |
| AC13: isolasi antar user | **E2E** | "isolasi" |
| AC14: tabel band berganti | **API-int** | |
| AC15: `exam-history` filter palsu 400, hanya EXAM selesai | **E2E** | "endpoint riwayat", "riwayat ujian: simulasi" |
| AC16: p95 < 100 ms, <= 3 query | **API-int/perf** | tidak diukur E2E |
| AC17: `RadarCard` 6 sumbu, garis target hanya bila target, toggle tabel 6 baris, aria-label, EstimasiNotice | **E2E** | "UI radar", "target band" |
| AC18: 375px singkatan Lis/Rea/Wri/Spk/Gra/Voc + tanpa scroll horizontal | **E2E** (project mobile) | "UI radar" |
| AC19: E2E drill Grammar -> radar Grammar > 0, "Indikatif"; Boss -> 1 titik grafik + 1 baris | **E2E sebagian** (Grammar+Indikatif); Boss **tidak terbit** (diganti entri Simulasi di riwayat) | |
| Edge: target null; tabel band tidak aktif; sampel tepat 5/4; flags lama | **E2E** target null + sampel 5 ; sisanya **API-int** | |
| `/riwayat` -> `/riwayat/ujian`, tab "Ujian | Penilaian AI", kondisi kosong | **E2E** | |

## SPEC-025 Aplikasi lokal satu perangkat

| AC / D | Jangkauan | Berkas |
|---|---|---|
| D1 nama 2-40, unik tanpa peduli huruf, maks 10 | **E2E** | `platform-profiles` (UI+API) |
| D2 cookie httpOnly SameSite=Strict tanpa Secure; satu profil auto-masuk; ganti profil (`leave`); 401 -> pemilih | **E2E** | `platform-profiles`, `platform-security` |
| D3 profil pertama lewat "Buat profil" | **E2E** | `platform-profiles` |
| D4 Host asing 403 `HOST_NOT_ALLOWED`; Origin/CSRF; hapus profil konfirmasi nama + cascade | **E2E** | `platform-security`, `platform-profiles` |
| D4 bind `127.0.0.1` saja / skrip menolak `HOSTNAME` non-loopback | **API-int** (`phase4-ops.test.ts`) + **smoke manual** `start:local` | laporan |
| D5/D6 jalur lama + admin tidak ada (halaman 404, API 404, `auth: 'admin'` kosong) | **E2E** (Digantikan: SPEC-001/002/018/019/020) | `platform-security` |
| D7 CLI (`profile`, `progress`, `points`, `settings`, `band`, `doctor`, `db backup`) + efek UI + audit | **E2E** | `platform-cli` |
| D7 bentuk `--profile/--code/--delta` pada teks spec | **Selisih dokumen**: implementasi posisional (README), lihat laporan | |
| D8-D9 SQLite, antrean dalam proses, job menggantung | **API-int** (`ai-queue.itest.ts`, `migration-0002.itest.ts`) | |
| D10 offline: kartu video "butuh koneksi internet" | **API-int/unit** (`video-card.test.tsx`) ; doctor memuat catatan internet **E2E** | |
| D11 + Fase 4 P4-01..P4-25 `start:local` | **Smoke manual terbatas** (port 3055, DB temp): health, `/pilih-profil`, SIGINT bersih; selebihnya **U** (`phase4-ops.test.ts`) | laporan |
| P4-26..29 llama-server; P4-30..32a `.cmd`; P4-58 mesin bersih | **Manual** / unit | |
| P4-32..39b cadangan harian & pemulihan | **E2E sebagian**: `db backup` created/skipped_today + integritas, `doctor` Cadangan OK, `db restore` penolakan tanpa `--yes`/berkas hilang ; sisanya **API-int** (`backup.itest.ts`) | `platform-cli` |
| P4-40..45 `doctor` | **E2E**: exit 0 tanpa GAGAL, DB rusak -> GAGAL + petunjuk, env kosong -> GAGAL ; P4-42/44 **unit** | `platform-cli`, `platform-security` |
| P4-47..49 VideoCard offline | **unit (RTL)** | `video-card.test.tsx` |
| P4-50..57 pembersihan/CI | **G** (git/grep), di luar E2E | |
| Edge: dua tab, hapus profil aktif | **E2E** | `platform-profiles` |
| Edge: port terpakai; DB terkunci/rusak | smoke manual / `doctor` DB rusak **E2E** | |

## SPEC-000 Environment setup (sebagian besar Digantikan SPEC-025: Docker/Postgres dihapus)

| AC | Jangkauan |
|---|---|
| `GET /api/health` 200 `status:"ok"` | **E2E** (`platform-security`, `home.spec`) |
| `/api/health` 503 saat DB mati | **API-int** (mematikan DB tidak aman di stack bersama) |
| Compose/gitleaks/role DB/`bench:ai`/image/UID 1000/SIGTERM worker | **Digantikan / G / di luar E2E** |
| Edge: env wajib kosong -> pesan nama kunci | **E2E** versi pengganti: `doctor` melaporkan `AUTH_SECRET, IP_HMAC_SECRET` |
| Edge: Host di luar `ALLOWED_HOSTS` -> 400 | **Digantikan**: SPEC-025 D4 menetapkan 403 `HOST_NOT_ALLOWED` (diverifikasi) |
| `package.json` versi eksak | **G** |

## Spec yang digantikan SPEC-025

| Spec | Yang diverifikasi |
|---|---|
| SPEC-001 auth/sesi (masuk, daftar, ganti password, lockout, rate-limit login) | `/masuk`, `/daftar`, `/ganti-password` 404; API `auth/login|register|logout|change-password|signup-config` 404; pengganti: sesi profil + cookie SameSite=Strict, 401 tanpa cookie, token rusak 401 + cookie dibersihkan |
| SPEC-002 admin pengguna/undangan | `/admin*` dan `/api/v1/admin/*` 404 (anon dan bersesi); `auth: 'admin'`/`requireAdmin` kosong di `src/`; pengganti: CLI `profile:*`, `points:adjust`, `progress:*` |
| SPEC-018 aset berlisensi, SPEC-019 importer massal, SPEC-020 kurasi (UI admin) | `/admin/assets|import|content` 404, API admin 404; pengganti: `content:import`/`validate`/`bank:validate` (CLI, dipakai runner E2E) |
