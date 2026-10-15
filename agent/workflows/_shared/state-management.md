# State Management (Shared)

Setiap agent WAJIB membaca dan menulis state sesuai panduan ini untuk menjaga kontinuitas antar-session.

---

## context.json

**Path:** `state/context.json`

Baca file ini di **awal setiap session**. Update di **akhir session** jika ada perubahan status.

### Schema

```json
{
  "project_name": "string — nama project dari project_overview.md",
  "last_updated": "YYYY-MM-DD HH:MM — timestamp update terakhir",
  "last_agent": "string — nama agent yang terakhir aktif (fullstack/tester/fixer/dll)",
  "current_sprint": "string atau null — nama sprint aktif jika ada",
  "active_tasks": ["TASK-XXX", "TASK-YYY"],
  "blocked_tasks": ["TASK-ZZZ"],
  "notes": "string — catatan penting untuk agent berikutnya, atau kosong"
}
```

### Contoh

```json
{
  "project_name": "booking-kapal-wisata",
  "last_updated": "2025-06-18 14:30",
  "last_agent": "fullstack",
  "current_sprint": "Sprint 1 - Auth & Environment",
  "active_tasks": ["TASK-001"],
  "blocked_tasks": [],
  "notes": "TASK-001 selesai development, menunggu QA review sebelum testing"
}
```

---

## agent_handoff.json

**Path:** `state/agent_handoff.json`

Tulis file ini ketika kamu **menyerahkan pekerjaan ke agent lain** (bukan sekedar update status). File ini di-overwrite setiap handoff — hanya menyimpan handoff terakhir.

### Schema

```json
{
  "from_agent": "string — agent yang mengirim handoff",
  "to_agent": "string — agent penerima",
  "task_id": "TASK-XXX",
  "timestamp": "YYYY-MM-DD HH:MM",
  "status": "string — status task saat handoff (ready_to_test / fixing / dll)",
  "notes": "string — instruksi spesifik untuk agent penerima",
  "artifacts": ["path/ke/file yang relevan"]
}
```

### Contoh

```json
{
  "from_agent": "fullstack",
  "to_agent": "qa",
  "task_id": "TASK-001",
  "timestamp": "2025-06-18 14:30",
  "status": "ready_to_test",
  "notes": "Implementasi login dengan JWT. Pastikan cek validasi input di POST /api/auth/login",
  "artifacts": [
    "codes/src/app/api/auth/login/route.ts",
    "codes/src/lib/auth.ts",
    "task/TASK-001_login/dev_log.md"
  ]
}
```

---

## Aturan Umum

- **JANGAN** menulis context.json dengan format berbeda dari schema di atas.
- Jika `context.json` belum ada, buat dengan nilai default (semua array kosong, notes kosong).
- Jika `agent_handoff.json` sudah ada dari handoff sebelumnya, **overwrite** — tidak perlu append.
