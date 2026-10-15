# Explorer Agent — Workflow Detail

**Role:** Senior Software Architect & Code Analyst  
**Trigger:** `/explore-codebase` atau dipanggil Orchestrator sebelum `/build-feature` pada project existing.  
**Input:** Codebase yang sudah ada di folder `codes/`  
**Output:** `project_overview.md`, `state/knowledge_base/codebase/inventory.md`, `state/context.json`

---

## Kapan Menggunakan Explorer?

Gunakan Explorer (bukan Discovery + Initiator) ketika:
- Kamu **bergabung ke project yang sudah berjalan** dan perlu memahami kondisinya sebelum mengerjakan fitur baru.
- Ada **handover codebase** dari tim lain dan tidak ada dokumentasi overview.
- Kamu ingin **memverifikasi** apakah `project_overview.md` yang ada masih akurat dengan kode terkini.
- Sebelum menjalankan `/build-feature` atau `/start-fix` pada project existing yang belum punya state.

---

## Alur Kerja

```
codes/ exists?
     │
     ├─ YES → Explorer baca kode → tulis project_overview.md + inventory + context.json
     │              │
     │              └─ Human review → lanjut ke /build-feature atau /start-fix
     │
     └─ NO  → Arahkan ke /plan-project (project baru, mulai dari Discovery)
```

---

## Dokumen yang Dihasilkan

| Dokumen | Path | Deskripsi |
|---------|------|-----------|
| Project Overview | `project_overview.md` | Tech stack, fitur, design system — disintesis dari kode |
| Codebase Inventory | `state/knowledge_base/codebase/inventory.md` | Daftar API endpoints, data models, file penting |
| Context State | `state/context.json` | Status project saat ini untuk kontinuitas antar-session |

---

## Panduan Membaca Kode per Stack

### Node.js / TypeScript (Next.js, Express, NestJS)
- Root: `package.json`, `tsconfig.json`, `.env.example`
- Routes: `src/routes/`, `src/app/api/`, `pages/api/`, `src/controllers/`
- Models: `prisma/schema.prisma`, `src/models/`, `src/entities/`
- Config: `src/config/`, `next.config.js`, `nest-cli.json`

### Python (FastAPI, Django, Flask)
- Root: `pyproject.toml`, `requirements.txt`, `setup.py`
- Routes: `app/routers/`, `app/views.py`, `urls.py`
- Models: `app/models.py`, `alembic/versions/`
- Config: `app/config.py`, `settings.py`

### Go
- Root: `go.mod`, `go.sum`
- Routes: `internal/handler/`, `internal/api/`, `cmd/`
- Models: `internal/domain/`, `internal/model/`
- DB: `internal/repository/`, migration files

### Mobile (Flutter, React Native)
- Root: `pubspec.yaml` atau `package.json`
- Screens: `lib/screens/`, `src/screens/`
- State: `lib/providers/`, `lib/bloc/`, `src/store/`
- API: `lib/services/`, `src/api/`

---

## Output Quality Rules

1. **Jangan berasumsi** — setiap klaim HARUS dari file yang dibaca. Tandai dengan `[confirmed]`, `[inferred]`, atau `[unknown]`.
2. **Inventarisasi endpoints lengkap** — jangan skip; ini akan dipakai Analyst untuk API Contract.
3. **Tandai incomplete features** — gunakan `[~]` untuk partial, `[ ]` untuk planned/TODO.
4. **Catat technical debt** — tulis di `notes` field `context.json` agar agent berikutnya tahu.
5. **Jangan timpa state yang masih valid** — jika `state/context.json` sudah ada dan masih relevan, merge informasi baru ke dalamnya.
