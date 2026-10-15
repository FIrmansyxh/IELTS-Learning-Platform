# SECURITY REPORT - [TASK-ID / SCOPE]

**Date:** [YYYY-MM-DD HH:MM]
**Agent:** Security Expert Agent
**Scope:** [Deskripsi scope yang diaudit — misal: "Fitur Login & Auth", "Seluruh codebase", "v1.2.0 release"]
**Mode:** [A: Threat Model / B: Vulnerability Scan / C: Security Fix / D: Pre-release Audit]

---

## Executive Summary

[Ringkasan singkat — apa yang diaudit, berapa temuan, dan rekomendasi utama.]

**Overall Risk Level:** `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `CLEAR`

---

## Findings

### CRITICAL
| # | Vulnerability | Location | Description | Recommendation |
|---|---------------|----------|-------------|----------------|
| 1 | | | | |

### HIGH
| # | Vulnerability | Location | Description | Recommendation |
|---|---------------|----------|-------------|----------------|
| 1 | | | | |

### MEDIUM
| # | Vulnerability | Location | Description | Recommendation |
|---|---------------|----------|-------------|----------------|
| 1 | | | | |

### LOW / INFO
| # | Vulnerability | Location | Description | Recommendation |
|---|---------------|----------|-------------|----------------|
| 1 | | | | |

---

## OWASP Top 10 Checklist

- [ ] A01: Broken Access Control
- [ ] A02: Cryptographic Failures
- [ ] A03: Injection (SQL, XSS, Command)
- [ ] A04: Insecure Design
- [ ] A05: Security Misconfiguration
- [ ] A06: Vulnerable & Outdated Components
- [ ] A07: Authentication & Session Failures
- [ ] A08: Software & Data Integrity Failures
- [ ] A09: Security Logging & Monitoring Failures
- [ ] A10: Server-Side Request Forgery (SSRF)

---

## Dependency Scan Results

```
[Output dari npm audit / pip audit / bundle audit]
```

**Vulnerable packages found:** [X critical, Y high, Z moderate]

---

## Secrets Scan Results

- [ ] No hardcoded credentials found
- [ ] No API keys in source code
- [ ] `.env.example` does not contain real values
- [ ] `.gitignore` covers all `.env` variants

---

## Fixes Applied

| # | Vulnerability | Fix Description | Files Changed | Timestamp |
|---|---------------|-----------------|---------------|-----------|
| 1 | | | | |

---

## Sign-off

- **Status:** `Pending Fix` / `All Clear` / `Conditional Approval`
- **Remaining Issues:** [Daftar temuan yang belum di-fix dan alasannya — misal: "MEDIUM-1: accepted risk, ditangani di sprint berikutnya"]
- **Next Action:** [Fix CRITICAL-1 sebelum deploy / Ready for release / dll]
- **Reviewed By:** [Security Agent + Human approval jika sudah di-review]
