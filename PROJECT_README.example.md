# Example Project README (VasVibe)

> This file is shipped as a reference example by `create-vasvibe`. It shows
> what a real project README built on top of this scaffold can look like.
> You can safely delete this file or use it as a starting point for your own
> `README.md`.

---

# 🚢 VasVibe - Platform Reservasi Kapal Wisata Labuan Bajo

Platform reservasi online untuk jasa layanan pariwisata kapal di Labuan Bajo. Sistem lengkap dengan backoffice management dan customer booking platform.

## 📋 Project Structure

```
vas_vibe/
├── .gitignore              # Git ignore rules
├── README.md               # This file
├── project_overview.md     # Project overview & requirements
├── codes/                  # Source code (ignored by git)
│   ├── app/                # Next.js app directory
│   ├── components/         # React components
│   ├── lib/                # Utility functions & configs
│   ├── prisma/             # Database schema & migrations
│   ├── public/             # Static assets
│   └── ...
├── specifications/         # Technical specifications (ignored by git)
│   ├── SPEC-000-*.md       # Environment setup
│   ├── SPEC-001-*.md       # Database schema
│   ├── SPEC-002-*.md       # Authentication system
│   └── SPEC-003-*.md       # Booking management
└── tests/                  # Test files
```

## 🎯 Key Features

### Backoffice System
- Dashboard, booking management, payment recording
- Customer, ship, pricing management
- Reports, audit logs, role-based access control

### Customer Platform
- Online booking, payment gateway, customer dashboard, e-tickets

## 🛠️ Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL 16
- **ORM:** Prisma
- **Authentication:** NextAuth.js v5
- **UI:** Tailwind CSS + Shadcn/UI
- **Icons:** Lucide React
- **Validation:** Zod
- **Date Handling:** date-fns
- **Excel Export:** xlsx
- **Deployment:** Docker Compose

## 🚀 Getting Started

```bash
# 1. Clone
git clone <repository-url>
cd VasVibe

# 2. Setup code workspace
cd codes
npm install
cp .env.example .env

# 3. Start services
docker compose up -d
npx prisma migrate dev
npm run prisma:seed
npm run dev
```

---

This file is illustrative only. See `README.md` for the actual project setup.
