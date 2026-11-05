# Dev Log TASK-010: Split-Screen Reading dengan Highlighter

## [FULLSTACK / FRONTEND & BACKEND] 2026-11-04 (Wave W5)

Spec: `specifications/010_spec_split_screen_reading.md` dan `_api-contract.md`.

### Yang dibangun
1. **Parser Teks Bacaan (`src/lib/reading/parsePassages.ts`)**:
   - Fungsi murni `parsePassages(markdown: string): Passage[]` memisahkan hingga 3 teks bacaan lewat baris exact `===PASSAGE===`.
   - Mengekstrak judul dari baris `# Judul`, default `Teks {n}` bila tanpa judul.
   - Memisahkan paragraf berdasarkan baris kosong, mendeteksi dan mengekstrak label paragraf `[X] ` (A-Z) ke properti `label`, serta membersihkan token label dari isi teks.
   - Validasi: melempar `too_many_passages` bila > 3 teks bacaan; melempar `duplicate_paragraph_label` bila ada label duplikat dalam teks bacaan yang sama.
   - Teruji unit komprehensif di `tests/unit/reading.test.ts` (6 pengujian lulus).

2. **Design Tokens (`src/app/globals.css` & `state/knowledge_base/design-system/design-system.md`)**:
   - Menambahkan token `--color-highlight-yellow` (light `#FDE68A`, dark `#854D0E`) dan `--color-highlight-green` (light `#BBF7D0`, dark `#166534`).
   - Teks di atas sorotan tetap memakai `--color-text` untuk menjaga rasio kontras WCAG AA >= 4.5:1.

3. **Komponen Reading Workspace (`src/components/reading/`)**:
   - `highlight-utils.tsx`: Tipe `Highlight`, penyimpanan aman di `localStorage` (`split:v1`, `hl:v1:{attempt_id}`, `flag:v1:{attempt_id}` dengan fallback in-memory bila storage diblokir), serta fungsi render teks bersorot `renderHighlightedText` yang merender tag `<mark>` murni berbasis offset karakter tanpa `innerHTML` atau `dangerouslySetInnerHTML`.
   - `highlight-toolbar.tsx`: Toolbar mengambang dengan tombol "Sorot kuning", "Sorot hijau", "Hapus sorotan", serta Dialog konfirmasi "Hapus semua sorotan".
   - `passage-view.tsx`: Menampilkan teks bacaan dengan margin label paragraf 32px (`aria-label="Paragraf A"`), deteksi seleksi teks dalam satu paragraf, penolakan seleksi lintas paragraf dengan toast ramah pengguna, dan pintasan keyboard (`H`, `Shift+H`, `Delete`/`Backspace`).
   - `reading-workspace.tsx`:
     - Desktop (>= 1024px): Tata letak dua panel independen scroll dengan pembagi vertikal `role="separator"` (35% s.d. 65%, default 50%), interaktif via drag mouse dan navigasi keyboard (`ArrowLeft`/`ArrowRight` per 5%).
     - Mobile (< 1024px): Tab sticky "Teks | Soal" dengan penyimpanan posisi scroll masing-masing tab saat berpindah.
     - Header Soal: Pengelompokan soal per teks bacaan ("Teks {n}: Soal {a}-{b}").
     - Penanda bendera soal, autosave jawaban debounce 400ms, serta sinkronisasi periodik sisa waktu tiap 60 detik.
     - Kartu fallback saat parsing passage gagal dengan tombol salin kode galat ("Laporkan").

4. **Integrasi ExamRunner (`src/components/exam/exam-runner.tsx`)**:
   - Jika attempt memiliki `passage_markdown`, `ExamRunner` otomatis merender `ReadingWorkspace`.

### Verifikasi
- `tsc --noEmit` bersih (0 galat).
- `eslint . --max-warnings=0` bersih (0 peringatan).
- `vitest run` 37 berkas / 535 tes lulus, termasuk 9 tes spesifik `reading-workspace.test.tsx` dan 6 tes `reading.test.ts`.
