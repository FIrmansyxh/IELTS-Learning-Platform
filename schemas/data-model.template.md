# DATA MODEL — [Project Name]

**Owner Agent:** Data Architect
**Date:** [YYYY-MM-DD HH:MM]
**Phase:** Planning
**Status:** `Draft` / `Approved`

> Acuan resmi struktur data proyek. Backend Engineer WAJIB mengikuti ini. Perubahan harus lewat `_shared/change-management.md`.

---

## 1. Entity Overview

[Daftar entity utama dan deskripsi singkat perannya.]

## 2. Entity Relationship Diagram (ERD)

```
[Diagram teks / mermaid. Contoh:
User ||--o{ Booking : places
Booking }o--|| Tour : references
]
```

## 3. Schema Detail

### [Entity: User]
| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| email | string | unique, not null | |
| password_hash | string | not null | bcrypt, JANGAN simpan plaintext |
| created_at | timestamp | default now | |

*(Ulangi per entity)*

## 4. Indexes & Performance

- [Index yang dibutuhkan untuk query berat — misal: `idx_booking_user_id`]

## 5. Data Governance

- **PII fields:** [daftar field sensitif — email, phone, dll]
- **Retention:** [berapa lama data disimpan]
- **Encryption at rest:** [field mana yang dienkripsi]
- **Audit:** [tabel mana yang butuh audit log]

## 6. Migration Strategy

- [Tooling migrasi — Prisma Migrate, TypeORM, Alembic, dll]
- [Strategi seed data]

## Revision History

| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| [YYYY-MM-DD HH:MM] | Data Architect | Initial data model |
