# ADR-001: Topologi Lokal Docker Compose Satu Mesin

**Status:** `Accepted` (didelegasikan, lihat ADR-003)
**Date:** 2026-11-03
**Author Agent:** SysArch
**Phase:** Planning

---

## Context

Requirements menetapkan full lokal, biaya nol, <50 user, satu mesin, satu job AI aktif, tanpa target uptime. Keputusan pg-boss, Drizzle, dan Auth.js sudah disetujui human. Perlu topologi servis, penyimpanan aset, dan pendekatan akses jaringan.

## Decision

1. Satu stack Docker Compose: `db` (Postgres 16), `web` (Next.js standalone), `worker` (Node + pg-boss, concurrency AI = 1), `ollama` dan `stt` (profil `ai`), `minio` (profil `minio`, opsional), `proxy` Caddy (profil `proxy`), `backup`.
2. Tanpa Redis: antrean memakai pg-boss di Postgres.
3. Aset di filesystem (volume) lewat abstraksi `StorageDriver` (`fs` default, `s3`/MinIO opsional); rekaman Speaking privat, hanya lewat route terotorisasi.
4. Hanya proxy (atau `web` saat dev) yang mempublikasikan port; DB, Ollama, STT, MinIO tidak diekspos.
5. Akses non-localhost wajib HTTPS (mikrofon butuh secure context). Opsi: localhost -> Tailscale atau Cloudflare Tunnel; pilihan final menunggu OQ-2.
6. Staging = stack Compose kedua di mesin yang sama (project name berbeda), bukan server terpisah.

## Alternatives Considered

| Opsi | Pro | Kontra | Dipilih? |
|------|-----|--------|----------|
| Compose satu mesin, pg-boss, filesystem | Sederhana, nol biaya, sedikit komponen | Tanpa HA, bergantung mesin | ✅ |
| Tambah Redis + BullMQ | Ekosistem job kaya | Komponen tambahan, tidak perlu pada skala ini, bertentangan dengan keputusan pg-boss | ❌ |
| MinIO sebagai default | Siap migrasi S3 | Servis dan kredensial tambahan, tidak ada kebutuhan multi-node | ❌ (opsional) |
| Ollama/STT selalu di host, bukan container | GPU non-NVIDIA dan Windows lebih mudah | Tidak reproduktif | ❌ sebagai default; didukung via env |
| Cloud VM | Selalu hidup | Melanggar biaya nol dan keputusan lokal | ❌ |

## Consequences

- **Positif:** biaya nol, setup satu perintah, portabel ke VPS kelak dengan mengganti env/proxy.
- **Negatif / Trade-off:** satu titik kegagalan; kinerja AI dibatasi hardware; mesin harus menyala; akses jarak jauh butuh HTTPS tambahan.
- **Dokumen acuan yang ikut berubah:** `architecture/infrastructure.md` (dibuat); `project_overview.md` bagian 4 dan 6 dapat merujuk dokumen ini setelah disetujui.
- **Agen yang perlu tahu:** DevOps (Dockerfile/compose), Backend (StorageDriver, antrean), Analyst (spec 000), Security.

## Revision History

| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-03 | SysArch | ADR dibuat |
