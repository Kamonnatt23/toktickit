# TokTickIT

TokTickIT is an IT ticketing system designed for issue reporting, tracking, and resolution, supporting Requester, IT Staff, and Administrator roles.

## Tech Stack
- **Frontend:** React, TypeScript, Vite, Bootstrap
- **Backend:** Node.js, Express, TypeScript, Prisma, PostgreSQL

## Features
- **Authentication & RBAC:** Real authentication with session management, role-based access control (RBAC), and mandatory password change on first login.
- **Requester Workflow:** Ticket creation, tracking via My Tickets dashboard, ticket detail view, and marking problems as resolved.
- **IT Staff Operations:** Dedicated staff queue with filtering and sorting, ticket claiming/reassignment, IT Priority management, and status transitions.
- **Communication:** Unified timeline supporting Public Comments (Requester & Staff) and Internal Notes (Staff & Admin only).
- **Administrator User Management:** Centralized user administration including user activation/deactivation, and password reset/initial password management.
- **Attachment Management:** Uploading, downloading, and soft-removing attachments with strict ownership and role enforcement.
- **Responsive UI:** Fully responsive interface optimized for Desktop, Tablet, and Mobile viewports.

## Quick Setup
Ensure you have Node.js and npm installed.

1. **Install dependencies and configure environment variables:**

```bash
# Client
cd client
npm install
cp .env.example .env

# Server
cd ../server
npm install
cp .env.example .env
```

## Database & Prisma
1. Start a local PostgreSQL instance and ensure `DATABASE_URL` in `server/.env` is reachable.
2. Run Prisma migrations and seed the database:

```bash
cd server
npm run prisma:migrate
npm run prisma:seed
```

## Run Locally
Start both the backend API and the frontend dev server in separate terminal windows.

**Start the backend API:**
```bash
cd server
npm run dev
```

**Start the frontend dev server:**
```bash
cd client
npm run dev
```

## Testing

**Backend (API & Unit tests):**
```bash
cd server
npm run test
```

**Frontend (UI tests):**
```bash
cd client
npm run test
```

**Frontend (Playwright E2E tests):**
Includes Lab 3 E2E coverage for authentication, IT Staff workflow, Administrator User Management, and responsive verification.
```bash
cd client
npx playwright test
```
