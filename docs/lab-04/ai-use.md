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

---

## 2. My Reflection

### Reflection on Specification-Agent Use
Working with the AI as a **Specification Agent** fundamentally elevated the rigor of our engineering contracts before writing application code.

1. **Catching Latent Concurrency Defects Early:** The most significant breakthrough in Sprint 4 was identifying the subtle race hazard between Idempotency deduplication and Ticket CAS conditional updates. Under PostgreSQL's default `READ COMMITTED` isolation, if idempotency persistence is placed at the end of a transaction, concurrent identical retries fail the Ticket CAS check and emit false 409 errors rather than replaying the original response. Formulating the **Two-Phase In-Transaction Reservation Pattern** prior to implementation prevented hours of painful runtime debugging and race-condition reproduction.
2. **Deterministic State Machine Modeling:** The specification agent systematically walked through all lifecycle states, pinpointing that `Reopened` lacked defined outgoing paths in earlier drafts. Documenting the complete 13-row transition matrix and the distinct Requester comment auto-transitions ensured seamless alignment between backend guards and frontend dropdown controls.
3. **Data Integrity & Traceability:** Establishing the dedicated `resolvedAt` column and explicitly defining the legacy `NULL` backfill policy prevented dashboard metric corruption without fabricating historical data.

### Reflection on Coding-Agent Planning & Next Steps
Following **Specification-Driven Development (Spec DD)** and **Test-Driven Development (Test DD)** created an unambiguous implementation contract:

1. **Contract as a Protective Shield:** Having exact TypeScript/Prisma snippets, exact SQL WHERE conditions, and explicit status codes documented in `api-spec.md` means the subsequent coding phase (Issues #55 through #59) can proceed with minimal ambiguity. Every endpoint, CAS token, and error condition is predetermined.
2. **Deterministic Test Architecture:** Rather than relying on non-deterministic `setTimeout` sleeps in concurrency tests, specifying synchronization barriers (promises/latches) in `tests.md` guarantees that concurrent race tests like `IDEMP-03` and `CON-08` execute reliably in CI environments.
3. **Truth in Reporting Discipline:** Maintaining a strict distinction between `Planned (Not Run)` tests and previously verified regression baselines (`REG-01`, `REG-02`, `REG-03`) upholds academic and engineering integrity. The specification agent ensured that no test was falsely marked as "Passed" before code execution.
