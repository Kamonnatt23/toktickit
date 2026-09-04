# TokTickIT

TokTickIT is a Requester-facing IT ticketing MVP designed for users to report and track issues. 

## Tech Stack
- **Frontend:** React, TypeScript, Vite, Bootstrap
- **Backend:** Node.js, Express, TypeScript, Prisma, PostgreSQL

## Features
- **Development Requester Selector:** Simulates a user session context for testing purposes (NOT a real authentication system).
- **Create Ticket:** Allows requesters to submit new IT issues with required fields (Category, Related System, Summary, Priority, Description).
- **My Tickets:** A dashboard listing the user's tickets with support for search, filtering, sorting, and pagination.
- **Ticket Detail:** A read-only view of submitted ticket information with strict ownership enforcement.
- **Attachment Management:** Supports uploading, downloading, and soft-removing attachments (with required removal reasons), enforcing file type and size limits.

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
```bash
cd client
npx playwright test
```