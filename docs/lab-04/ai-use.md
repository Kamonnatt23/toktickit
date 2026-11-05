# Lab 4 — AI Use and Reflection Report

**Author:** กมนนัทธ์ สีทาไข — 67070501001 — GitHub: [@Kamonnatt23](https://github.com/Kamonnatt23)\
**LLM / AI Tools Used:** Google Antigravity (powered by Gemini 2.5 Pro Advanced Agentic Coding Engine)\
**Deliverable Context:** Sprint 4 Engineering Contract and Test Plan (Issue #54, branch `feature/1-engineering-contract-and-test-plan`)\

---

## 1. Selected Key Prompts (Specification & Planning Phase)

Below are 8 key prompts utilized during the specification, architecture design, and test planning phase of Sprint 4:

### Prompt 1: Initial Engineering Contract Alignment
> *"Review and refine all four Lab 4 engineering contract documents (`specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`) together against `SE+Lab+4.pdf` and the Lab 3 baseline. Resolve outgoing transitions from Reopened, specify Resolution Gate enforcement, and define authoritative dashboard queries for Requester, Staff, and Admin."*

### Prompt 2: Ticket Status Transition Completeness & Resolution Gate
> *"In TokTickIT workflow, define all permitted outgoing transitions from `Reopened` to prevent ticket lifecycle dead-ends. Ensure `Reopened -> In Progress` requires an assigned owner, and define Resolution Gate requirements: at least one Action Taken record and a non-empty resolution comment. Formulate the complete 13-row transition matrix."*

### Prompt 3: Dedicated `resolvedAt` Timestamp & 30-Day Boundary
> *"Ticket `updatedAt` refreshes whenever comments or actions are logged. Design a dedicated `resolvedAt` timestamp on `Ticket` to isolate resolution age from subsequent work updates. Specify backfill behavior for legacy Lab 1–3 tickets as NULL, and define dashboard queries requiring `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - INTERVAL '30 days'`."*

### Prompt 4: Atomic Compare-And-Swap (CAS) Concurrency Control
> *"Application-level read-then-write transactions under PostgreSQL READ COMMITTED isolation do not prevent race conditions. Formulate atomic database-level conditional mutations: `UPDATE Ticket SET ... WHERE id = :id AND updatedAt = :lastUpdatedAt` and `UPDATE ActionTaken SET ... WHERE id = :id AND updatedAt = :actionLastUpdatedAt`. Verify affected row counts to distinguish 404 from 409 Conflict."*

### Prompt 5: Two-Phase In-Transaction Idempotency Reservation Pattern
> *"Identify the concurrency race condition when `Idempotency-Key` and Ticket CAS interact on `POST /comments` and `POST /appears-resolved`. If two requests with the same key and `lastUpdatedAt` arrive simultaneously, Request 1's Ticket CAS updates `updatedAt`, causing Request 2's CAS to fail with a false 409 before reaching `IdempotencyKey.create`. Redesign the transaction using a Two-Phase Reservation Pattern: insert a reservation row FIRST in the transaction to acquire a PostgreSQL unique index tuple lock, blocking concurrent requests before CAS is evaluated."*

### Prompt 6: Strict PostgreSQL P2002 Unique Constraint Interception
> *"Review error handling in `api-spec.md`. Ensure P2002 unique constraint interception targets strictly the `IdempotencyKey` compound unique constraint `[route, ticketId, userId, key]` and does not use overly broad substring matching like `includes('key')` that could catch unrelated table collisions. Require verification of non-null `statusCode` and `responseBody` before replaying responses."*

### Prompt 7: Authoritative Dashboard Card Replication & Drill-Down Matrix
> *"Define the authoritative backend queries for all metric cards on Requester and IT Staff dashboards, including the Unassigned card. Document an authoritative replication matrix mapping each card directly to its corresponding list endpoint and exact query parameters (e.g. `/tickets?view=open`, `/tickets?status=Resolved&withinDays=30`, `/staff/tickets?ownerId=Unassigned`)."*

### Prompt 8: Complete AC Traceability & Test Catalog Hardening
> *"Audit the test catalog in `tests.md` across all 10 required test layers (Unit, API/Integration, UI Component, UI Style, Responsive, Authorization, Workflow, Migration/Regression, Performance-Smoke, E2E). Map every Acceptance Criterion (`AC-01` through `AC-25`) to specific Test IDs and file paths. Preserve exact count of 93 unique Test IDs, maintaining strict truth in reporting by marking Lab 4 tests as Planned (Not Run)."*

### Prompt 9: Database Migration & Baseline Stabilization (Issue #55)
> *"Implement the Lab 4 database schema migration in `server/prisma/schema.prisma` and SQL migrations. Add the `ActionTaken` model with `onDelete: Restrict` on Ticket and User foreign keys, the `IdempotencyKey` model with composite unique constraint `[route, ticketId, userId, key]`, and the dedicated `resolvedAt` timestamp on Ticket. Preserve legacy `resolvedAt = NULL` backfill without data loss, and verify complete regression pass across Lab 1–3 backend and frontend suites."*

### Prompt 10: Actions Taken Backend & Concurrency Control (Issue #56)
> *"Implement `server/src/routes/actions.routes.ts` following the Two-Phase In-Transaction Idempotency Reservation pattern. Require mandatory `Idempotency-Key` on creation, enforce strict ISO timestamp parsing with calendar validation, implement atomic Compare-And-Swap (CAS) on `Ticket.updatedAt` and `ActionTaken.updatedAt`, and record append-only `ActionTakenRevision` entries on edit with before/after snapshots and database triggers preventing update/delete/truncate."*

### Prompt 11: Actions Taken UI & Focus Trapping Modals (Issue #57)
> *"Implement `client/src/components/ActionsTaken.tsx` with chronological timeline rendering (`actionDateTime ASC, id ASC`), `+ Add Action Taken` modal with keyboard focus trapping (Tab/Shift+Tab cycle) and Escape dismiss, Edit modal with CAS token attachment and unsaved draft preservation on 409 Conflict, and Revision History diff modal. Guard modal buttons against multiple submissions and dismiss during in-flight requests."*

### Prompt 12: Ticket Workflow, Resolution Gate, and CAS Assignment (Issue #58)
> *"Implement the complete 13-row Ticket status transition matrix in `server/src/routes/tickets.routes.ts` and `StaffTicketDetail.tsx`. Enforce the Resolution Gate (`actionCount >= 1` before moving to `Resolved`, with optional resolution comment). Implement comment-driven auto-transitions (`Waiting for Requester` -> `Open`, `Resolved`/`Closed` -> `Reopened`), Requester advisory `appears-resolved` without status mutation, exact P2002 compound array matching, and stale assignment protection with CAS `lastUpdatedAt` tokens."*

### Prompt 13: Role-Based Dashboards & Metric Replication (Issue #59)
> *"Implement authoritative backend dashboard aggregation routes: `GET /api/dashboard/requester`, `GET /api/dashboard/staff`, and `GET /api/dashboard/admin`. Replicate exact metric definitions for Requester 5-card dashboard, Staff 6-card dashboard (including `unassigned` queue), and Admin 5-user metrics. Implement 4 UI states (Loading, Empty, Forbidden, Failure), strict `ownerId` parameter validation rejecting `ownerId=All` with 400 Bad Request, and responsive button wrapping."*

### Prompt 14: Final Integration, Regression, Accessibility, and Release (Issue #60)
> *"Audit the entire integrated TokTickIT application on branch `feature/7-final-integration`. Implement missing UI style and WCAG accessibility tests (`UI-STY-01`, `UI-ACC-01`, `UI-ACC-02`), complete Playwright multi-role browser automation suites (`E2E-01` through `E2E-05`), capture release screenshots across Desktop (1200px), Tablet (800px), and Mobile (400px), execute full multi-tier regression tests across Labs 1–4, reconcile the test catalog to 106 unique Test IDs, and verify production server and client builds."*

---

## 2. Test Catalog Reconciliation: Initial 93 Tests vs Final 106 Tests

During initial architecture planning (Issue #54 / Prompt 8), the test catalog was drafted with 93 Test IDs. As the implementation progressed through peer reviews and sprint issues, the test plan was intentionally hardened and expanded by **13 additional unique Test IDs** to comprehensively cover critical edge cases, bringing the final reconciled total to **106 unique Test IDs**:

1. **`ActionTakenRevision` Append-Only Integrity & Authorization (`REV-01`–`REV-06`, 6 tests):**
   Explicitly separated revision history verification into distinct test cases: first edit snapshot creation (`REV-01`), successive multi-edit chains (`REV-02`), comprehensive contract and no-op handling (`REV-03`), atomic transaction rollback on failure modes (`REV-04`), role-based authorization and non-enumeration (`REV-05`), and true append-only database trigger protection against direct SQL UPDATE, DELETE, and TRUNCATE (`REV-06`).
2. **Database Migration Revision Constraints (`MIG-03`, 1 test):**
   Added dedicated verification that foreign-key constraints enforce `onDelete: Restrict` on `ActionTakenRevision.actionTakenId` and `ActionTakenRevision.editedById`, verifying relational constraint rejection (SQLSTATE 23503) independently of row-level triggers.
3. **Action Taken Full Edit Support (`ACT-07b`, 1 test):**
   Separated Action Taken edit verification with CAS concurrency token validation from the create test cases.
4. **Resolution Gate Comment Optionality (`WF-10b`, 1 test):**
   Added an explicit test confirming that while `actionCount >= 1` is strictly mandatory to resolve a ticket, the resolution details comment is optional, permitting resolution without comment when action evidence already exists.
5. **Reopened Outgoing Transitions (`WF-13a`–`WF-13d`, 4 tests):**
   Replaced a single generalized Reopened test with four explicit workflow tests: assigned `Reopened -> In Progress` (`WF-13a`), unassigned `Reopened -> Open` (`WF-13b`), unassigned `Reopened -> Waiting for Requester` with comment (`WF-13c`), and unassigned `Reopened -> In Progress` rejection with 400 Bad Request (`WF-13d`).

**Reconciliation Formula:**
93 (Initial Catalog) + 6 (`REV-01`..`06`) + 1 (`MIG-03`) + 1 (`ACT-07b`) + 1 (`WF-10b`) + 4 (`WF-13a`..`13d`) - 0 deletions = **106 Unique Test IDs (100% Implemented, 100% Verified Passing)**.

---

## 3. Reflections on AI-Assisted Engineering

### Reflection on Specification-Agent Use
Working with the AI as a **Specification Agent** fundamentally elevated the rigor of our engineering contracts before writing application code:

1. **Catching Latent Concurrency Defects Early:** The most significant breakthrough in Sprint 4 was identifying the subtle race hazard between Idempotency deduplication and Ticket CAS conditional updates. Under PostgreSQL's default `READ COMMITTED` isolation, if idempotency persistence is placed at the end of a transaction, concurrent identical retries fail the Ticket CAS check and emit false 409 errors rather than replaying the original response. Formulating the **Two-Phase In-Transaction Reservation Pattern** prior to implementation prevented hours of painful runtime debugging and race-condition reproduction.
2. **Deterministic State Machine Modeling:** The specification agent systematically walked through all lifecycle states, pinpointing that `Reopened` lacked defined outgoing paths in earlier drafts. Documenting the complete 13-row transition matrix and the distinct Requester comment auto-transitions ensured seamless alignment between backend guards and frontend dropdown controls.
3. **Data Integrity & Traceability:** Establishing the dedicated `resolvedAt` column and explicitly defining the legacy `NULL` backfill policy prevented dashboard metric corruption without fabricating historical data.

### Reflection on Coding-Agent Implementation & Final Integration
Transitioning the AI into an **Implementation & Verification Agent** across Issues #55 through #60 demonstrated the immense power of pair-programming with strict specification constraints:

1. **Contract as a Protective Shield:** Having exact TypeScript/Prisma snippets, exact SQL WHERE conditions, and explicit status codes documented in `api-spec.md` meant the coding phase proceeded with zero architectural divergence. Every endpoint, CAS token, and error condition was implemented exactly as specified.
2. **Catching Responsive Layout & Focus-Trap Defects:** During final integration (Issue #60), running automated multi-viewport Playwright tests immediately flagged mobile horizontal scroll overflow (`545px > 401px`) on the navbar container. The agent rapidly applied `flex-wrap` and adjusted padding without resorting to anti-pattern `overflow-x: hidden` hacks, restoring complete WCAG mobile compliance.
3. **True Append-Only Verification:** Implementing the multi-tiered defense for `ActionTakenRevision` (database triggers + PostgreSQL unprivileged role privilege separation + Prisma schema restrictions) ensured that audit logs cannot be tampered with even under direct database connections.
4. **Truth in Reporting Discipline:** Tracking all 106 unique Test IDs from `Planned (Not Run)` through to `Verified (Passed)` with concrete execution logs and timestamps maintained uncompromising engineering honesty throughout the sprint.
