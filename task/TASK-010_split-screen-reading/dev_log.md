# Dev Log TASK-010: Split-Screen Reading dengan Highlighter

## [BACKEND] 2026-11-03 13:15 (Backend Engineer, wave W5)

**Spec:** 010 | **Status:** Completed (sisi server)

### Hasil audit (tidak ada yang diduplikasi)
SPEC-010 sengaja frontend-dominan; kontrak data BE sudah dipenuhi mesin SPEC-004/006:
- `AttemptDTO.passage_markdown` = `assessment_sets.reading_passage_markdown` apa adanya (`src/server/attempts/dto.ts`), `QuestionPublicDTO.passage_no`/`section_no` dari soal (`engine.ts`). Set bacaan/audio mempertahankan urutan asli (`keepOrder`, `handlers.ts`) sehingga nomor global "Teks 2: Soal a-b" stabil.
- Validator konten (`src/server/content/passages.ts`, `validate.ts`): `too_many_passages`, `duplicate_paragraph_label`, `passage_out_of_range`, `passage_required`.
- Tidak ada endpoint baru, tidak ada perubahan skema DB, tidak ada perubahan kontrak API. Sorotan/bendera/rasio hanya `localStorage` (FE).
- `parsePassages` sisi UI (`src/lib/reading/parsePassages.ts`) milik Frontend; tidak disentuh. Pemisah server = baris PERSIS `===PASSAGE===` (`\r?\n===PASSAGE===\r?\n`), harus identik dengan implementasi UI.

### Tes yang ditambahkan
- `tests/unit/passages-spec010.test.ts` (7): vektor uji SPEC-010 pada utilitas server, pemisah persis, 3 vs 4/5 teks (`too_many_passages`), label ganda per-teks vs lintas-teks, format label, `passage_out_of_range`.
- `tests/integration/reading.itest.ts` (9): `passage_markdown` byte-per-byte (HTML mentah, tabel, Unicode, pemisah) pada start/resume/GET; perubahan teks oleh admin tercermin; `null` bila tanpa teks; teks 60.000 karakter; tanpa kunci jawaban di soal publik; `passage_no` per soal + null + urutan stabil (Teks 2 = soal 5-8 dari urutan global); urutan tidak berubah setelah menjawab; `passage_no` di luar jumlah teks dilayani apa adanya; alur EXAM end-to-end (jawab ulang, tanpa feedback, submit, hasil).

### Verifikasi (codes/, 2026-11-03)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npx vitest run` | 38 berkas, 540 tes lulus |
| `npm run test:integration` | 15 berkas, 316 tes lulus (Postgres 16 lokal) |
| `npx eslint src tests scripts --max-warnings=0` | 1 peringatan di berkas FE `src/components/listening/listening-player.tsx:304` (`jsx-a11y/role-supports-aria-props`, `aria-readonly` pada `role="progressbar"`); kode Backend bersih |
Tidak diverifikasi: seluruh AC UI (layout, pembagi, sorotan, axe, performa render), E2E Playwright.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 13:15 | Backend W5: audit kontrak data + tes unit/integrasi; tanpa perubahan kontrak |


---

## [FRONTEND] 2026-11-03 13:20 (Frontend Engineer, wave W5)

Spec: `specifications/010_spec_split_screen_reading.md` terhadap `specifications/_api-contract.md` (FINAL). Tidak ada endpoint baru; klien memakai `AttemptSchema` (Zod) yang sudah memuat `passage_markdown`, `passage_no`.

### Yang dibangun
- `src/lib/reading/parsePassages.ts`: `parsePassages(markdown): Passage[]` sesuai vektor uji spesifikasi; > 3 teks melempar `PassageParseError('too_many_passages')`; label duplikat melempar `duplicate_paragraph_label`. `src/lib/reading/storage.ts`: akses `localStorage` (`hl:v1`, `flag:v1`, `split:v1`, `audio:v1`) selalu try/catch, divalidasi Zod; sorotan yang rentangnya melebihi panjang paragraf dibuang tanpa galat.
- `src/components/reading/`: `ReadingWorkspace` (>= 1024px dua panel dengan pembagi `role=separator` ARIA, panah kiri/kanan langkah 5, 35-65, tersimpan; < 1024px tab "Teks | Soal" dengan posisi scroll tiap tab dipertahankan), `PassagePanel` (Segmented Teks 1-3, label paragraf di margin `aria-label="Paragraf A"`, toolbar sorot mengambang, "Hapus semua sorotan" dengan Dialog), `paragraph-runs.ts` (paragraf -> segmen React `<mark>`; penekanan `**`/`*` dan daftar didukung; tabel/kode tidak dapat disorot), `selection.ts` (Selection/Range -> `{paragraph_index,start,end}` offset karakter mentah; lintas paragraf = tanpa toolbar + Toast sekali per sesi), `use-highlights.ts` (maks 200 + Toast "Batas sorotan tercapai."), `parse-attempt.ts`.
- Pintasan: `H` kuning, `Shift+H` hijau, `Delete`/`Backspace` pada sorotan terfokus, `Alt+Panah` soal berikutnya/sebelumnya (mengikuti preferensi pintasan `/profil`).
- `src/components/exam/`: `grouped-exam.tsx` (pengelompokan soal per Teks/Section dengan nomor global, judul "Teks 2: Soal 14-26", mode tab mengelompokkan "Soal Teks n", footer Soal sebelumnya/berikutnya + Daftar soal (Sheet bawah) + Kirim), `question-group.tsx` (daftar soal memakai `QuestionRenderer`, tombol bendera `aria-pressed`, penanda "Belum tersimpan" ikon `CloudOff` + teks). `ExamSession` dipakai ulang: tata letak kelompok hanya aktif bila `passage_markdown`/`listening` tidak null; alur soal-per-layar lama tidak berubah.
- `ExamSession`: backoff simpan jawaban 2/4/8 detik (maks 3) lalu Toast "Coba lagi"; bendera tersimpan di `flag:v1:{attempt_id}`; sinkronisasi jam server `GET /attempts/{id}` tiap 60 detik (hanya mengoreksi skew, jawaban lokal tidak diubah; status bukan IN_PROGRESS -> ke hasil). `ExamShell`: prop `layout="workspace"` (setinggi viewport, tanpa scroll halaman) dan `footer`. `QuestionNavigatorGrid`: item `unsaved`.
- `ActiveDrill` (PRACTICE): bila ada teks bacaan, dirender di `ReadingWorkspace` (soal saat ini di panel kanan; "Periksa" tetap).
- Token `--color-highlight-yellow/green` (terang/gelap) di `globals.css` dan `design-system.md` bagian 9; teks di atasnya `--color-text` (kontras kira-kira 6:1 gelap, > 10:1 terang). Teks i18n: `src/i18n/id.ts` (`reading.*`, `exam.run.*`).

### Keputusan dan deviasi
1. Navigator pada tata letak kelompok memakai Sheet bawah di semua lebar (spec: Sheet di mobile, panel bawah di desktop). Alasan: AC mensyaratkan hanya dua area `overflow-y: auto` dan tanpa scroll halaman.
2. Sorotan dirender dari teks paragraf mentah (offset karakter); penanda Markdown (`**`, `*`, `- `) tidak dirender dan tidak punya node teks, tetapi tetap terhitung pada offset. Bila Backend/Analyst ingin offset terhadap teks tanpa penanda, perlu perubahan spec.
3. `src/server/content/passages.ts` (Backend) punya `parsePassages` sendiri dengan bentuk berbeda (`ParsedPassage`); versi spec `src/lib/reading/parsePassages.ts` dibuat di sisi klien tanpa menyentuh server.

### Catatan untuk Backend
- Tidak ada drift kontrak yang ditemui: DTO `passage_markdown` (string|null) dan `passage_no` sesuai. Bila `passage_markdown` berisi 4+ teks, UI menampilkan kartu "Teks bacaan tidak dapat ditampilkan" (validator SPEC-004 seharusnya sudah menolak).
- `passages.ts` server dan `parsePassages.ts` klien duplikat; pertimbangkan validator server memakai berkas bersama agar satu sumber (opsional).

### Verifikasi (dijalankan di `codes/`, 2026-11-03)
`npx tsc --noEmit` bersih; `npx eslint src tests --max-warnings=0` bersih; `npx vitest run`: 42 berkas, 589 tes lulus. Tes: `lib/reading/parsePassages.test.ts` (6), `lib/reading/storage.test.ts` (4), `components/reading/reading.test.tsx` (23), `components/quiz/active-drill-media.test.tsx` (2). Audit axe-core ad hoc (jsdom, tanpa color-contrast) pada Reading split dan tab: 0 pelanggaran.
Belum diverifikasi: visual terang/gelap dan 375px di peramban nyata, drag pembagi dengan pointer, `performance.measure` 60.000 karakter, kontras sorotan terukur, E2E Playwright, pembaca layar, seleksi sentuh di perangkat nyata.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 13:20 | Frontend W5: ReadingWorkspace, highlighter, pengelompokan soal, backoff simpan, sinkron 60 detik |

## [FRONTEND] Perbaikan QA W5 (2026-11-03)
- F-10-04: Alt+Panah selalu `preventDefault` (juga di soal pertama/terakhir); tes baru di reading.test.tsx.
- F-10-03: `clearExamStorage()` (hl/flag/audio/split) dipanggil pada logout sukses dan saat 401 di AuthGate; `clearAttemptStorage(id)` dipanggil saat hasil ujian dimuat. Tes di storage.test.ts. Batas jumlah attempt tersimpan tidak dibuat (ditunda).
- F-10-07: `saveNow` di exam-runner dirantai per `question_id` (satu PUT aktif; nilai terbaru dibaca saat giliran). Tes baru di exam.test.tsx.
- Ditunda (LOW/INFO): F-10-01 (Backend, parsePassages.ts), F-10-02 (hash isi sorotan), F-10-05 (a11y sorotan di peramban nyata), F-10-06 (aturan lint anti-innerHTML), F-10-08, F-10-09, F-10-10.
- Verifikasi: tsc bersih; eslint src tests --max-warnings=0 bersih; vitest run 44 berkas, 621 tes lulus (test:integration tidak dijalankan).

## [BACKEND] Perbaikan QA W5 (2026-11-03)
- F-10-01 (MEDIUM) selesai: satu sumber kebenaran `src/lib/reading/passage-core.ts` (murni): normalisasi akhir baris di SATU tempat (`\r\n`/`\r` -> `\n`), pemisah baris persis `===PASSAGE===`, pemisah paragraf = baris kosong boleh berisi spasi/tab, label `[A-Z]` + tepat satu spasi, bagian kosong (pemisah awal/akhir/berurutan) tetap dihitung. `server/content/passages.ts` (validator) dan `lib/reading/parsePassages.ts` (klien) kini keduanya membungkus core ini; API ekspor `parsePassages`, `PassageParseError`, `PASSAGE_SEPARATOR`, `MAX_PASSAGES` tidak berubah (tes FE lama lulus). `validate.ts` menghitung `too_many_passages`/`passage_no` dari parser yang sama dan menambah kode galat validasi baru `empty_passage` (bagian kosong ditolak saat impor; sebelumnya diam-diam dibuang server tetapi ditampilkan klien sehingga `passage_no` bergeser). Perilaku server lain berubah sesuai paritas: CRLF dan baris kosong berspasi kini mendeteksi label ganda; `[A]<tab>` bukan label.
- Tes: `tests/unit/passages-parity.test.ts` (17; 14 fixture termasuk fixture QA a-d, CRLF/CR, bagian kosong; server menolak <=> klien melempar, label dan jumlah bagian identik) dan 4 tes baru di `lib/reading/parsePassages.test.ts` (CRLF, baris kosong berspasi, tab, bagian kosong).
- Ditunda (LOW/INFO, bukan lingkup BE atau dicatat): F-10-02/05/06/08/09/10 (FE/Tester). Perubahan berkas FE hanya `src/lib/reading/parsePassages.ts` (+ tesnya) atas izin eksplisit; tidak menyentuh `src/components`.
- Verifikasi (`codes/`): tsc bersih; eslint src tests scripts --max-warnings=0 bersih; vitest run 44 berkas / 621+ tes lulus; test:integration 15 berkas / 320 tes lulus.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 | Backend Fix QA W5: F-10-01 passage-core bersama + tes paritas |
