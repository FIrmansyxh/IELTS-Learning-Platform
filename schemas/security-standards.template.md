# SECURITY STANDARDS — [Project Name]

**Owner Agent:** Security Expert (Mode Standards)
**Date:** [YYYY-MM-DD HH:MM]
**Phase:** Planning
**Status:** `Draft` / `Approved`

> Acuan standar keamanan proyek yang ditetapkan di awal. Semua engineer WAJIB mengikuti. Diverifikasi ulang oleh Security di fase Hardening. Perubahan lewat `_shared/change-management.md`.

---

## 1. Authentication & Authorization

- **Auth mechanism:** [JWT / session / OAuth2 — pilih dan jelaskan]
- **Password policy:** [hashing algo (bcrypt/argon2), min length, complexity]
- **Token expiry:** [access token TTL, refresh token strategy]
- **Authorization model:** [RBAC / ABAC — daftar role dan permission]

## 2. Data Protection

- **Encryption in transit:** TLS 1.2+ wajib
- **Encryption at rest:** [field/tabel yang dienkripsi]
- **PII handling:** [masking, minimization]
- **Secrets management:** semua via env var, JANGAN hardcode; daftarkan di `.env.example`

## 3. Input Validation & Output Encoding

- Validasi semua input di server-side
- Parameterized queries (anti SQL injection)
- Output encoding (anti XSS)

## 4. Security Headers & Config

- CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- CORS policy: [origin yang diizinkan]
- Rate limiting: [batas per endpoint sensitif]

## 5. Compliance Requirements

- [GDPR / UU PDP / PCI-DSS — jika relevan]

## 6. Threat Model Summary

[Threat utama yang diantisipasi sejak desain — referensi ke STRIDE jika sudah ada threat model.]

## 7. Security Acceptance Criteria

Checklist yang harus lulus sebelum release (diverifikasi Security di Hardening):
- [ ] Tidak ada hardcoded secret
- [ ] Semua endpoint ter-proteksi authz
- [ ] Dependency bebas CVE critical/high
- [ ] OWASP Top 10 ter-review

## Revision History

| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| [YYYY-MM-DD HH:MM] | Security | Initial security standards |
