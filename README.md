# TokTickIT

TokTickIT is an IT ticketing system designed for issue reporting, tracking, and resolution, supporting Requester, IT Staff, and Administrator roles.

## Tech Stack
- **Frontend:** React, TypeScript, Vite, Bootstrap
- **Backend:** Node.js, Express, TypeScript, Prisma, PostgreSQL

## Features
- **Authentication & RBAC:** Real authentication with session management, role-based access control (RBAC), and mandatory password change on first login.
- **Actions Taken & Revision Tracking:** Chronological Actions Taken logging, multi-staff collaboration, append-only revision history tracking with before/after snapshots, and database trigger protection against mutation/deletion/truncation.
- **Ticket Workflow & Resolution Gate:** 13-row status transition state machine, Resolution Gate enforcing >= 1 Action Taken before resolution, comment-driven auto-transitions (`Waiting for Requester` -> `Open`, `Resolved`/`Closed` -> `Reopened`), and Requester advisory resolution.
- **Concurrency Control & Idempotency:** Two-Phase In-Transaction Idempotency Reservation pattern preventing false 409s, and atomic conditional Compare-And-Swap (CAS) updates on Ticket status, comments, advisory resolution, and staff assignment.
- **Role-Based Dashboards:** Dedicated dashboards for Requester (5 metrics, 30-day resolution boundary), IT Staff (6 metrics including Unassigned triage queue), and Administrator (system operations + 5 user statistics) with 4 UI states (Loading, Empty, Forbidden, Failure) and drill-down filtering.
- **Communication:** Unified timeline supporting Public Comments (Requester & Staff) and Internal Notes (Staff & Admin only).
- **Administrator User Management:** Centralized user administration including user activation/deactivation, and password reset/initial password management.
- **Attachment Management:** Uploading, downloading, and soft-removing attachments with strict ownership and role enforcement.
- **Responsive UI & Accessibility:** Fully responsive interface optimized for Desktop, Tablet, and Mobile viewports without horizontal clipping, with WCAG keyboard accessibility, focus trapping, and ARIA labels.

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

Ensure your test database (`toktickit_test`) is running and migrated.

### 1. Lab 4 Test Suites

**Lab 4 Backend (Actions Taken, Workflow, Dashboards, CAS, Idempotency):**
```bash
cd server
$env:DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public"
npx vitest run tests/lab-04
```

**Lab 4 Frontend (Components, Modals, Dashboards, Workflow, Style, Accessibility):**
```bash
cd client
npm test -- tests/lab-04
```

**Lab 4 End-to-End Browser Automation (Playwright multi-role & responsive):**
```bash
cd client
npx playwright test
```

### 2. Full Regression Suites (Labs 1–3)

**Backend Regression (Labs 1, 2, 3):**
```bash
cd server
npx vitest run tests/lab-03
npx vitest run tests/lab-02
npx vitest run tests/lab-01
```

**Frontend Regression (Labs 2, 3):**
```bash
cd client
npm test -- tests/lab-03
npm test -- tests/lab-02
```

### 3. Production Builds

```bash
# Server build
cd server
npm run build

# Client build
cd client
npm run build
```
