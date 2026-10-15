# PROJECT OVERVIEW: [Project Name]

## 1. Project Summary
*(Jelaskan secara garis besar software apa yang akan dibangun & masalah apa yang diselesaikan)*

## 2. Target Audience
*(Siapa yang akan menggunakan software ini: Admin, End User, Customer, dll)*

## 3. Key Features
- (Fitur A)
- (Fitur B)
- (Fitur C)

## 4. Tech Stack & Infrastructure
- **Language/Runtime:** (e.g., Node.js v20, Python 3.11, Go)
- **Framework:** (e.g., Next.js 14, Express, FastAPI, Django)
- **Database:** (e.g., PostgreSQL, MongoDB)
- **State Management:** (e.g., Redux, Zustand, Context API - *Jika perlu*)
- **Infrastructure:** Docker & Docker Compose (Default)

## 5. UI/UX Guidelines & Design System
*(Analyst Agent harus memastikan bagian ini terisi sebelum membuat spec fitur)*

- **CSS Framework / Library:** (e.g., Tailwind CSS, Bootstrap, Material UI, Chakra UI, AntDesign)
- **Component Library:** (e.g., Shadcn/UI, HeadlessUI, Radix - *Sangat disarankan jika menggunakan Tailwind*)
- **Visual Vibe:** (e.g., Modern Minimalist, Corporate Professional, Playful & Colorful, Cyberpunk)
- **Color Palette:**
  - **Primary:** (Warna utama tombol/aksi - Hex Code atau deskripsi)
  - **Secondary:** (Warna pendukung)
  - **Background:** (Light Mode / Dark Mode / System default)
- **Typography:**
  - **Font Family:** (e.g., Inter, Roboto, Open Sans)
  - **Scale:** (e.g., Default Tailwind scale)
- **Iconography:** (e.g., Lucide React, Heroicons, FontAwesome)
- **Styling Details:**
  - **Radius:** (e.g., Rounded-md, Fully Rounded, Sharp/Square)
  - **Shadows:** (e.g., Soft shadows, Flat design no shadow)
- **Responsive Strategy:** (e.g., Mobile-First approach)

## 6. Constraints & Compliance
*(Opsional: GDPR, Offline First, High Performance requirement, dll)*

## 7. Project Settings

- **WORK_DEPTH:** deep  <!-- fast | standard | deep -->

> **Penjelasan Work Depth:**
> - `fast` — Prototype/MVP: agent mengerjakan inti fitur saja, skip output optional (unit test, full docs, edge cases). Cocok untuk eksplorasi cepat.
> - `standard` — Development normal: semua step agent dijalankan sesuai template. **Default yang disarankan.**
> - `deep` — Produksi kritikal: semua validasi, security review, dan edge cases wajib. Cocok untuk fitur pembayaran, autentikasi, atau sistem high-stakes.
>
> **Di mana bisa diubah:**
> 1. **File ini** (`project_overview.md`) — ubah nilai `WORK_DEPTH:` untuk mengubah default seluruh project.
> 2. **Orchestrator command** — tambah parameter `depth=` saat memanggil pipeline, contoh: `/start-feature "Login" depth=fast`. Override untuk satu pipeline saja.
> 3. **Langsung ke agent** — instruksikan agent secara eksplisit, contoh: `"gunakan mode: deep"`. Override tertinggi.