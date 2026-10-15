# Change Management — "No Silent Changes" (Shared)

Aturan komunikasi rigid yang WAJIB diikuti **setiap agen**. Tujuannya: tidak ada perubahan yang hilang jejak. Setiap perubahan yang diminta user — sekecil apapun — harus terdokumentasi di acuan yang benar dan agen hilir harus tahu.

---

## Prinsip Inti

> **Jika kamu menerima perubahan, kamu tidak boleh hanya mengerjakannya — kamu wajib menuliskannya.**

Kode yang berubah tanpa acuannya ikut berubah = **utang yang dilarang**.

---

## Protokol Wajib (4 Langkah)

Saat user (atau agen lain) meminta perubahan, SEBELUM menganggap selesai:

1. **IDENTIFY** — Tentukan dokumen acuan mana yang terdampak:
   - Perubahan kebutuhan/scope → `specifications/[file].md`
   - Perubahan data model → `state/knowledge_base/data-model/`
   - Perubahan arsitektur → `state/knowledge_base/architecture/`
   - Perubahan UI/desain → `state/knowledge_base/design-system/`
   - Perubahan security → `state/knowledge_base/security/`
   - Perubahan **API Contract** → spec terkait **DAN** notify Backend + Frontend Engineer

2. **UPDATE** — Edit dokumen acuan tersebut + tambahkan baris di **Revision History**-nya:
   ```
   | [YYYY-MM-DD HH:MM] | [agen] | [ringkasan perubahan] | requested by user |
   ```

3. **RECORD ADR** — Jika perubahan berdampak pada keputusan desain/arsitektur, buat **Architecture Decision Record**:
   - Path: `state/knowledge_base/decisions/ADR-[NNN]-[judul-singkat].md`
   - Gunakan template `schemas/adr.template.md`

4. **NOTIFY** — Tulis `state/agent_handoff.json` agar agen hilir tahu ada perubahan acuan:
   ```json
   {
     "from_agent": "[agen]",
     "to_agent": "[agen terdampak / 'all']",
     "task_id": "[TASK-ID]",
     "timestamp": "[YYYY-MM-DD HH:MM]",
     "status": "spec_changed",
     "notes": "API Contract POST /bookings berubah: tambah field 'voucher_code'",
     "artifacts": ["specifications/004_booking.md", "state/knowledge_base/decisions/ADR-007-voucher.md"]
   }
   ```

---

## Kapan Wajib ADR?

Buat ADR untuk keputusan yang **sulit/mahal diubah** nanti:
- Ganti library/framework inti
- Perubahan skema database
- Perubahan kontrak API yang breaking
- Perubahan strategi auth/security
- Trade-off arsitektur signifikan

Perubahan kecil (copy text, warna minor) cukup Revision History di doc terkait — tidak perlu ADR.

---

## Anti-Pattern (DILARANG)

- ❌ "User minta ubah validasi, langsung ubah kode saja." → Spec tidak ter-update, Tester tes hal yang salah.
- ❌ "Aku ubah response API, nanti Frontend nyusul." → FE tidak di-notify, integrasi pecah.
- ❌ "Perubahan kecil, tidak perlu dicatat." → Akumulasi drift, knowledge base jadi bohong.

> 📎 Lihat fase & kepemilikan dokumen di `agent/workflows/_shared/phases.md`.
