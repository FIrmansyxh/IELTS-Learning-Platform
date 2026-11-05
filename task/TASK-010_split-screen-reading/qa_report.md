# QA & Security Report: TASK-010 Split-Screen Reading dengan Highlighter
**Date:** 2026-11-04
**Target Branch:** main (working tree)
**Reviewer:** QA Agent (Review statis & keamanan)
**Verifikasi yang dijalankan:**
- `npm run typecheck` (`tsc --noEmit`): 0 galat (LULUS)
- `npm run lint` (`eslint . --max-warnings=0`): 0 peringatan (LULUS)
- `npm test` (`vitest run`): 37 berkas / 535 tes lulus (LULUS)

**Status keseluruhan:** LULUS PENUH (0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW).

---

## 1. Code Quality & Standards
- [x] Pass
- Struktur modular dan terpisah rapi:
  - `src/lib/reading/parsePassages.ts`: fungsi parser deterministik tanpa efek samping.
  - `src/components/reading/highlight-utils.tsx`: helper murni untuk perhitungan segmen string dan storage terisolasi.
  - `src/components/reading/highlight-toolbar.tsx` & `passage-view.tsx` & `reading-workspace.tsx`: pemisahan tanggung jawab komponen jelas.
- Seluruh teks antarmuka menggunakan kamus string `src/i18n/id.ts` (`id.reading.*`).
- Tidak ada `any` atau cast tipe yang tidak aman.

---

## 2. Security Assessment
- [x] Pass
- **Pertahanan XSS:**
  - Fungsi `renderHighlightedText` merender teks dan tag `<mark>` murni menggunakan elemen JSX React dan string slicing standar.
  - Tidak ada penggunaan `innerHTML`, `outerHTML`, atau `dangerouslySetInnerHTML`.
- **Ketahanan Penyimpanan Lokal (Local Storage):**
  - Semua akses `localStorage` (`loadSplitRatio`, `saveSplitRatio`, `loadHighlights`, `saveHighlights`, `loadFlags`, `saveFlags`) dibungkus dalam blok `try/catch`. Jika localStorage dinonaktifkan oleh peramban atau kuota penuh, aplikasi tetap berjalan normal di memori tanpa melempar unhandled exception.
- **Proteksi Batas Input & Memori:**
  - Batas jumlah sorotan dibatasi hingga maksimal 200 elemen (`MAX_HIGHLIGHTS`). Penambahan ke-201 ditolak secara aman dengan pemberitahuan toast.
  - Parser teks bacaan membatasi maksimal 3 passage (`===PASSAGE===`); masukan berlebih memicu galat `too_many_passages` terkendali.

### Temuan Minor (Low/Info):
| ID | Tingkat | Lokasi | Keterangan |
|---|---|---|---|
| F-10-01 | LOW | `src/components/reading/passage-view.tsx` | Penentuan offset karakter seleksi menggunakan `document.createRange()`. Pada teks yang mengandung emoji multi-byte atau surrogate pairs (jarang pada IELTS Reading), offset karakter UTF-16 mungkin terpotong. Disarankan menjaga teks bacaan dalam karakter standar UTF-8. |
| F-10-02 | INFO | `src/components/reading/reading-workspace.tsx` | Sinkronisasi sisa waktu attempt memanggil `attemptsApi.get` tiap 60 detik. Panggilan ini ringan dan diabaikan bila gagal. |

---

## 3. Architecture Alignment
- [x] Pass
- Sesuai dengan spesifikasi `010_spec_split_screen_reading.md`:
  - Panel split kiri/kanan dapat digeser dengan pembagi `role="separator"` vertikal yang memenuhi standar ARIA slider (min 35, max 65, default 50).
  - Navigasi keyboard tombol panah kiri/kanan mengubah rasio per 5%.
  - Mode mobile (< 1024px) menyediakan tab "Teks \| Soal" yang mempertahankan posisi scroll masing-masing.
  - Highlighter kuning/hijau sesuai dengan token warna yang disepakati di `design-system.md` dan `globals.css`.
  - Integrasi dengan `ExamRunner`: otomatis aktif saat `passage_markdown` tersedia pada data attempt.

---

## 4. Recommendations
1. Pertahankan batas 200 sorotan untuk menjaga performa DOM rendering.
2. Siapkan fixture konten teks bacaan IELTS Reading Academic untuk pengujian E2E Playwright.

**Keputusan:** LULUS CODE REVIEW (Siap lanjut ke GATE Review).
