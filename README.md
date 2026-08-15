# TokTickIT

This repository is wired for Lab 1 using React + TypeScript + Vite + Bootstrap
for the frontend and Node.js + Express + TypeScript + Prisma + PostgreSQL for
the backend. The project layout follows the lab requirements.

Quick setup
 - Install root tools (npm/node) if missing.
 - From the project root, install dependencies for both sides and configure env files:

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

Database & Prisma
 - Start a local PostgreSQL instance and ensure `DATABASE_URL` in `server/.env` is reachable.
 - Run Prisma migrations and seed the database:

```bash
cd server
npx prisma migrate dev --name init
npm run prisma:seed
```

Run locally
 - Start the backend API:

```bash
cd server
npm run dev
```

 - Start the frontend dev server (in another terminal):

```bash
cd client
npm run dev
```

Notes
 - Environment templates are in `client/.env.example` and `server/.env.example`.
 - Lab 1 tests and TODOs remain in the code for the lab exercises; this README only covers setup.