# Matriks AC -> E2E: domain Ujian dan Penilaian (SPEC-010, 011, 012, 013, 014, 015, 024)

Legenda: **E2E** = diuji di browser/API lewat Playwright (berkas di kolom bukti); **INT** = hanya API/integrasi/unit, sudah ada
di `codes/tests/integration` atau `codes/tests/unit` (tidak diulang di browser); **N/A** = tidak relevan lagi (digantikan
SPEC-025/ADR-004/ADR-005 atau di luar jangkauan E2E). E2E yang sudah ada: `simulation.spec.ts` (Writing/Speaking dalam simulasi),
`learner-journey.spec.ts`, `tracks.spec.ts`, `mix-builder.spec.ts`, `home.spec.ts`.

Konten uji: paket sintetis `codes/tests/fixtures/e2e-content/exams/` (dibangkitkan `generate.mjs`, diimpor lewat CLI
`content-import.ts` oleh `helpers/exams.ts` dan runner). Kendaraan ujian: Skip Modul 1.3 (Reading 2 teks, 6 soal), Skip Modul 2.3
(Listening 2 section, 4 soal, audio WAV nada 12 dtk), Boss Tier 1 (PERCENT 80) dan Tier 2 (BAND 5.0), Placement 30 soal, Mini-Task
Writing 3.3.3 (konten produksi) dan Mini-Task Speaking 3.4.1 (sintetis). Daftar nama tes: `exam-reading|listening|writing|speaking|boss|placement.spec.ts`.

## SPEC-010 Reading split-screen
| AC / Edge | Kelas | Bukti |
|---|---|---|
| `parsePassages` vektor + 4 pemisah + label ganda | INT | `tests/unit/reading.test.ts`, `content-validate.test.ts` |
| 1280x800: dua area overflow-y:auto, scrollHeight <= innerHeight, rasio 50 | E2E | exam-reading: "tata letak desktop" |
| Pembagi: panah kanan 3x -> 65, ke-4 tetap, kiri min 35 | E2E | exam-reading: "pembagi panel" |
| Rasio 40 bertahan setelah muat ulang (`split:v1`) | E2E | exam-reading: "pembagi panel" |
| Sorot kuning: `<mark>`, `hl:v1` start/end benar, tanpa innerHTML | E2E (+lint) | exam-reading: "sorot kuning ..." |
| Sorotan muncul lagi setelah refresh | E2E | exam-reading: "sorot kuning ..." |
| Seleksi lintas paragraf: tanpa toolbar + Toast | E2E | exam-reading: "seleksi lintas dua paragraf" |
| 200 sorotan -> Toast batas | INT | `tests/unit/reading-workspace.test.tsx` (tidak praktis di browser) |
| Label A/B di margin, tidak di teks | E2E | exam-reading: "label paragraf" |
| 3 teks / pilih Teks 2 -> "Teks 2: Soal a-b" | E2E (2 teks) | exam-reading: "Teks 2" |
| EXAM: satu PUT setelah 400 ms; gagal -> "Belum tersimpan" + 3 retry (2/4/8 dtk) | E2E | exam-reading: "ganti jawaban cepat", "gagal simpan jawaban" |
| 375x812: tab Teks/Soal, tanpa scroll horizontal, scroll terjaga <= 2px | E2E (mobile) | exam-reading: "mobile 375px" |
| Bendera: ikon + teks "Ditandai", bertahan setelah refresh | E2E | exam-reading: "tandai soal" |
| localStorage diblokir -> tetap jalan | INT | `reading-workspace.test.tsx` |
| axe-core light + dark: 0 serious/critical | E2E | exam-reading: "aksesibilitas axe-core" |
| Passage 60.000 karakter < 500 ms | N/A (performa; tidak di E2E) | - |
| E2E: sorot, jawab, tandai, kirim -> hasil, review tanpa kunci | E2E | exam-reading: "selesaikan" |
| Edge: passage_no null/korup, tabel tak dapat disorot, zoom 200%, reduced-motion, konten berubah | INT/N/A | unit; tidak diuji browser |
| Hapus sorotan: toolbar Hapus sorotan, Delete pada sorotan terfokus, H / Shift+H | E2E | exam-reading: "sorot hijau", "hapus satu sorotan", "hapus ... keyboard" |

## SPEC-011 Listening ujian terkunci (+ SPEC-024 sisi UI)
| AC / Edge | Kelas | Bukti |
|---|---|---|
| Audio Range 206 + header, 200 tanpa Range, 416, sufiks | E2E (API di browser) + INT | exam-listening: "endpoint audio"; `listening-stream.test.ts` |
| Milik orang lain 404, tanpa sesi 401 | E2E + INT | exam-listening: "endpoint audio" |
| GRADED -> 409 ATTEMPT_NOT_ACTIVE | E2E | exam-listening: "kirim ujian Listening" |
| Set tanpa audio 404, berkas hilang 404 + log, tanpa `attachment` | INT | `listening-stream.test.ts`, `cov-listening-gates.test.ts` |
| DOM EXAM: tanpa Jeda/Mundur/Ulang/Kecepatan, progress aria-readonly, `<audio>` tanpa controls | E2E | exam-listening: "mode EXAM" + "pemutar terkunci" |
| Seek mundur dikembalikan, playbackRate guard | E2E | exam-listening: "guard EXAM" |
| Banner "Audio terhenti." + Lanjutkan Audio dari lastPosition | E2E | exam-listening: "gangguan non-learner" |
| Muat ulang: posisi `audio:v1`, tombol "Lanjutkan Audio" | E2E | exam-listening: "muat ulang halaman" |
| Audio berakhir: status, Putar nonaktif, banner, timer jalan | E2E | exam-listening: "audio berakhir" |
| PRACTICE: Mundur 5 dtk, 0.75x | E2E (drill) | exam-listening: "drill Listening (mode PRACTICE)" |
| Pra-cek audio mengunci "Mulai Ujian" | E2E | exam-listening: "pra-cek audio" |
| Tabs Section tanpa reset jawaban | E2E | exam-listening: "Section 1 / Section 2" |
| 375px: tanpa scroll horizontal, Putar >= 44/56 px | E2E (mobile) | exam-listening: "mode EXAM ..." |
| CSP media-src, Range paralel Safari, WAV 50 MB, koneksi putus | N/A / INT | tidak diuji browser |
| E2E klik bar tidak mengubah posisi, jawab, kirim | E2E | exam-listening: "memutar audio", "kirim ujian" |
| SPEC-024 AC-A9 (catatan `listening.note` + rewind terkunci) | E2E | exam-listening: "pemutar terkunci ... catatan sintetis" |
| SPEC-024 AC-A1..A8, A10, A11, AC-M* (pipeline TTS/ffmpeg, gerbang review, bank) | INT / N/A (manual) | `listening-pipeline.test.ts`, `listening-import.itest.ts` |

## SPEC-012 Writing AI (ADR-004: LLM lokal hanya untuk Writing)
| AC / Edge | Kelas | Bukti |
|---|---|---|
| Kuota, antrean 20, retry/limit, concurrency 1, injeksi, kap skor, JSON invalid, purge, rate limit, admin | INT | `ai-writing.test.ts`, `ai-writing-routes.test.ts`, `ai-queue.itest.ts`; admin/login: N/A (SPEC-025) |
| Mini-Task Writing: kirim -> dinilai (mock) -> EvaluationCard + disclaimer + 4 kriteria | E2E (stack mock) | exam-writing: "AI mock" |
| `AI_ENABLED=false` -> FALLBACK_SELF_ASSESSMENT -> Nilai Sendiri -> hasil | E2E (stack AI off) | exam-writing: "AI nonaktif" |
| Editor: hitung kata live, minimal kata, konfirmasi kirim, Ctrl+Enter, draf lokal | E2E | exam-writing: "editor Writing" |
| `response_too_short` | E2E (API) | exam-writing: "Writing API" |
| Pengiriman serentak -> satu 202 | E2E (stack mock) | exam-writing: "pengiriman kedua" |
| Mock LLM mati -> pesan "tidak tersedia" + Nilai sendiri | INT (mock tak dapat dimatikan dari luar) | `ai-writing.test.ts` |
| XSS `<script>` dirender literal | INT | `writing-task-panel.test.tsx` |
| Writing di Boss/Simulasi | E2E | exam-boss: "section Writing"; `simulation.spec.ts` |
| CLS < 0.1 / latensi 3 dtk | N/A | tidak diukur |

## SPEC-013 Speaking (addendum ADR-004: eksternal)
| AC / Edge | Kelas | Bukti |
|---|---|---|
| Rekam, persetujuan, STT whisper, retensi, ffmpeg, endpoint rekaman | N/A (digantikan ADR-004; pipeline tetap ada tetapi `SPEAKING_AI_ENABLED=false`) | `ai-speaking*.test.ts` |
| Addendum (a): prompt memuat soal + rubrik + format | E2E | exam-speaking: "kartu Speaking eksternal" |
| (b) parser blok PLATFORM RESULT (koma/titik, tolak non-0,5) | E2E + INT | exam-speaking: "tempel blok"; `adr004-writing-gt-speaking-external.test.ts` |
| (c) skor tersimpan menggerakkan radar SPEAKING | E2E | exam-speaking: "simpan skor", exam-boss: radar |
| (d) validasi konteks sama dengan `/submissions/speaking` | E2E (API) + INT | exam-speaking: "validasi konteks"; `speaking-external.itest.ts` |
| Overall dihitung server (0,25 naik, 0,75 naik), klien tak kirim overall, kirim ulang | E2E | exam-speaking: "Overall Speaking", "simpan skor" |
| Speaking di Boss/Simulasi | E2E | exam-boss: "section Speaking"; `simulation.spec.ts` |

## SPEC-014 Boss Stage
| AC / Edge | Kelas | Bukti |
|---|---|---|
| Intro available + section terurut + gate | E2E | exam-boss: "syarat terpenuhi" |
| Modul belum selesai -> 409 BOSS_NOT_AVAILABLE/MODULES_INCOMPLETE; sudah lulus -> BOSS_ALREADY_PASSED | E2E | exam-boss: "sebelum modul...", "hasil Boss" |
| POST /attempts: sections PENDING, questions [], deadline = sum + 1800 | E2E | exam-boss: "mulai ujian" |
| SECTION_ORDER_VIOLATION, SECTION_ALREADY_DONE, section asing 404, PENDING PUT | E2E | exam-boss: "mulai ujian", "section Listening" |
| Start ulang ACTIVE tidak mengubah waktu | E2E | exam-boss: "section Listening" |
| SECTION_EXPIRED + 5 dtk, submit serentak, submit saat ACTIVE, korup | INT | `boss-stage.test.ts`, `attempts.itest.ts` |
| Payload tanpa kunci; hanya section aktif | E2E | exam-boss: "section Listening", "hasil Boss" |
| Lulus/gagal (T1 PERCENT, T2 BAND), Tier berikut terbuka (BOSS_PASS) | E2E | exam-boss: "hasil Boss", "gagal", "Tier 2 (gate BAND)" |
| Vektor D6 (T3/T4) + raw_40 / band | INT | `boss-stage.test.ts`, `band.itest.ts` |
| W/S tidak menentukan kelulusan; estimasi Overall; SELF_ASSESSMENT/injeksi kosong | E2E sebagian + INT | exam-boss (label Masukan, estimasi null); `boss-stage.test.ts` |
| Cooldown / 3 per 24 jam | E2E (cooldown) + INT | exam-boss: "Boss gagal" |
| Audio `?section=` | E2E | exam-boss: "section Listening" |
| Milik orang lain 404 | INT | `endpoint-guards.test.ts` |
| UI: transisi antar section, hasil rincian, 375px | E2E | exam-boss |
| UI intro memuat blok Boss (daftar section, gerbang, catatan advisory, last_result) | E2E | exam-boss: "syarat terpenuhi" |

## SPEC-015 Placement
| AC / Edge | Kelas | Bukti |
|---|---|---|
| `GET /placement` available/blocked (PROGRESS_EXISTS, ALREADY_COMPLETED, NO_PLACEMENT_PUBLISHED, RESULT_PENDING_APPLY) | E2E (sebagian) + INT | exam-placement; `placement.test.ts` |
| Soal pertama difficulty 3, tanpa difficulty/kunci; benar -> 4, salah -> 3 | E2E | exam-placement: "ketersediaan", "UI Placement" |
| QUESTION_ALREADY_ANSWERED / 404 soal belum tersaji | E2E (API) | exam-placement: "ketersediaan" |
| Vektor D4 (150 soal), ofset kesulitan | INT | `placement.test.ts` |
| Apply: tier 3 melewati 1-2, tier lain, atas rekomendasi 409, ganda 409, belum selesai 409 | E2E sebagian + INT | exam-placement: "placement lewat UI", "semua salah", "pilih Tier lain" |
| Kadaluarsa, bank < N soal | INT | `placement.test.ts` |
| E2E penuh 25 soal + /peta + 375px | E2E | exam-placement: "placement penuh 25 soal", "placement lewat UI" |
| Dua perangkat serentak | INT | `attempts.itest.ts` |
| UI: Akhiri, hasil, Select Tier, disclaimer, kartu "menunggu" | E2E | exam-placement |
