# SPEC-XXX: [Feature Name]

## Metadata
- **Author:** Analyst Agent
- **Created:** [YYYY-MM-DD]
- **Status:** draft | review | approved
- **Depends on:** SPEC-YYY

## User Story
Sebagai [role konkret], saya ingin [action], sehingga [benefit].

## Non-Goals / Out of Scope
Daftar eksplisit apa yang TIDAK dikerjakan fitur ini (pagar ruang lingkup untuk developer).
- ...

## Technical Flow
1. [Langkah 1 — satu aktor + satu aksi, contoh: User submit form login]
2. [Langkah 2 — contoh: Backend validasi credentials]
3. [Langkah 3 — contoh: Return JWT token]

## Acceptance Criteria
Format Given/When/Then, tiap kriteria binary (lulus/gagal). Wajib mencakup happy path & failure path.
- [ ] **Given** ... **When** ... **Then** ...
- [ ] **Given** ... **When** ... **Then** ...

## API Contract
### [METHOD] /api/v1/endpoint
- **Auth:** [public | Bearer JWT | ...]
- **Success status:** [200 | 201 | ...]

**Request** — setiap field: `nama` (casing sesuai konvensi project) · tipe · required? · constraint
| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| ... | ... | ... | ... |

```json
{ "contoh": "nilai nyata, bukan kosong" }
```
**Response (Success):**
```json
{ "contoh": "nilai nyata" }
```
**Response (Error)** — enumerasi setiap kondisi (HTTP status + kode error):
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | ... |
| 401 | ... | ... |

## Database Changes
Tabel/kolom/index baru — nama, tipe, nullability, default (harus cocok dengan `state/knowledge_base/data-model/`) — atau tulis "None".

## UI/UX
Rujuk komponen dari `state/knowledge_base/design-system/` dengan nama persis; sertakan state kosong/loading/error — atau tulis "None".

## Edge Cases & Validation
Aturan validasi per field (batas, format, required/optional) + pesan/kode error persis.
- [ ] ...

---

## Human Approval

**Human Approval Status:** pending | approved | revision_requested

**Human Feedback:**
> (Kosongkan jika belum ada feedback. Analyst Agent akan mengisi berdasarkan masukan reviewer.)

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| [YYYY-MM-DD] | Analyst Agent | Initial draft |
