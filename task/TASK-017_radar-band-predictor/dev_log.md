# Dev Log TASK-017 Radar 6 Sumbu dan Prediksi Band

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W8)
Dikerjakan terhadap `specifications/017_spec_radar_band_predictor.md` dan `_api-contract.md` (FINAL). Skema dari `src/contracts/skills.ts` (alias tipe di `src/lib/api/skills-contract.ts`). Grafik mengikuti skill `dataviz` (satu seri `primary`, garis 2 px, titik 8 px dengan cincin permukaan 2 px, grid solid hairline, area sentuh >= 24 px, tooltip yang tidak menjadi satu-satunya jalur baca, tabel alternatif, legenda selalu ada). Integrasi nyata belum diuji.

### Yang dibuat (semua di `codes/`)
- **API klien** `src/lib/api/skills.ts` (`radar`, `predictions`, `examHistory`).
- **Radar SVG buatan sendiri** (`components/radar/radar-chart.tsx`, geometri murni di `lib/radar.ts`) menggantikan Recharts: 6 sumbu (Listening, Reading, Writing, Speaking, Grammar, Vocabulary), skala band 0-9, 9 cincin tiap 1,0 (garis solid `border`), isi `primary` 20%, garis target putus-putus `secondary-text` (token berkontras AA) hanya bila `target_band` tidak null + legenda, label tidak dirotasi font 12 px, < 400 px memakai singkatan (Lis, Rea, Wri, Spk, Gra, Voc) dengan legenda lengkap, tooltip saat hover/fokus/ketuk, animasi masuk 400 ms (fade 100 ms saat reduced-motion). Keterampilan tanpa band digambar 0, tanpa titik, dan disebut di legenda "Belum cukup data: ...". Alasan tidak memakai Recharts: kontrol penuh label/singkatan/aksesibilitas, bebas ResizeObserver di jsdom, dan tes geometri deterministik.
- **Tabel alternatif** `radar-table.tsx` (toggle "Lihat sebagai tabel", `aria-pressed`): Skill, Skor %, Band, Sampel, Catatan ("Proksi" untuk Grammar/Vocab, "Belum cukup data"), kartu di mobile; `aria-label` ringkasan "Skor terendah: Reading belum cukup data; tertinggi: Listening 7,5" juga ada pada svg.
- **Kartu Prediksi** `prediction-card.tsx`: `BandBadge` besar, label "Indikatif" bila `complete=false`, rentang, `basis_note`, selisih ke target, `EstimasiNotice` selalu terlihat.
- **`RadarCard`** di dashboard di bawah `StatsCard`: loading Skeleton setinggi chart, galat = kartu "Gagal memuat radar" + "Coba lagi", kosong = "Selesaikan latihan pertama untuk melihat radar Anda." (tanpa chart).
- **Riwayat** `/riwayat` (redirect) -> `/riwayat/ujian`: `history/exam-history.tsx` = grafik garis "Perkembangan Band" (`band-progress-chart.tsx`: sumbu Y 0-9, tanggal awal-akhir, tooltip per titik, tabel alternatif, kosong; bila > 100 titik diambil halaman terakhir) + tabel riwayat ujian (Tanggal, Jenis, Skor, Band, Hasil ikon + teks, tautan "Lihat" ke `result_path` yang disaring tautan internal) dengan filter jenis dan paginasi, kartu di mobile. `history-tabs.tsx` ("Ujian | Penilaian AI", `aria-current`) juga dipasang di `/riwayat/penilaian`. Item navigasi Riwayat diaktifkan.
- Teks Indonesia di `src/i18n/id.ts` (`radar`, `history`).

### Uji (Frontend)
`radar/radar.test.tsx` (24 tes): geometri, 6 label font >= 12 px tanpa rotasi, garis target hanya saat `target_band` ada, cincin solid, singkatan < 400 px, null = pusat tanpa titik, tooltip fokus, ukuran titik, tabel 6 baris + Proksi + aria-label, PredictionCard (Indikatif/lengkap/kosong, disclaimer), RadarCard (loading, toggle tabel, kosong, galat + retry, drift 5 keterampilan -> galat). `history/history.test.tsx` (12 tes): tab, grafik (titik/garis/tick/ringkasan/kosong/tabel/tooltip), daftar ujian, filter jenis, kosong, galat, > 100 titik, `safeInternalPath`.

### Verifikasi (di `codes/`, 2026-11-03)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus (exit 0) |
| `npx eslint src tests --max-warnings=0` | 3 peringatan, SEMUA di berkas Backend di luar lingkup FE: `src/server/skills/service.ts:16` (`PredictionDTO` tak terpakai), `tests/integration/skills.itest.ts:5` (`afterEach`) dan `:26` (`subId`). `eslint` atas direktori FE (`src/components src/app src/lib src/i18n src/hooks src/contracts tests/unit tests/security`) bersih |
| `npx vitest run` | 65 berkas, 1051 tes lulus |
| `npm run test:integration` | TIDAK dijalankan (di luar lingkup FE) |

### Catatan untuk Backend (tidak ditambal di klien)
- `ExamHistoryItemSchema.result_path` hanya `z.string()`; klien menyaring agar hanya tautan internal (`/...`, bukan `//`). Usul: tambahkan `refine` di kontrak.
- Tidak ada drift lain ditemukan pada `/me/skills/radar`, `/me/band-predictions`, `/me/exam-history`.

### Belum diverifikasi
E2E Playwright (Grammar > 0 setelah drill; satu titik setelah Boss), tampilan nyata 375 px terang/gelap (tidak ada screenshot; `viewBox` 340 px dirancang agar label >= 12 px pada lebar 343 px), validasi warna dengan `validate_palette.js` (palet memakai token design-system, bukan palet kategori baru), integrasi dengan server nyata.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 16:00 | Frontend W8: radar, prediksi, riwayat ujian, grafik perkembangan band |

## [BACKEND] 2026-11-03 17:30 (Backend Engineer, wave W8)
Target: `specifications/017_spec_radar_band_predictor.md`. Status: selesai (mock LLM/STT; Postgres 16 lokal). Audit dulu: `user_skill_scores`, `user_band_predictions` (+ `band_pred_user_idx`), fungsi band SPEC-009 (`scaleToForty`, `convertRawToBand`, `averageBand`, `overallBand`, `getActiveTable`), `evaluationGradedHooks` (kosong, dipanggil `ai/pipeline.ts` dan `ai/service.ts` setelah evaluasi tersimpan), `attemptCompletedHooks`, `ai_evaluations.flags` (SPEC-012). Semua dipakai ulang; tanpa migrasi.

### Yang dibuat
- **`src/server/skills/rules.ts`** (murni): persen sentesimal setengah-naik, `aiScorePercentHundredths`, `computePrediction` (R4: overall/indikatif/rentang/`basis_note`), `aiSkillOfKind`, tabel band per skill (`bandTableFor`), `isProxy`.
- **`src/server/skills/service.ts`** (`SkillScoreService`, satu-satunya penulis skor/riwayat): `recomputeObjective` (R1: 50 jawaban terbaru `GRADED`/`EXPIRED`, `is_correct IS NOT NULL`; band bila sampel >= 5; tabel band tidak aktif -> `estimated_band` null + log `band_table_inactive`), `recomputeAi` (R2: 3 submission terbaru dengan evaluasi `AI_LOCAL` non-injeksi, run tertinggi yang memenuhi), `skillScoreHook` (R3a; Boss -> riwayat `BOSS` dengan `attempt_id`), `skillScoreEvaluationHook` (R3b; riwayat `RECALC` hanya bila `x` berubah), `getRadar` (2 query SQL), `listBandPredictions`, `listExamHistory`.
- **`evaluationGradedHooks` terisi**: `skills/register.ts` (via `hooks-register.ts`) memasang `skillScoreEvaluationHook`; `attemptCompletedHooks` mendapat `skillScoreHook` SETELAH `gamificationHook`.
- **Endpoint**: `GET /api/v1/me/skills/radar`, `/me/band-predictions` (page_size maks 100, urut `created_at ASC`), `/me/exam-history` (filter `assessment_type` 4 nilai; hanya EXAM `GRADED`/`EXPIRED` milik user). Skema `src/contracts/skills.ts` (`result_path` divalidasi path internal).
- Evaluasi `SELF_ASSESSMENT` dan `flags.injection_suspected=true` tidak pernah dihitung; evaluasi tanpa `flags` dianggap non-injeksi.

### Uji
`tests/unit/skills-rules.test.ts` (10), `tests/integration/skills.itest.ts` (28): pengguna kosong, vektor R1 (40/50 -> 80,00/7.5; 60 jawaban -> 50 terbaru; 4 vs 5 jawaban; GRAMMAR 12/20 proksi), AI_LOCAL `[6.0,6.5,5.5]` -> 6.0/66,67 dan geser sampel, SELF/injeksi dikecualikan, run tertinggi memenuhi syarat, prediksi lengkap/indikatif, RECALC hanya bila berubah, idempoten, tabel band berganti dan tidak aktif, Drill GRAMMAR via route, Boss (L+R) -> satu baris `BOSS`, penilaian AI Mini-Task via worker + LLM mock, hook gagal membatalkan submit, exam-history (filter, tenant, Placement null, 400), tenant, `getRadar` <= 3 query dan p95 < 100 ms.

### Verifikasi (di `codes/`, dijalankan Backend)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src tests scripts --max-warnings=0` | exit 0 |
| `npx vitest run` | 66 berkas, 1063 tes lulus (sebelum W8: 59 berkas, 905 tes lulus pada catatan Backend W7; angka FE ikut tercakup) |
| `npm run test:integration` | 22 berkas, 576 tes lulus (baseline sebelum pekerjaan ini: 19 berkas, 484 tes; ditambah `gamification` 29, `skills` 28, `curation` 35) |
| `npm run build:worker` dan `next build` (NODE_ENV=production) | lulus (artefak `dist/` dan `.next/` dihapus lagi) |

### Catatan untuk Frontend (kontrak)
- Radar/prediksi/riwayat sesuai skema `src/contracts/skills.ts` (identik dengan `lib/api/skills-contract.ts`). Saran FE (`result_path`) sudah diterapkan di kontrak.
- Prediksi tanpa komponen sama sekali: `basis_note` = "Belum cukup data. Selesaikan latihan dan ujian untuk melihat prediksi." dan semua band null.
- Boss dengan < 5 jawaban per skill objektif: `estimated_band` null sehingga tidak ada titik riwayat `BOSS` (R5a menuntut `x` tidak null). Set Boss nyata perlu >= 5 soal L dan R agar grafik terisi.
- Grammar/Vocabulary tidak mengubah prediksi atau menulis riwayat.

### Belum diverifikasi
E2E Playwright (Grammar > 0 setelah Drill; satu titik setelah Boss), p95 pada dataset besar (hanya 40 pemanggilan lokal), balapan lintas proses antara hook attempt dan hook evaluasi (sengaja tanpa kunci; lihat ADR-003 #33(d)), band dari model LLM nyata.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 17:30 | Backend W8: radar, prediksi, riwayat band & ujian, evaluationGradedHooks terisi |

---
## [FRONTEND] Perbaikan QA W8 (2026-11-03 19:00)
- **F-17-03 (MEDIUM)**: `/riwayat/ujian` kini menampilkan `EstimasiNotice` ("Perkiraan latihan, bukan skor resmi IELTS.") di bawah grafik (`band-progress-chart.tsx`) dan di bawah tabel riwayat (`exam-history.tsx`). Titik BOSS indikatif (`isIndicativePoint`: ada komponen L/R/W/S bernilai null) digambar sebagai belah ketupat berongga, titik lengkap tetap lingkaran terisi (pembeda bentuk, bukan hanya warna); tooltip/aria-label memuat "(indikatif)"; tabel alternatif punya kolom Jenis (Indikatif/Lengkap); legenda titik muncul bila ada titik indikatif.
- **Proksi di grafik radar (F-17-04, bagian proksi)**: label sumbu Grammar/Vocabulary diberi tanda `*` (tspan), tooltip/aria-label memuat "(proksi)", dan legenda "* Proksi: ..." di bawah radar (selain badge di tabel).
- **F-17-02 sisi klien**: Backend menambah `sample_size` dan `low_sample` pada `PredictionSchema` (`src/contracts/skills.ts`); `PredictionCard` menampilkan "Berdasarkan n sampel" dan lencana "Sampel kecil (n)" bila `low_sample === true`. Tanpa field itu kartu tampil seperti sebelumnya (diuji).
- Tes baru: `history.test.tsx` (indikatif vs lengkap, bentuk, legenda, kolom Jenis, disclaimer di halaman), `radar.test.tsx` (proksi di grafik, sampel kecil dan fallback).
- **Ditunda (LOW)**: F-17-05..F-17-10 selain proksi (pemilihan run injeksi/bobot Mini-Task, kunci prediksi, `safeNext`, `loadPoints` multi-halaman, ARIA SVG lanjutan, sumbu waktu proporsional); F-17-11/12 INFO. F-17-01 (dedupe sampel) adalah ranah server.
- **Verifikasi (di `codes/`)**: `tsc --noEmit` bersih; `eslint src tests --max-warnings=0` bersih; `vitest run` 66 berkas / 1086 tes lulus. Tampilan nyata 375 px/terang-gelap belum diperiksa visual.

---
## [BACKEND] Perbaikan QA W8 (2026-11-03 20:00)
Keputusan: ADR-003 #36, #38 (perlu tinjauan human); amandemen spec 017 (R1, R4, vektor uji, kontrak `prediction`).
- **F-17-01 (MEDIUM) ditutup.** `recomputeObjective` memakai `DISTINCT ON (assessment_set_id, question_id)` (jawaban terbaru per soal) lalu 50 terbaru. Mengulang Drill yang sama tidak menambah sampel. Tes integrasi: Drill 10 soal diulang 5 kali -> `sample_size` 10; jawaban terbaru salah menggantikan yang benar; Drill 5 soal diulang 5 kali -> sampel 5, band null.
- **F-17-02 (MEDIUM) ditutup.** `MIN_SAMPLE_FOR_BAND` 5 -> 10; `ADEQUATE_SAMPLE` 30; `computePrediction(c, sampleSize)`: rentang +/-0,5 bila sampel objektif terkecil (Listening/Reading yang punya band) >= 30, selain itu +/-1,0; `prediction.sample_size` dan `prediction.low_sample` aditif (opsional pada skema agar fixture lama tetap valid); `basis_note` ditambah kalimat sampel kecil. FE sudah memakai kedua field (lencana "Sampel kecil (n)"). Tes: unit rules + integrasi (sampel 35 -> 6.0-7.0; sampel 12 -> 5.5-7.5; Boss 10 soal unik -> 8.0-9.0, `low_sample`). Skor lama di DB tidak dihitung ulang massal (dikoreksi saat pemicu berikutnya).
- **F-17-03 (data):** `GET /me/band-predictions[].components` sudah memuat komponen null untuk titik BOSS (diverifikasi), FE menandai indikatif (sudah selesai di FE).
- **Ditunda (LOW/INFO):** F-17-05 (run injeksi terbaru + bobot Mini-Task), F-17-06 (kunci prediksi; hanya sembuh sendiri), F-17-11/12 (indeks/kinerja; ukur bila riwayat > 10^4 jawaban). F-17-04, F-17-07..F-17-10: ranah FE (F-17-04 proksi sudah dikerjakan FE).
- Verifikasi: lihat tabel pada dev_log TASK-016 bagian [BACKEND] perbaikan QA W8.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 20:00 | Backend QA W8: F-17-01, F-17-02 (server), F-17-03 data diverifikasi |
