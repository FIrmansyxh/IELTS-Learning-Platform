# Project Style Guide & Architecture Constraints

## 1. Naming Conventions
- **Files/Folders:** `kebab-case` (misal: `user-profile.tsx`, `auth-service.ts`)
- **Variables/Functions:** `camelCase` (misal: `getUserProfile()`)
- **Classes/Interfaces:** `PascalCase` (misal: `class UserProfile`, `interface AuthConfig`)
- **Constants/Enums:** `UPPER_SNAKE_CASE` (misal: `MAX_RETRY_COUNT = 3`)

## 2. Directory Structure (`codes/`)
- `src/components/` → UI Components (Dumb/Presentational)
- `src/pages/` atau `app/` → Route-level components
- `src/services/` → API calls, logic database, atau external services
- `src/utils/` → Helper functions murni
- `src/types/` → Type definitions (TypeScript)

## 3. Security Guidelines
- **TIDAK BOLEH** hardcode API Keys, secrets, tokens, atau password ke dalam source code.
- Selalu gunakan `process.env.VARIABLE_NAME` (Node/Next) atau setara, dan catat keys yang dibutuhkan di `.env.example`.
- Selalu validasi input user baik di client maupun di server (defense in depth).

## 4. Code Quality & Formatting
- **Linter:** Wajib lulus ESLint / Prettier.
- **Max File Length:** Usahakan di bawah 300 baris. Jika lebih, pecah menjadi modul kecil.
- **DRY (Don't Repeat Yourself):** Jika ada logika yang digunakan 3 kali atau lebih, ekstraksi menjadi function/util/hook.

## 5. Error Handling
- Hindari `console.log` di production code. Gunakan logger library.
- Jangan gunakan `try-catch` kosong. Selalu handle atau re-throw error.
- Tampilkan error message yang ramah ke user (UI), tapi log error aslinya (Technical).
