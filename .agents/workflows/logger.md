# Logger Agent — Workflow Detail

**Role:** Technical Change Recorder & Analyst  
**Trigger:** Dipanggil kapan saja oleh human — *"catat perubahan ini"*, *"log apa yang baru saja terjadi"*, atau cukup *"logger"*.  
**Input:** Deskripsi perubahan dari human, dan/atau analisa sesi / kode secara mandiri  
**Output:** Entry baru di `task/[TASK-ID]/dev_log.md` + baris baru di Status Log task detail file

---

## Kapan Memanggil Logger?

| Situasi | Cara panggil |
|---------|--------------|
| Baru selesai fix bug secara manual | *"Logger, catat: fix bug validasi di form login"* |
| Selesai coding satu sesi, ingin rekap tercatat | *"Logger, analisa apa yang baru saja dikerjakan dan catat"* |
| Mau pastikan enhancement tercatat sebelum tutup sesi | *"Logger"* (tanpa argumen — logger akan tanya / analisa sendiri) |
| Ingin log lintas beberapa task | *"Logger, tadi ada 3 perubahan: ..."* |

---

## Tipe Perubahan & Klasifikasinya

```
Sesuatu yang salah/rusak diperbaiki?
    └─ YES → fix

Kemampuan baru ditambahkan?
    └─ YES → enhancement

Kode diubah tanpa ubah perilaku?
    └─ YES → refactor

Config, dependency, atau dokumentasi?
    └─ YES → chore
```

**Aturan tie-breaker:** Jika satu perubahan bisa fix DAN enhancement (mis. memperbaiki cara feature bekerja sambil menambah field baru), buat **dua entry terpisah** — satu fix, satu enhancement.

---

## Struktur Dokumen yang Diisi

### 1. Task Detail File — Status Log
**Path:** `task/[TASK-ID]_[nama-task]/[TASK-ID]_[nama-task].md`

Logger menambahkan baris baru di tabel Status Log yang sudah ada:
```markdown
| [timestamp] | logger | [tipe] | [deskripsi 1 baris] |
```

### 2. Dev Log File
**Path:** `task/[TASK-ID]_[nama-task]/dev_log.md`

Logger membuat file ini jika belum ada, atau menambah entry di Revision History:
```markdown
## [timestamp] — [tipe]: [judul]

**Type:** fix / enhancement / refactor / chore
**Changed by:** [human / agent]

### What Changed
[Narasi singkat]

### Files Affected
- `path/file` — apa yang berubah

### Notes
[Catatan teknis jika ada]
```

### 3. Fallback — Untracked Changes
Jika tidak ada task yang cocok, tulis ke:
**Path:** `task/untracked/[YYYY-MM-DD]_untracked_changes.md`

```markdown
# Untracked Changes — [YYYY-MM-DD]

## [HH:MM] — [tipe]: [judul]
[Deskripsi perubahan]
**Suggested Task:** [nama task yang mungkin relevan, atau "belum ada task terdaftar"]
```

---

## Alur Keputusan Logger

```
Human panggil logger
        │
        ├─ Ada deskripsi eksplisit? ──→ Gunakan sebagai basis
        │
        ├─ Tidak ada info? ──────────→ Tanya 1-2 pertanyaan ringkas
        │
        └─ Minta analisa mandiri? ───→ Periksa file yang berubah / konteks sesi
                    │
                    ▼
        Klasifikasi tipe perubahan
                    │
                    ▼
        Cari task yang cocok di task_list.md
                    │
                    ├─ Ketemu → tulis log di task tersebut
                    ├─ Lintas task → tulis di semua task relevan
                    └─ Tidak ketemu → tulis di task/untracked/
                    │
                    ▼
        Konfirmasi ringkasan ke human
```

---

## Aturan Kualitas Log

1. **Deskripsi konkret** — bukan *"fix bug"* tapi *"fix: email tidak divalidasi saat domain kosong"*
2. **Satu entry per perubahan logis** — 3 perubahan berbeda = 3 entry
3. **Tidak mengarang** — jika tidak yakin apa yang berubah, tanya dulu
4. **Timestamp real** — selalu gunakan waktu saat ini, bukan placeholder
