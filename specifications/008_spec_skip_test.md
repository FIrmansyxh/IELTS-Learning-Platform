# SPEC-008: Fast-Track Test Out / Skip Test Modul & Tier (CUR-03)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-003, SPEC-004, SPEC-006
- **Prioritas:** P0
- **Cakupan:** Backend (handler tipe, cooldown, penerapan hasil) + Frontend (layar pra-ujian generik, hasil Skip)

## User Story
Sebagai Learner yang sudah menguasai suatu Modul atau Tier, saya ingin mengerjakan Uji Kompetensi berwaktu tanpa membuka materi dan, bila skor saya >= 85%, langsung melewati level itu, sehingga saya tidak membuang waktu mengulang yang sudah saya kuasai.

## Non-Goals / Out of Scope
- Tidak membuat mesin attempt/soal (SPEC-006) maupun layar Reading/Listening khusus (SPEC-010/011); Skip Test memakai komponen yang ada.
- Tidak ada Skip untuk satu Sub-Modul (hanya Modul dan Tier, CUR-03).
- Tidak ada pemilihan subset dari bank soal besar; seluruh `questions_json` set disajikan (urutan soal dan opsi diacak).
- Tidak ada penalti poin atau pengurangan progres saat gagal.
- Tidak ada pembahasan atau kunci jawaban pada hasil (kebijakan review EXAM, SPEC-006 D10). **Amandemen D10 (ADR-003 #27, QA F-08-01):** hasil `EXAM` untuk Skip (dan pola yang sama untuk Boss/Placement) TIDAK memuat `is_correct` per `question_id`: `review` bernilai `null`; hanya `per_skill`, agregat (`raw_score`, `max_score`), `score_percent`, `passed`, dan `skip`. Mode `PRACTICE` tetap memuat `review`.
- Tidak ada Skip untuk Modul/Tier yang sudah dimulai (`IN_PROGRESS`/`COMPLETED`/`SKIPPED`).
- Tidak ada pemilihan batas ambang oleh pengguna; ambang = `tiers.skip_threshold_percent`.
- Boss Stage dan Placement punya layar intro sendiri-sendiri di spec masing-masing tetapi memakai endpoint intro generik yang didefinisikan di sini.

## Definisi Tetap
**D1. Ketersediaan.** SPEC-003 D8 (Modul/Tier berstatus `LOCKED`/`UNLOCKED`, tanpa sub-modul `IN_PROGRESS`/`COMPLETED`/`SKIPPED`, set Skip `PUBLISHED`).
**D2. Ambang.** `passed = score_percent >= tiers.skip_threshold_percent` (Tier terkait: Tier itu sendiri untuk `SKIP_TIER_TEST`, Tier pemilik Modul untuk `SKIP_MODULE_TEST`), aritmetika bilangan bulat per-sentesimal (SPEC-006 D7). Batas inklusif: 85.00 lulus, 84.99 gagal.
**D3. Cooldown.** Setelah attempt `GRADED`/`EXPIRED` pada set yang sama, percobaan baru ditolak sampai `submitted_at + app_settings['attempt.cooldown_minutes']` menit (default 60). Kolom acuan: `attempts.submitted_at` attempt selesai terbaru milik pengguna pada set itu.
**D4. Batas harian.** Jumlah attempt (status apa pun kecuali `ABANDONED`) milik pengguna pada set itu dengan `started_at > now() - interval '24 hours'` TIDAK boleh mencapai `app_settings['attempt.max_per_set_per_day']` (default 3) saat memulai attempt BARU. Memulihkan attempt `IN_PROGRESS` tidak dihitung.
**D5. Urutan pemeriksaan saat start** (kode error pertama yang kena dikembalikan): (1) set `PUBLISHED` dan entitas `AVAILABLE` -> `NOT_FOUND`; (2) attempt `IN_PROGRESS` ada -> kembalikan (resume, abaikan 3-6); (3) ketersediaan D1 -> `SKIP_NOT_AVAILABLE`; (4) cooldown -> `COOLDOWN_ACTIVE`; (5) batas harian -> `DAILY_ATTEMPT_LIMIT`; (6) buat attempt `EXAM`, `deadline_at = started_at + time_limit_seconds`.
**D6. Efek hasil.** Dalam transaksi submit/kadaluarsa: simpan `attempts.passed`; panggil `GatekeepingService.applySkipResult({ scope: 'MODULE'|'TIER', targetId, scorePercent, passed })`. Lulus: seluruh entitas di bawah target yang `LOCKED`/`UNLOCKED` menjadi `SKIPPED` dengan `unlock_source='SKIP_TEST'` dan level berikutnya terbuka (SPEC-003). Gagal: hanya `skip_best_percent` Modul diperbarui.
**D7. Attempt kadaluarsa** (`EXPIRED`) dinilai dari jawaban tersimpan; hasilnya tetap memicu D6.

## Technical Flow
1. Learner membuka `/peta`, menekan "Uji Kompetensi" pada Modul/Tier (hanya tampil bila `skip_test.available`); klien membuka `/ujian/mulai/{assessment_set_id}`.
2. Halaman memanggil `GET /api/v1/exams/{assessment_set_id}/intro` dan menampilkan aturan, ambang, batas waktu, jumlah soal, status cooldown.
3. Learner menekan "Mulai Ujian"; klien memanggil `POST /api/v1/attempts` (SPEC-006) dengan `assessment_set_id`.
4. Handler tipe `SKIP_MODULE_TEST`/`SKIP_TIER_TEST` menjalankan D5 dan membuat attempt `EXAM`.
5. Klien membuka `/ujian/{attempt_id}` (`ExamShell` SPEC-006), menyimpan jawaban lewat `PUT /attempts/{id}/answers/{question_id}` tanpa umpan balik.
6. Learner menekan "Akhiri" atau waktu habis; klien memanggil `POST /attempts/{id}/submit` (atau server menilai saat kadaluarsa, D3 SPEC-006).
7. Handler menghitung `passed` (D2), memanggil `applySkipResult` (D6), mengisi ekstensi hasil `skip`, dan mengembalikan `AttemptResultDTO`.
8. Klien membuka `/ujian/{attempt_id}/hasil` dengan dua keadaan: Lulus (level dilewati) atau Belum lulus (kembali ke materi, jam coba ulang).

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/exams.ts`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `CSRF_ORIGIN_MISMATCH`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.

### GET /api/v1/exams/{assessment_set_id}/intro
- **Auth:** user
- **Success status:** 200
- **Zod:** `ExamIntroResponseSchema`
- **Path:** `assessment_set_id` uuid (tipe didukung: `SKIP_MODULE_TEST`, `SKIP_TIER_TEST`; SPEC-014 menambah `TIER_BOSS_EXAM`, SPEC-015 menambah `PLACEMENT_TEST`)

**Response (Success):**
```json
{ "data": {
  "assessment_set_id": "f0a1b2c3-0001-4000-8000-0000000000e1", "assessment_type": "SKIP_MODULE_TEST", "title": "Uji Kompetensi Modul 2.1",
  "scope": { "kind": "MODULE", "id": "7a1b2c3d-0021-4000-8000-000000000021", "label": "Modul 2.1 Complex Grammar & Sentence Combining" },
  "time_limit_seconds": 900, "question_count": 12,
  "threshold": { "kind": "PERCENT", "value": 85 },
  "rules": [ "Skor minimal 85% membuka level berikutnya tanpa membuka materi.", "Waktu 15 menit, berjalan terus walau Anda keluar halaman.", "Tidak ada pembahasan selama ujian.", "Jika belum lulus, tidak ada penalti; Anda dapat mencoba lagi setelah 60 menit (maksimal 3 kali per 24 jam)." ],
  "available": true, "blocked_reason": null,
  "cooldown": { "next_allowed_at": null, "attempts_in_window": 0, "max_attempts": 3 },
  "active_attempt_id": null, "requires_audio": false, "requires_microphone": false,
  "boss": null, "placement": null } }
```
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `scope.kind` | `"MODULE"` \| `"TIER"` | tidak | `SKIP_MODULE_TEST` = MODULE, `SKIP_TIER_TEST` = TIER |
| `threshold` | `{kind,value}` | ya (null untuk `PLACEMENT_TEST`) | Skip: `{kind:"PERCENT", value: tiers.skip_threshold_percent}`; Boss: SPEC-014 |
| `available` | boolean | tidak | D1 DAN cooldown/limit tidak aktif atau ada `active_attempt_id` |
| `blocked_reason` | `"SKIP_NOT_AVAILABLE"` \| `"COOLDOWN_ACTIVE"` \| `"DAILY_ATTEMPT_LIMIT"` \| null | ya | prioritas seperti D5 |
| `cooldown.next_allowed_at` | ISO-8601 | ya | `submitted_at + cooldown` bila masih aktif, selain itu null |
| `cooldown.attempts_in_window` | int | tidak | D4 |
| `active_attempt_id` | uuid | ya | attempt `IN_PROGRESS` pengguna pada set ini |
| `requires_audio` | boolean | tidak | set punya `listening_asset_id` |
| `requires_microphone` | boolean | tidak | set punya soal `SPEAKING_TASK` |
| `boss`, `placement` | object | ya | null untuk Skip |
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Set tidak ada, bukan `PUBLISHED`, tipe tidak didukung endpoint intro, atau entitas tidak `AVAILABLE` |

### POST /api/v1/attempts (kontrak tambahan untuk tipe Skip; bentuk request/response = SPEC-006)
Kode error tambahan untuk set `SKIP_MODULE_TEST`/`SKIP_TIER_TEST`:
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 409 | SKIP_NOT_AVAILABLE | D1 tidak terpenuhi (mis. ada sub-modul di bawah target yang sudah dimulai). Pesan: "Uji Kompetensi tidak tersedia karena level ini sudah dimulai atau diselesaikan." |
| 429 | COOLDOWN_ACTIVE | D3 aktif. Header `Retry-After` (detik). `error.details[0] = { "path": "next_allowed_at", "code": "cooldown_active", "message": "2026-11-03T11:30:00.000Z" }`. Pesan: "Anda dapat mencoba lagi pukul 18:30 WIB." (zona `APP_TIMEZONE`) |
| 429 | DAILY_ATTEMPT_LIMIT | D4 tercapai. Pesan: "Batas percobaan harian untuk ujian ini sudah tercapai." |

### POST /api/v1/attempts/{attempt_id}/submit (ekstensi hasil `skip`)
Untuk attempt Skip, `AttemptResultDTO.skip` terisi (bukan null); `boss` dan `placement` null; `attempt.band_score` null; `attempt.passed` = hasil D2.
```json
{ "skip": { "passed": true, "score_percent": 91.67, "threshold_percent": 85,
  "scope": { "kind": "MODULE", "id": "7a1b2c3d-0021-4000-8000-000000000021", "label": "Modul 2.1 Complex Grammar & Sentence Combining" },
  "skipped_sub_module_count": 4,
  "unlocked": [ { "kind": "SUB_MODULE", "id": "7a1b2c3d-0221-4000-8000-000000000221", "label": "2.2.1 Anatomi Paragraf Akademik" } ],
  "retry": { "next_allowed_at": null, "attempts_remaining_today": 2 } } }
```
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `skip.passed` | boolean | tidak | D2 |
| `skip.skipped_sub_module_count` | int | tidak | 0 bila gagal |
| `skip.unlocked[]` | array | tidak | `[]` bila gagal |
| `skip.retry.next_allowed_at` | ISO-8601 | ya | `submitted_at + cooldown` bila gagal; null bila lulus |
| `skip.retry.attempts_remaining_today` | int | tidak | `max(0, max_per_set_per_day - attempts_dalam_24_jam)` |
Kode error `submit`/`answers` tidak berubah (SPEC-006).

## Database Changes
Tidak ada tabel/kolom baru. Menulis `attempts` (`passed`, `status`), `user_module_progress.skip_best_percent`, status progres via `GatekeepingService`. Seed `app_settings`: `attempt.cooldown_minutes` = 60, `attempt.max_per_set_per_day` = 3 (registri `_api-contract.md` bagian 8). Mendaftarkan `assessmentTypeHandlers.SKIP_MODULE_TEST` dan `SKIP_TIER_TEST` (`start`, `onFinish`, `intro`). Audit: `audit_log` `SKIP_TEST_PASSED` / `SKIP_TEST_FAILED` (`metadata`: `scope`, `target_id`, `score_percent`).

## UI/UX
Rujukan: `design-system.md` 5.19 Mode Ujian, 5.4 Dialog, 5.1 Button, 5.3 Card, 5.7 Badge/Toast, 5.8 status "Dilewati" (ikon `FastForward`).

- **Layar pra-ujian** `/ujian/mulai/[assessment_set_id]` (komponen `ExamIntro`, dipakai juga Boss/Placement): Card berisi judul, `scope.label`, banner informasi "Skor >= 85% membuka level berikutnya tanpa materi" (ikon `Info`), daftar `rules`, ringkasan "12 soal - 15 menit", checklist perangkat (audio bila `requires_audio`, mikrofon bila `requires_microphone`), Button primary `lg` "Mulai Ujian". Bila `available=false`: Button disabled + teks alasan Indonesia (`COOLDOWN_ACTIVE`: "Coba lagi pukul {HH:mm WIB}"; `DAILY_ATTEMPT_LIMIT`: "Batas percobaan hari ini tercapai"; `SKIP_NOT_AVAILABLE`: "Level ini sudah dimulai") dan tautan "Kembali ke Peta". Bila `active_attempt_id`: Button berubah "Lanjutkan Ujian".
- **Berjalan** `/ujian/[attempt_id]`: `ExamShell` (SPEC-006). Tidak ada umpan balik, mahkota, poin, atau navigasi global.
- **Hasil** `/ujian/[attempt_id]/hasil`: skor persen besar + ambang 85% + status. Lulus: ikon `FastForward`, judul "Level dilewati", teks "{n} sub-modul ditandai Dilewati", daftar "Terbuka: ...", Button primary "Buka Peta Belajar". Belum lulus: judul "Belum lulus", pesan suportif "Tidak ada penalti. Pelajari materinya lalu coba lagi.", "Coba lagi setelah {HH:mm WIB}" (bila `next_allowed_at`), Button primary "Mulai Belajar dari Awal Modul" ke sub-modul pertama target, rincian skor per keterampilan (`per_skill`). Tanpa pembahasan atau kunci.
- Keadaan: loading Skeleton; 429 saat mulai -> Dialog informatif (bukan Toast) berisi jam coba lagi; jaringan gagal -> Toast "Gagal memulai ujian. Coba lagi."

## Acceptance Criteria
- [ ] **Given** Modul 2.1 berstatus `LOCKED` dengan set `SKIP_MODULE_TEST` `PUBLISHED` **When** `GET /exams/{set}/intro` **Then** 200, `available=true`, `threshold.value=85`, `scope.kind="MODULE"`, `question_count` = jumlah soal set.
- [ ] **Given** satu sub-modul di Modul 2.1 `IN_PROGRESS` **When** `POST /attempts` pada set Skip modul itu **Then** 409 `SKIP_NOT_AVAILABLE`, tidak ada attempt dibuat; `intro.available=false` dengan `blocked_reason="SKIP_NOT_AVAILABLE"`.
- [ ] **Given** syarat terpenuhi **When** `POST /attempts` **Then** 201, `mode="EXAM"`, `deadline_at = started_at + time_limit_seconds` (selisih tepat), `questions` tanpa kunci.
- [ ] **Given** attempt `EXAM` **When** `PUT answers` **Then** `feedback=null` dan respons tidak memuat `is_correct`.
- [ ] **Given** 11 dari 12 soal benar (skor 91.67) **When** `submit` **Then** `skip.passed=true`, semua sub-modul Modul 2.1 `SKIPPED` dengan `unlock_source="SKIP_TEST"`, modul `SKIPPED`, `user_module_progress.skip_best_percent=91.67`, sub-modul pertama modul berikutnya `UNLOCKED`.
- [ ] **Given** tepat 85.00% **When** `submit` **Then** lulus; **Given** 84.99% (uji dengan poin yang menghasilkan itu) **Then** gagal dan tidak ada entitas berubah status.
- [ ] **Given** hasil gagal **When** `submit` **Then** `skip.passed=false`, `skip.unlocked=[]`, `skip.retry.next_allowed_at = submitted_at + 60 menit`, `attempts_remaining_today = 2`.
- [ ] **Given** percobaan gagal 10 menit lalu **When** `POST /attempts` pada set sama **Then** 429 `COOLDOWN_ACTIVE` dengan `Retry-After` antara 3000 dan 3010 detik dan `details[0].message` berisi ISO `next_allowed_at`.
- [ ] **Given** 3 attempt pada set dalam 24 jam (cooldown sudah lewat) **When** `POST /attempts` ke-4 **Then** 429 `DAILY_ATTEMPT_LIMIT`; setelah attempt tertua melewati 24 jam, percobaan diizinkan.
- [ ] **Given** attempt `IN_PROGRESS` **When** `POST /attempts` pada set sama (termasuk saat cooldown aktif karena attempt lain) **Then** 200 `resumed=true` tanpa hitungan batas baru.
- [ ] **Given** `app_settings['attempt.cooldown_minutes']` diubah ke 0 **When** gagal lalu `POST /attempts` langsung **Then** diizinkan (cooldown nonaktif).
- [ ] **Given** jam server dimajukan melewati `deadline_at + 5 s` **When** `PUT answers` **Then** 409 `ATTEMPT_EXPIRED`, attempt `EXPIRED` dinilai dari jawaban tersimpan dan hasil lulus/gagal diterapkan seperti `submit`.
- [ ] **Given** `submit` serentak 2x **When** diproses **Then** efek (`SKIPPED`, audit) terjadi sekali.
- [ ] **Given** `GET /attempts/{id}` dan `PUT answers` pada mode EXAM **When** payload diperiksa sebelum `submit` **Then** tidak ada `correct_answers`, `explanation_id`, `is_correct` (uji negatif security 6.3.10(f)).
- [ ] **Given** kirim `{"response":{...},"passed":true}` atau `{"score":100}` **When** `PUT answers` **Then** 400 `unrecognized_key`.
- [ ] **Given** attempt milik pengguna lain **When** `submit` **Then** 404 `NOT_FOUND`.
- [ ] **Given** tier skip lulus pada Tier 2 `LOCKED` **When** `submit` **Then** Tier 2 `SKIPPED` (`unlock_source="SKIP_TEST"`), seluruh isinya `SKIPPED`, Tier 3 `UNLOCKED`, dan `skip.unlocked` memuat Tier 3.
- [ ] **Given** set Skip berstatus `DRAFT` **When** `GET intro` atau `POST /attempts` **Then** 404 `NOT_FOUND`.
- [ ] **Given** E2E Playwright (fixture Modul dengan set 6 soal, `time_limit_seconds` 120) **When** learner lulus **Then** `/peta` menampilkan semua sub-modul modul itu berstatus "Dilewati" dan modul berikutnya terbuka; pada skenario gagal, halaman hasil menampilkan jam coba lagi dan tombol Mulai pada intro disabled.

## Edge Cases & Validation
- [ ] `assessment_set_id` bukan uuid pada `intro`: 400 `VALIDATION_ERROR` (`invalid_uuid`).
- [ ] Set Skip tanpa soal objektif: tidak dapat `PUBLISHED` (`NO_OBJECTIVE_QUESTIONS`, SPEC-004); jika terjadi, `POST /attempts` 404.
- [ ] Learner menutup tab saat ujian: jam server tetap berjalan; dashboard TIDAK menampilkan ujian di kartu Lanjutkan Belajar; halaman intro menampilkan "Lanjutkan Ujian" bila belum kadaluarsa.
- [ ] Perubahan `attempt.cooldown_minutes` oleh Admin berlaku untuk percobaan berikutnya, tidak surut.
- [ ] Cooldown dihitung per set dan per pengguna; set Skip Modul lain tidak terpengaruh.
- [ ] Hasil kadaluarsa dengan 0 jawaban: skor 0.00, gagal, cooldown berlaku.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; cooldown dan batas harian dari S-D4 (ADR-003 #18) |
| 2026-11-03 | Backend Engineer | Amandemen D10 (review EXAM = null; ADR-003 #27). Persen tampilan: bila belum lulus tetapi pembulatan menyentuh ambang, dipotong 2 desimal (84,996 -> 84,99; QA F-08-04), keputusan lulus tetap eksak. D1 divalidasi ulang saat selesai: bila sub-modul target sudah dimulai selama ujian, hasil dicatat tanpa efek progres, audit `effect_skipped` (QA F-08-02). |
