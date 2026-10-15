# Work Depth (Shared)

Setiap agent WAJIB membaca pengaturan `WORK_DEPTH` dari `project_overview.md` untuk menentukan tingkat kedalaman analisa dan output.

---

## Definisi Level

### fast
- **Tujuan:** Prototype, MVP, eksplorasi awal — kerjakan yang blocker, skip yang optional.
- **Prinsip:** Pilih jalur tercepat ke working feature. Output minimal tapi fungsional.
- **Gunakan saat:** Hackathon, proof-of-concept, deadline sangat ketat.

### standard *(default)*
- **Tujuan:** Development sehari-hari — balance antara kecepatan dan kualitas.
- **Prinsip:** Ikuti semua INSTRUCTION STEPS di prompt agent kecuali yang bertanda `[deep only]`.
- **Gunakan saat:** Fitur production normal.

### deep
- **Tujuan:** Kode kritis, fitur security-sensitive, atau sistem production high-stakes.
- **Prinsip:** Tidak ada shortcut. Semua validasi, semua edge case, semua security check.
- **Gunakan saat:** Fitur pembayaran, autentikasi, data sensitif, sebelum major release.

---

## Cara Membaca Setting

Cek `project_overview.md` bagian `## 7. Project Settings`:

```
WORK_DEPTH: standard  # fast | standard | deep
```

Jika tidak ada, gunakan **standard** sebagai default.

---

## Override (Precedence: bawah > atas)

| Level | Cara Set | Contoh |
|-------|----------|--------|
| Project default | `project_overview.md` → `WORK_DEPTH:` | `WORK_DEPTH: standard` |
| Per pipeline | Parameter di Orchestrator command | `/start-feature "Login" depth=fast` |
| Per invokasi | Instruksi langsung ke agent | `"gunakan mode: deep"` |

Override yang lebih spesifik selalu mengalahkan setting yang lebih umum.
