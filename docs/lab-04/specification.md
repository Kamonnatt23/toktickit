# Lab 4 Engineering Specification

## 1. Sprint Goal
The goal of Sprint 4 is to complete the core TokTickIT service-desk workflow by introducing **Actions Taken** under each Ticket to enable structured work planning, execution, and audit tracking. In addition, Sprint 4 provides authoritative, role-appropriate **Operational Dashboards** for Requesters, IT Staff, and Administrators; completes the **Ticket Lifecycle and Resolution Gate** including all outgoing transitions from `Reopened`; introduces database-level **Atomic Compare-And-Swap (CAS) Concurrency Control**; implements a dedicated **Idempotency-Key Strategy** with request fingerprinting against duplicate retries; establishes an authoritative **`resolvedAt` Timestamp** with an explicit legacy backfill policy; and hardens the complete application across Labs 1 through 4 to deliver an accessible, responsive, and secure product ready for final demonstration.

## 2. Stakeholder Request
Stakeholders require a reliable way to plan, perform, and track actual technical work performed on Tickets:
> *"The service desk can now receive Tickets and IT Staff can communicate with Requesters, but we still need a reliable way to plan and track the actual work. Add Actions Taken under each Ticket. Each action should contain Action Date/Time, Action Description, Result, Performed by (auto), Follow-Up Required?, Follow-up Note (required when follow-up is needed), Attachment Notes (what file to look for images etc.).*
>
> *The primary Ticket Owner remains responsible for coordinating the Ticket as a whole. Requesters may continue to indicate that the problem appears resolved, but IT Staff must review the work and formally update the Ticket.*
>
> *Add useful dashboards for Requesters and IT Staff, but keep them concise and connected to the detailed screens. Finally, polish and harden the complete application so that all earlier features continue to work consistently under the Zen Green design language."*

## 3. Scope

### Included
*   **Actions Taken Data Model & REST Endpoints:** One-to-many relationship where a Ticket has multiple Actions Taken lines. Captures date/time, description, result, automated actor from session, follow-up flags/notes, and attachment cross-references.
*   **Actions Taken UI & Full Edit Support:** Integrated into Ticket Detail for both Staff and Requesters. Staff can list, create, and edit actions (`actionDateTime`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes`), while actor `performedById` remains strictly immutable. Both creation and editing of an Action Taken refresh the parent Ticket's `updatedAt` timestamp. Requesters have read-only visibility into actions on their own tickets. Actions are displayed in deterministic chronological order (`actionDateTime ASC, id ASC`).
*   **Multi-Staff Work on Tickets:** The primary Ticket Owner coordinates the Ticket, while any active IT Staff member (or Administrator) can perform and record Actions Taken.
*   **Dedicated Resolution Timestamp (`resolvedAt`) & Legacy Policy:** Adding `resolvedAt DateTime?` to `Ticket` to capture the definitive timestamp when a ticket reaches `Resolved`. Subsequent edits to Actions Taken or comment additions refresh `updatedAt` but leave `resolvedAt` untouched. Legacy resolved/closed tickets without historical resolution timestamps are backfilled with `resolvedAt = NULL` and excluded from 30-day "Recently Resolved" metrics and lists.
*   **Complete Ticket Lifecycle & Outgoing Transitions from `Reopened`:** Full 8-state Ticket lifecycle (`New`, `Open`, `In Progress`, `Waiting for Requester`, `Resolved`, `Closed`, `Reopened`, `Cancelled`). Tickets in `Reopened` can transition to `In Progress` (staff resumes active work), `Open` (reset to queue), or `Waiting for Requester` (more info requested).
*   **Authoritative Resolution Gate:** Strict backend enforcement blocking any attempt to transition a Ticket to `Resolved` unless the Ticket has at least one recorded Action Taken (`actionCount >= 1`). Supplying a resolution comment is optional and creates a Public Comment if non-empty, but is NOT required to pass the Resolution Gate.
*   **Append-Only Action Taken Revision History:** Every successful edit of an Action Taken (`PATCH /api/tickets/:id/actions/:actionId`) that modifies editable fields automatically appends an immutable revision record in `ActionTakenRevision`. Captures revision ID, parent `actionTakenId`, editor `editedById` (from authenticated session), server timestamp `editedAt`, and complete `beforeSnapshot` and `afterSnapshot` JSON objects covering all editable fields. Performer `performedById` remains immutable. Staff and Administrators can view complete revision timelines via a dedicated read-only endpoint (`GET /api/tickets/:id/actions/:actionId/revisions`), while Requesters are denied access (403 own / 404 unowned). Revision records cannot be edited, deleted, or truncated.
*   **Comment-Driven Status Auto-Transitions:** When a Requester posts a Public Comment on a ticket in `Waiting for Requester`, the ticket automatically transitions to `Open`. When a Requester posts a Public Comment on a ticket in `Resolved` or `Closed`, the ticket automatically transitions to `Reopened` (clearing `resolvedAt = null`). Comments from Staff or Administrators do not trigger automatic transitions.
*   **Advisory Requester Resolution:** Requesters may indicate that a problem "appears resolved" exclusively when a ticket is `In Progress`. This remains strictly advisory (appends a standardized Public Comment) and does not formally transition the Ticket status.
*   **Atomic Compare-And-Swap (CAS) Concurrency Control:** Enforced via single conditional database mutations (`UPDATE ... WHERE id = :id AND updatedAt = :expectedTimestamp`) checking affected row counts. If 0 rows are updated, the backend queries existence to distinguish missing resources (HTTP 404) from concurrent/stale mutations (HTTP 409 Conflict). A database transaction alone is not claimed as sufficient CAS.
*   **Dedicated Idempotency-Key Record Architecture:** Dedicated `IdempotencyKey` model with SHA-256 payload fingerprinting and compound uniqueness `[route, ticketId, userId, key]` with 24-hour expiration. An `Idempotency-Key` header (UUIDv4) is **mandatory** on Action Taken creation (`POST /api/tickets/:id/actions`) to prevent duplicate work records from repeated clicks or retries, while remaining **optional** on `POST /comments` and `POST /appears-resolved`. Identical retries safely replay original responses with `Idempotency-Replayed: true`, while payload mismatches return HTTP 409 Conflict.
*   **Operational Dashboards:**
    *   *Requester Dashboard:* Authoritative summary of the authenticated Requester's tickets (My Open Tickets, Action Required / Waiting on You, In Progress, Recently Resolved, Closed), separate lists for Recently Updated Tickets and Recently Resolved Tickets (evaluated via `resolvedAt >= NOW() - 30 days`), quick action links, drill-down navigation, and four distinct UI states (Loading, Empty, Forbidden, Safe Failure).
    *   *IT Staff Dashboard:* Real-time operational triage summary (Unassigned Tickets, My Assigned Tickets, New, Open, In Progress, Waiting for Requester, and active IT Priority distribution), recently updated tickets queue, quick action links (excluding Ticket Creation per RBAC), queue filter drill-down, and four distinct UI states. Reopened tickets are actively counted in Unassigned/My Assigned and queue triage.
    *   *Administrator Dashboard:* Reuses Staff operational metrics via `/api/dashboard/admin` augmented with all five user statistics: Total Users, Active Requesters, Active Staff, Active Admins, and Inactive Users.
*   **Data Integrity & Audit Preservation:** `ActionTaken` and `ActionTakenRevision` reference `Ticket` and `User` with `onDelete: Restrict` to protect auditable records of technical work and revision history from accidental cascading deletion. Originating from the repository owner's approved peer-review decision, Action Taken revision history provides full technical work auditability and staff accountability (not timesheet billing or labor-cost accounting). Tickets and revision records are permanent audit records and cannot be hard-deleted, updated, or truncated via operational APIs or direct database operations.
*   **Database Schema Increment, Safe Migration & Rollback:** Prisma migration adding `ActionTaken`, `ActionTakenRevision`, `IdempotencyKey`, `Ticket.updatedAt`, and `Ticket.resolvedAt`. Preserves existing Lab 1–3 data, defines legacy backfill behavior, establishes a realistic backup/recovery procedure for rollback, and implements idempotent seed data covering all required fixtures.
*   **Full Lab 1–3 Regression Preservation:** Unbroken functionality of Authentication, Sessions, RBAC, My Tickets, Staff Queue, Public Comments, Internal Notes, Attachments, and Administrator User Management.
*   **Zen Green Design Language, Responsiveness & Accessibility:** Complete layout consistency across Desktop (1200px), Tablet (800px), and Mobile (400px) viewports using responsive grid and wrapping without blanket `overflow-x: hidden`, with full keyboard accessibility (Tab, Enter, Space, Escape) and screen-reader ARIA labeling.

### Explicitly Excluded
*   Automatic SLA clocks, escalation countdown timers, on-call scheduling, and automated breach notifications.
*   External notifications (email, SMS, LINE, web push).
*   Inventory consumption, spare-parts tracking, purchasing workflows, or cost accounting.
*   Timesheet billing, payroll logging, or detailed labor-cost calculations (Actions Taken serve exclusively for technical work auditability, troubleshooting history, and staff accountability).
*   Multi-level managerial approval workflows and electronic signature capture.
*   Advanced business-intelligence tools, ad-hoc report builders, or external data warehouse exports.
*   Hard deletion of tickets via API endpoints.
*   Ticket creation by IT Staff or Administrators (strictly prohibited by TokTickIT RBAC).
*   Unapproved feature creep outside of this specification.

---

## 4. Functional Requirements

### 4.1 Actions Taken
*   **FR-01 [Actions Taken - Data Entry & Mandatory Idempotency]:** The system shall allow authorized IT Staff and Administrators to log an Action Taken against an existing Ticket with: Action Date/Time (`actionDateTime`, ISO string, defaults to now, cannot be future), Action Description (`actionDescription`, 1–2000 chars), Result (`result`, 1–2000 chars), Follow-Up Required toggle (`followUpRequired`, boolean), Follow-up Note (`followUpNote`, mandatory if follow-up required, null if false), Attachment Notes (`attachmentNotes`, optional, max 500 chars). Action Taken creation shall **mandatorily require** an `Idempotency-Key` header (UUIDv4); requests with missing or non-UUIDv4 keys shall be rejected with HTTP 400 Bad Request before any domain mutation (no ActionTaken insert, no IdempotencyKey reservation, and no Ticket timestamp refresh).
*   **FR-02 [Actions Taken - Automated Actor]:** The system shall automatically record the authenticated user's ID as `performedById` from the active session (`req.user.id`). Manual override or spoofing of the actor shall be prevented.
*   **FR-03 [Actions Taken - Multi-Staff Collaboration]:** The system shall permit any active IT Staff member or Administrator to log an Action Taken on a Ticket, regardless of who is currently designated as the primary Ticket Owner.
*   **FR-04 [Actions Taken - Full Update Support via CAS]:** The system shall allow authorized IT Staff and Administrators to update existing Actions Taken (`actionDateTime`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes`) using atomic Compare-And-Swap concurrency (`actionLastUpdatedAt`). The performer `performedById` shall remain strictly read-only and immutable.
*   **FR-04b [Actions Taken - Append-Only Revision History]:** Originating from the repository owner's approved peer-review decision, the system shall automatically record an immutable revision record in `ActionTakenRevision` upon every successful edit of an Action Taken where one or more editable fields change. The revision record shall capture editor identity (`editedById`), server timestamp (`editedAt`), and complete before- and after-value snapshots of editable fields (`actionDateTime`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes`). Revision creation shall be atomic with the Action Taken update and parent Ticket `updatedAt` refresh. If the edit request produces no field changes (no-op), no revision record is created. The system shall provide a read-only endpoint `GET /api/tickets/:id/actions/:actionId/revisions` for IT Staff and Administrators. No API shall exist to modify or delete revision records.
*   **FR-05 [Actions Taken - Parent Timestamp Refresh]:** Both creating and updating an Action Taken shall update the parent Ticket's `updatedAt` timestamp atomically within the same database transaction.
*   **FR-06 [Actions Taken - Requester Visibility & Ordering]:** The system shall allow Requesters to view all Actions Taken recorded on Tickets they own in deterministic chronological order (`actionDateTime ASC, id ASC`). Requesters shall not have permission to create, edit, or delete Actions Taken, nor access internal revision histories.

### 4.2 Ticket Workflow & Resolution Gate
*   **FR-07 [Ticket Workflow - Transition & Source-Target Owner Enforcement]:** The system shall enforce the approved 13-row transition matrix on all Ticket status update requests, rejecting unauthorized transitions with HTTP 400 Bad Request. An assigned Ticket Owner (`ownerId != null`) shall be strictly required only for three specific source-to-target transition pairs: (1) `New` $\rightarrow$ `Open`, (2) `Open` $\rightarrow$ `In Progress`, and (3) `Reopened` $\rightarrow$ `In Progress`. Other transitions (`Waiting for Requester` $\rightarrow$ `Open`, `Waiting for Requester` $\rightarrow$ `In Progress`, `Reopened` $\rightarrow$ `Open`, `Reopened` $\rightarrow$ `Waiting for Requester`) shall succeed without an assigned owner (`ownerId = null`). Missing owner on required transitions shall be rejected with HTTP 400 Bad Request (`"Ticket must be assigned to an owner before transitioning from '{source}' to '{target}'."`).
*   **FR-08 [Ticket Workflow - Resolution Gate & `resolvedAt`]:** The system shall block any attempt to transition a Ticket to `Resolved` unless the Ticket has at least one recorded Action Taken (`actionCount >= 1`). Supplying a resolution comment is optional; if provided and non-empty, a `PublicComment` is created atomically; if omitted or blank, no error is returned and no empty comment is created. Upon successful transition to `Resolved`, the system shall populate `Ticket.resolvedAt = NOW()`.
*   **FR-09 [Ticket Workflow - Outgoing Transitions from Reopened]:** The system shall permit Tickets in `Reopened` to transition to: (1) `In Progress` (requires `ownerId != null`), (2) `Open` (resets to open pool, does NOT require owner), or (3) `Waiting for Requester` (requires public comment, does NOT require owner). Direct transitions from `Reopened` to `Resolved` or `Closed` without returning to work shall be rejected with HTTP 400 Bad Request.
*   **FR-10 [Ticket Workflow - Comment-Driven Auto-Transitions & Concurrency]:** The system shall automatically transition Ticket status upon Requester Public Comment submission:
    *   `Waiting for Requester` -> `Open`
    *   `Resolved` -> `Reopened` (resets `resolvedAt = null`)
    *   `Closed` -> `Reopened` (resets `resolvedAt = null`)
    The auto-transition shall require the Ticket's expected `lastUpdatedAt` token in the request payload and execute an atomic conditional update (`WHERE id = :ticketId AND status = :expectedStatus AND updatedAt = :lastUpdatedAt`) within the transaction. If 0 rows are affected, the backend shall check existence and ownership before deciding between HTTP 404 Not Found (non-enumeration) and HTTP 409 Conflict (stale token, concurrent status change, concurrent non-status modification, or ABA transition), rolling back the transaction without persisting an inconsistent comment. Comments submitted by IT Staff or Administrators shall not alter the Ticket status automatically.
*   **FR-11 [Ticket Workflow - Advisory Resolution Feedback]:** The system shall permit Requesters to indicate that a problem "appears resolved" exclusively when the Ticket is `In Progress`. The backend shall require the Ticket's expected `lastUpdatedAt` token and execute an atomic conditional check (`WHERE id = :ticketId AND status = 'In Progress' AND updatedAt = :lastUpdatedAt`). If 0 rows are affected, the system checks existence and ownership (distinguishing 404 Not Found from 409 Conflict) and rolls back the transaction. This action shall append a standardized Public Comment and shall NOT alter the Ticket status.
*   **FR-12 [Ticket Workflow - Atomic CAS Concurrency Control]:** The system shall require optimistic locking tokens on all state mutations (`lastUpdatedAt` for Ticket status changes, Public Comments, and Advisory Resolution feedback; `actionLastUpdatedAt` for Action Taken edits). The backend shall execute single conditional `UPDATE ... WHERE id = :id [AND status = :expectedStatus] AND updatedAt = :token` mutations. If 0 rows are affected, the backend shall check entity existence (and ownership under non-enumeration rules): if the entity does not exist or is inaccessible, the API shall return HTTP 404 Not Found; if the entity exists, the API shall return HTTP 409 Conflict (stale concurrency token, concurrent modification, or ABA status change). If the token is omitted, the API shall return HTTP 400 Bad Request.
*   **FR-13 [Idempotency-Key Architecture]:** Mutation endpoints shall support the `Idempotency-Key` header (UUIDv4). The header is **mandatory** on Action Taken creation (`POST /api/tickets/:id/actions`), where missing or malformed keys are rejected with HTTP 400 Bad Request without database or timestamp mutation, and **optional** on `POST /api/tickets/:id/comments` and `POST /api/tickets/:id/appears-resolved`. If provided, the system validates against `IdempotencyKey` scoped to compound key `[route, ticketId, userId, key]`:
    *   *Replay:* If a matching payload SHA-256 fingerprint arrives, the system safely replays the stored response with original HTTP status and header `Idempotency-Replayed: true`.
    *   *Payload Mismatch:* If the key is reused with a different payload, the system returns HTTP 409 Conflict.
    *   *PostgreSQL P2002 Collision Handling:* In PostgreSQL, competing inserts block waiting for the first transaction: if the first rolls back, the second insert proceeds normally; if the first commits, the second receives `P2002`. The backend intercepts specifically the `IdempotencyKey` compound unique constraint, queries the committed scoped record, and replays on matching hash or returns HTTP 409 on mismatch. If no record is found (exceptional race such as concurrent TTL purge), a safe bounded recheck policy is applied before returning HTTP 409 Conflict.
    *   *Expired-Key Handling:* Keys expire after 24 hours. The server prunes expired keys (`expiresAt <= NOW()`) before mutation, ensuring the unique constraint never blocks legitimate key reuse after 24 hours.

### 4.3 Role Dashboards
*   **FR-14 [Requester Dashboard - Authoritative Metrics]:** The system shall provide an authenticated Requester with a dashboard showing accurate counts of their own tickets:
    *   *My Open Tickets:* tickets with `status IN ('New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened')`.
    *   *Action Required (Waiting on You):* tickets with `status == 'Waiting for Requester'`.
    *   *In Progress:* tickets with `status == 'In Progress'`.
    *   *Recently Resolved:* tickets with `status == 'Resolved'` and `resolvedAt IS NOT NULL` and `resolvedAt >= NOW() - 30 days`.
    *   *Closed:* tickets with `status == 'Closed'`.
*   **FR-15 [Requester Dashboard - Recent Lists & Quick Actions]:** The system shall display two distinct lists for the Requester:
    1.  *Recently Updated Tickets:* top 5 tickets owned by requester ordered by `updatedAt DESC`.
    2.  *Recently Resolved Tickets:* up to 5 tickets owned by requester with `status == 'Resolved'` and `resolvedAt IS NOT NULL` and `resolvedAt >= NOW() - 30 days`, ordered strictly by `resolvedAt DESC`.
    Quick action links ("+ Create Ticket", "View My Tickets") shall be provided.
*   **FR-16 [Requester Dashboard - Drill-Down Navigation]:** Clicking any metric card or list item shall navigate the user to "My Tickets" pre-filtered by that criterion. Specifically:
    *   *My Open Tickets* card navigates to `/tickets?view=open`, strictly excluding Closed and Cancelled tickets.
    *   *Recently Resolved* card navigates to `/tickets?status=Resolved&withinDays=30`, evaluating `resolvedAt >= NOW() - 30 days`.
*   **FR-17 [IT Staff Dashboard - Operational Metrics & Reopened Work]:** The system shall provide IT Staff and Administrators with an operational dashboard displaying dedicated metric cards for active triage:
    *   *Unassigned:* active tickets with `ownerId IS NULL` and `status NOT IN ('Resolved', 'Closed', 'Cancelled')` (including unassigned `Reopened` tickets).
    *   *My Assigned:* active tickets with `ownerId == session.userId` and `status NOT IN ('Resolved', 'Closed', 'Cancelled')` (including assigned `Reopened` tickets).
    *   *New:* tickets with `status == 'New'`.
    *   *Open:* tickets with `status == 'Open'`.
    *   *In Progress:* tickets with `status == 'In Progress'`.
    *   *Waiting for Requester:* tickets with `status == 'Waiting for Requester'`.
    *   *Priority Breakdown:* active unresolved tickets (`status NOT IN ('Resolved', 'Closed', 'Cancelled')`) grouped by `itPriority`.
*   **FR-18 [IT Staff Dashboard - Queue Drill-Down & Staff Actions]:** Clicking any Staff metric card shall navigate directly to the Staff Queue pre-filtered by that criterion (e.g. Unassigned card navigates to `/staff/tickets?ownerId=Unassigned`). Quick actions shall include "Search Tickets", "My Queue", and "Unassigned Queue", and shall omit "+ Create Ticket".
*   **FR-19 [Administrator Dashboard - System Visibility]:** The system shall provide Administrators with the IT Staff operational dashboard augmented with all five user account statistics: Total Users, Active Requesters, Active Staff, Active Admins, and Inactive Users, accessible strictly via `/api/dashboard/admin`.
*   **FR-20 [Dashboard States]:** Both Requester and Staff Dashboards shall implement four explicit UI states: Loading (skeleton placeholders), Empty (clean zero states and helpful call-to-action), Forbidden (access denied alert for unauthorized roles), and Safe Failure (graceful error banner with retry option upon network/server error).

### 4.4 Hardening & Regression
*   **FR-21 [Regression - Baseline Integrity]:** All Lab 1–3 functionality (session authentication, first-login password change, ownership isolation, comments, internal notes, attachments, user management) shall continue to function without degradation.
*   **FR-22 [Accessibility & Responsive UI]:** All new screens (Dashboards, Actions Taken) shall follow the Zen Green visual language and adapt seamlessly across Desktop (1200px), Tablet (800px), and Mobile (400px) viewports using responsive grid and wrapping without blanket `overflow-x: hidden`, with full keyboard accessibility and screen-reader ARIA labeling.

---

## 5. Business Rules

### 5.1 Actions Taken Rules
*   **BR-01 [Single Ticket Parent & Audit Retention]:** An Action Taken record belongs to exactly one Ticket (`ticketId` is mandatory and immutable). To preserve technical audit history, `ActionTaken` has an `onDelete: Restrict` relation to `Ticket`. Tickets with Actions Taken cannot be deleted. Operational APIs shall not expose ticket deletion. Creating an Action Taken strictly requires a valid `Idempotency-Key` header (UUIDv4) to prevent duplicate work records from repeated clicks or retries.
*   **BR-02 [Independent Staff Work]:** The primary Ticket Owner coordinates the Ticket, but an Action Taken may be performed and logged by any active IT Staff member or Administrator.
*   **BR-03 [Automated Author Binding]:** The `performedById` attribute must be bound directly from the authenticated session (`req.user.id`). It cannot be supplied, selected from a client dropdown, or edited later.
*   **BR-04 [Editable Fields & Conditional Validation]:** When editing an Action Taken via `PATCH`, authorized staff may modify `actionDateTime`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, and `attachmentNotes`. When `followUpRequired` is `true`, `followUpNote` is mandatory (1–2000 non-whitespace characters). When `followUpRequired` is `false`, `followUpNote` must be submitted as `null`.
*   **BR-04b [Append-Only Action Taken Revision History & Immutability]:** Originating from the repository owner's approved peer-review decision (not required by Handout Section 4.3), this feature ensures technical work auditability and staff accountability:
    1.  *Automatic Generation:* A successful `PATCH` that modifies one or more editable fields (`actionDateTime`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes`) must append exactly one `ActionTakenRevision` record.
    2.  *Complete Snapshots:* Each revision records full `beforeSnapshot` and `afterSnapshot` JSON objects capturing all editable fields at the time of modification.
    3.  *Author & Timestamp Integrity:* `editedById` is strictly bound to the authenticated session (`req.user.id`); `editedAt` is generated by the server (`NOW()`). Neither can be supplied or overridden by client payload. Original `performedById` remains strictly immutable.
    4.  *Immutability & Audit Retention:* Revisions are strictly append-only. There are no API endpoints to modify or delete revisions. Relations to `ActionTaken` and `User` enforce `onDelete: Restrict`.
    5.  *Transaction Atomicity:* Reading the before-state, CAS row validation, conditional update, revision insertion, and parent Ticket `updatedAt` refresh execute in a single database transaction. If any step fails (e.g. CAS 0 rows affected), the entire transaction rolls back and no revision is created.
    6.  *No-Op Edits:* If an edit request produces no actual changes to editable fields, the operation is a no-op: no revision is appended.
    7.  *Role Boundaries:* Revision history is accessible to IT Staff and Administrators via `GET /api/tickets/:id/actions/:actionId/revisions`. Requesters receive HTTP 403 Forbidden on own tickets (and 404 on unowned tickets under non-enumeration rules).
*   **BR-05 [Attachment Cross-Referencing & Length]:** `attachmentNotes` is an optional descriptive string (up to 500 characters) referencing associated attachment filenames. If exceeded, validation returns HTTP 400 Bad Request.
*   **BR-06 [Active Staff Requirement]:** The actor performing or editing an Action Taken must be an active user with role `IT Staff` or `Administrator`. Inactive users cannot record or edit actions.
*   **BR-07 [Requester Read-Only Access]:** Requesters can view Actions Taken only on Tickets they own. Any attempt by a Requester to create, update, or delete an Action Taken must be rejected with HTTP 403 Forbidden.
*   **BR-08 [Timeline Ordering]:** Actions Taken must be retrieved and displayed in chronological order: `ORDER BY actionDateTime ASC, id ASC`. Revisions are retrieved in chronological order: `ORDER BY editedAt ASC, id ASC`.
*   **BR-09 [Parent Timestamp Synchronization]:** Every `POST` and `PATCH` on an Action Taken must refresh the parent Ticket's `updatedAt` to the current transaction timestamp.

### 5.2 Ticket Lifecycle & Status Transition Rules
*   **BR-10 [Permitted Status Transitions Matrix & Exact Source-Target Owner Rules]:** Ticket status changes via `PATCH /api/staff/tickets/:id/status` must strictly adhere to the 13 permitted transitions below. All unpermitted transitions must be rejected with HTTP 400 Bad Request.
    *   **Exact Source-Target Owner Rule:** An assigned Ticket Owner (`ownerId != null`) is mandatory **only** for three specific source-to-target transition pairs:
        1. `New` $\rightarrow$ `Open`
        2. `Open` $\rightarrow$ `In Progress`
        3. `Reopened` $\rightarrow$ `In Progress`
    *   All other transitions (`Waiting for Requester` $\rightarrow$ `Open`, `Waiting for Requester` $\rightarrow$ `In Progress`, `Reopened` $\rightarrow$ `Open`, `Reopened` $\rightarrow$ `Waiting for Requester`, etc.) do **not** require an assigned owner and succeed when `ownerId = null`. Missing owner on required transitions returns HTTP 400 Bad Request (`"Ticket must be assigned to an owner before transitioning from '{source}' to '{target}'."`).

| # | Source Status | Target Status | Authorized Roles | Required Conditions / Side Effects |
|---|---|---|---|---|
| 1 | `New` | `Open` | IT Staff | Ticket must have an assigned owner (`ownerId != null`). |
| 2 | `New` | `Cancelled` | IT Staff | Cancellation `reason` is required; generates an `InternalNote`. |
| 3 | `Open` | `In Progress` | IT Staff | Ticket must have an assigned owner (`ownerId != null`). |
| 4 | `Open` | `Waiting for Requester` | IT Staff | Public `comment` is required; generates a `PublicComment`. |
| 5 | `In Progress` | `Waiting for Requester` | IT Staff | Public `comment` is required; generates a `PublicComment`. |
| 6 | `Waiting for Requester` | `In Progress` | IT Staff | Staff resumes active work. (Owner NOT required; `ownerId` may be null). |
| 7 | `Waiting for Requester` | `Open` | IT Staff | Staff resets ticket to open queue. (Owner NOT required; `ownerId` may be null). |
| 8 | `In Progress` | `Resolved` | IT Staff | **Resolution Gate (BR-12)**: requires `>= 1` Action Taken (`actionCount >= 1`). Optional non-empty comment creates `PublicComment`; **sets `resolvedAt = NOW()`**. |
| 9 | `Resolved` | `Closed` | IT Staff | Final closure confirmation; preserves `resolvedAt`. |
| 10| `Closed` | `Reopened` | IT Staff | Exceptionally reopened; requires `reason` (creates `InternalNote`); **clears `resolvedAt` to `null`**. |
| 11| `Reopened` | `In Progress` | IT Staff | Staff resumes active work; ticket must have an assigned owner (`ownerId != null`); retains already-null `resolvedAt` value. |
| 12| `Reopened` | `Open` | IT Staff | Staff resets ticket to open pool (Owner NOT required; `ownerId` may be null); retains already-null `resolvedAt` value. |
| 13| `Reopened` | `Waiting for Requester` | IT Staff | Staff requests additional information; requires public `comment` (creates `PublicComment`); retains already-null `resolvedAt` value. |

*   **Distinct Comment-Driven Requester Transitions (Reconciled with Matrix):**
    *   The 13 transitions above govern explicit IT Staff transitions invoked via `PATCH /api/staff/tickets/:id/status`. (Administrators receive `403 Forbidden` per the preserved Lab 3 baseline).
    *   In addition, the system supports two automated comment-driven transitions triggered exclusively by the owning Requester via `POST /api/tickets/:id/comments`:
        1.  `Waiting for Requester` $\rightarrow$ `Open`: Automatically resumes ticket to open triage pool when the requester posts a reply.
        2.  `Resolved` or `Closed` $\rightarrow$ `Reopened`: Automatically reopens ticket when the requester posts a follow-up comment. The customer's `PublicComment` content itself serves as the justification for reopening; no `InternalNote` is generated (preserving internal note privacy). Resets `resolvedAt = null` and refreshes parent `updatedAt = NOW()`.
        3.  *Contrast with Staff Reopen:* IT Staff reopen tickets from `Closed` via `PATCH /api/staff/tickets/:id/status`, which strictly requires a dedicated `reason` field and creates an `InternalNote`.
*   **BR-11 [Comment-Driven Auto-Transitions & Concurrency Control]:** When a Requester submits a Public Comment via `POST /api/tickets/:id/comments`:
    *   If current status is `Waiting for Requester`, the Ticket status automatically transitions to `Open`.
    *   If current status is `Resolved` or `Closed`, the Ticket status automatically transitions to `Reopened` and **resets `resolvedAt = null`**.
    *   If current status is `New`, `Open`, `In Progress`, `Reopened`, or `Cancelled`, the comment is posted and status remains unchanged.
    *   *Atomic State-and-Timestamp Concurrency:* All comment submissions require `lastUpdatedAt` in the request payload and execute an atomic conditional database mutation (`UPDATE "Ticket" SET [status = :newStatus,] "updatedAt" = NOW() WHERE id = :ticketId AND status = :expectedStatus AND "updatedAt" = :lastUpdatedAt`) within the transaction. For comments that do not change status, parent Ticket `updatedAt` is conditionally refreshed to `NOW()`. If 0 rows are affected because staff modified the ticket status or non-status fields concurrently, the server checks existence and ownership (returning HTTP 404 if absent/unowned under non-enumeration rules, or HTTP 409 Conflict if modified concurrently). The entire transaction rolls back, aborting comment creation.
    *   Comments submitted by IT Staff do NOT auto-transition ticket status, but conditionally refresh parent Ticket `updatedAt`. (Administrators receive `403 Forbidden` per preserved Lab 3 baseline).
*   **BR-12 [Resolution Gate Criteria, Justification & Legacy Policy]:**
    *   *Rule:* Transitioning a Ticket to `Resolved` strictly requires:
        1. Current status is `In Progress`.
        2. At least one associated `ActionTaken` record exists on the Ticket (`actionCount >= 1`).
        3. Setting `Ticket.resolvedAt = NOW()`.
    *   *Optional Resolution Comment:* Supplying a resolution comment is strictly **optional**. If a non-empty comment is provided, the system creates a `PublicComment` within the same transaction. If omitted or whitespace-only, the resolution succeeds without error and no empty `PublicComment` is created. A resolution comment is **never required** to pass the Resolution Gate.
    *   *Justification:* The Resolution Gate guarantees that technical effort is documented in an auditable Action Taken record before a ticket is marked resolved, preventing drive-by closures without technical work. While communication with the requester remains good practice and is supported via optional comments, requiring a redundant comment when thorough actions are already recorded creates artificial friction.
    *   *Legacy Ticket Policy:* Existing Lab 1–3 tickets that were already in `Resolved` or `Closed` status prior to Lab 4 remain valid. Because trustworthy resolution timestamps do not exist for legacy records, they are backfilled with `resolvedAt = NULL`. Queries for Recently Resolved metrics strictly require `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - 30 days`, cleanly excluding unverified legacy records from 30-day windows. Any legacy ticket transitioned or re-resolved in Lab 4 sets `resolvedAt = NOW()`.
*   **BR-13 [Advisory Requester Resolution]:** When a Requester triggers "Problem Appears Resolved":
    1.  The action is permitted ONLY when the Ticket status is `In Progress`.
    2.  The backend requires `lastUpdatedAt` in the payload and executes an atomic conditional mutation (`UPDATE "Ticket" SET ... WHERE id = :ticketId AND status = 'In Progress' AND "updatedAt" = :lastUpdatedAt`). If 0 rows are updated because staff modified ticket status or non-status fields concurrently, the server checks existence and ownership (distinguishing 404 from 409) and rolls back the transaction with HTTP 409 Conflict.
    3.  The action creates a standardized Public Comment authored by the Requester: `"The requester has indicated that the problem appears resolved."`
    4.  The Ticket status **remains `In Progress`**. Formal resolution is reserved for authorized staff following BR-12.
*   **BR-14 [Atomic Compare-And-Swap (CAS) & State-Conditional Concurrency Control]:** A database transaction alone is not sufficient concurrency control under `READ COMMITTED` isolation. Mutation endpoints enforce atomic conditional updates directly in SQL:
    *   *Ticket Mutation:* `PATCH /api/staff/tickets/:id/status` requires `lastUpdatedAt`. The database mutation must execute an atomic conditional update:
        `UPDATE "Ticket" SET ... WHERE id = :id AND "updatedAt" = :lastUpdatedAt`
        If the affected row count is 0, the server queries for existence: if the entity does not exist or is invisible under non-enumeration rules, returns HTTP 404; if it exists but timestamps differed, returns HTTP 409 Conflict.
    *   *Action Taken Mutation:* `PATCH /api/tickets/:id/actions/:actionId` requires `actionLastUpdatedAt`. The database mutation must execute:
        `UPDATE "ActionTaken" SET ... WHERE id = :id AND "ticketId" = :ticketId AND "updatedAt" = :actionLastUpdatedAt`
        If the affected row count is 0, the server queries for existence: if the entity does not exist or is inaccessible, returns HTTP 404 Not Found; if it exists but timestamps differed, returns HTTP 409 Conflict. Upon successful update, revision is recorded and parent `Ticket.updatedAt` is updated within the same transaction.
    *   *Comment & Advisory State-Conditional Updates:* `POST /comments` and `POST /appears-resolved` require `lastUpdatedAt` and execute atomic conditional updates matching the expected status and timestamp (`status = :expectedStatus AND "updatedAt" = :lastUpdatedAt`). If 0 rows are affected due to concurrent status changes, non-status updates (owner/priority reassignment), or ABA transitions, the server checks existence and ownership before returning HTTP 404 (absent/unowned) or HTTP 409 Conflict, rolling back the entire transaction.
    *   *Missing Token:* If `lastUpdatedAt` or `actionLastUpdatedAt` is omitted in mutation payloads, the server rejects the request with HTTP 400 Bad Request.
*   **BR-15 [Dedicated Idempotency-Key Architecture & CAS Concurrency Interaction]:**
    *   *Scope:* Scoped to compound key `[route, ticketId, userId, key]`.
    *   *Header Requirement:*
        - `POST /api/tickets/:id/actions`: `Idempotency-Key: <UUIDv4>` is **MANDATORY**. Missing or non-UUIDv4 key returns HTTP 400 Bad Request before any domain mutation (no ActionTaken insert, no IdempotencyKey reservation, and no Ticket timestamp refresh).
        - `POST /api/tickets/:id/comments` and `POST /api/tickets/:id/appears-resolved`: `Idempotency-Key: <UUIDv4>` is **OPTIONAL**. If omitted, requests execute normally without deduplication.
    *   *Fingerprint Validation & Replay:* Requests compute a SHA-256 hash of canonical JSON payload. If the key exists:
        - Matching hash: safely replays the original response with stored HTTP status and header `Idempotency-Replayed: true`.
        - Mismatched hash: rejects with HTTP 409 Conflict (`"Idempotency key reused with different request payload"`).
    *   *Two-Phase In-Transaction Reservation Pattern:* Under PostgreSQL Read Committed isolation, if two concurrent identical requests arrive with the same `Idempotency-Key` and `lastUpdatedAt`, evaluating Ticket CAS before inserting `IdempotencyKey` causes Request 2 to fail the Ticket CAS check (0 rows affected) and return a false 409 Conflict, aborting before reaching `IdempotencyKey`. To prevent this race, the server employs a Two-Phase Reservation Pattern:
        1.  **Phase 1 (Reservation Claim):** Immediately upon entering `$transaction`, the server claims the slot: `tx.idempotencyKey.create({ data: { key, route, ticketId, userId, requestHash, statusCode: null, responseBody: null, expiresAt } })`. In PostgreSQL, this places an exclusive tuple lock on the compound unique index `[route, ticketId, userId, key]`. Competing Request 2 immediately blocks on this index tuple lock *before* evaluating Ticket CAS.
        2.  **Phase 2 (CAS & Finalization):** Request 1 executes Ticket CAS and domain operations (ActionTaken or PublicComment and parent `updatedAt` refresh). Upon success, Request 1 finalizes the reservation: `tx.idempotencyKey.update({ where: { id: reservation.id }, data: { statusCode: 201, responseBody: JSON.stringify(result) } })`, and commits.
        3.  **Outcome Resolution:** When Request 1 commits, Request 2 unblocks at Phase 1. Because Request 1 committed the unique index entry, Request 2 receives unique constraint violation `P2002` (SQLSTATE `23505`). Request 2 aborts without ever evaluating Ticket CAS, catches `P2002`, queries the committed record, and replays the response with `Idempotency-Replayed: true` (or returns 409 if `requestHash` differs). If Request 1 rolls back, Request 2 unblocks, its reservation succeeds, and Request 2 proceeds to evaluate CAS.
        4.  **Distinct / Non-Idempotent Mutations:** Requests without an `Idempotency-Key` (on optional endpoints) or with distinct keys do not block on `IdempotencyKey` and evaluate Ticket CAS directly. When `updatedAt` mismatches, 0 rows are affected and the server returns genuine HTTP 409 Conflict, preserving CAS concurrency protection.
    *   *Expired-Key Handling:* Keys expire after 24 hours (`expiresAt <= NOW()`). Before inserting, the server deletes any expired record (`DELETE WHERE id = :existingId`) so the unique constraint does not block legitimate key reuse after 24 hours.
    *   *Distinct Submissions:* Separate legitimate work entries must use distinct UUIDs; both persist normally.

### 5.3 Operational Dashboard Calculation Rules
*   **BR-16 [Authoritative Server Calculation]:** All dashboard metrics must be computed server-side directly from PostgreSQL database queries. Dashboards must not transfer entire ticket datasets to calculate counts client-side.
*   **BR-17 [Requester Metric & List Definitions (`resolvedAt` Standard)]:**
    *   *Timezone Standard:* All timestamps stored and transmitted in UTC (ISO 8601). Displayed in client local timezone.
    *   *My Open Tickets:* Count of tickets where `requesterId == session.userId` and `status IN ('New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened')`. Excludes `Closed` and `Cancelled`.
    *   *Action Required (Waiting on You):* Count of tickets where `requesterId == session.userId` and `status == 'Waiting for Requester'`.
    *   *In Progress:* Count of tickets where `requesterId == session.userId` and `status == 'In Progress'`.
    *   *Recently Resolved:* Count of tickets where `requesterId == session.userId` and `status == 'Resolved'` and **`resolvedAt IS NOT NULL AND resolvedAt >= NOW() - INTERVAL '30 days'`**. Legacy tickets with `resolvedAt = NULL` are excluded.
    *   *Closed:* Count of tickets where `requesterId == session.userId` and `status == 'Closed'`.
    *   *Recently Updated List:* Top 5 tickets owned by requester ordered by `updatedAt DESC`.
    *   *Recently Resolved List:* Up to 5 tickets owned by requester with `status == 'Resolved'` and `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - INTERVAL '30 days'`, ordered strictly by **`resolvedAt DESC`**.
*   **BR-18 [IT Staff Operational Metrics & Active Definition]:**
    *   *Definition of Active Triage Tickets:* Tickets in `Resolved`, `Closed`, and `Cancelled` represent completed or terminated work and are **excluded** from active staff triage counts. Tickets in `Reopened` represent active work and are **included**.
    *   *Unassigned:* Count of active tickets where `ownerId IS NULL` and `status NOT IN ('Resolved', 'Closed', 'Cancelled')` (includes unassigned `Reopened`).
    *   *My Assigned:* Count of active tickets where `ownerId == session.userId` and `status NOT IN ('Resolved', 'Closed', 'Cancelled')` (includes assigned `Reopened`).
    *   *New:* Count of tickets where `status == 'New'`.
    *   *Open:* Count of tickets where `status == 'Open'`.
    *   *In Progress:* Count of tickets where `status == 'In Progress'`.
    *   *Waiting for Requester:* Count of tickets where `status == 'Waiting for Requester'`.
    *   *Priority Breakdown:* Counts of active unresolved tickets (`status NOT IN ('Resolved', 'Closed', 'Cancelled')`) grouped by `itPriority` (`Critical`, `High`, `Medium`, `Low`).
    *   *Recently Updated Queue:* Top 5 tickets across the service desk ordered by `updatedAt DESC`.
*   **BR-19 [Administrator Dashboard Extension]:** Includes all IT Staff operational metrics plus exact account counts: Total Users, Active Requesters, Active Staff, Active Admins, and Inactive Users, accessible strictly via `/api/dashboard/admin`.
*   **BR-20 [Dashboard UI States]:** Both Requester and Staff dashboards must support:
    1.  *Loading State:* Pulsing skeleton placeholders while awaiting data.
    2.  *Empty State:* When count is `0`, render clean zero badge and friendly call-to-action message.
    3.  *Forbidden State:* When unauthorized role accesses dashboard, render access-denied message without crashing.
    4.  *Safe Failure State:* When network/server error occurs, render error alert with a "Retry" button.
*   **BR-21 [Drill-Down Query Alignment]:** Drill-down links must pass exact query parameters to existing list endpoints:
    *   Requester *My Open Tickets* -> `/tickets?view=open` (filters to open statuses, excluding Closed and Cancelled).
    *   Requester *Waiting for Requester* -> `/tickets?status=Waiting for Requester`.
    *   Requester *In Progress* -> `/tickets?status=In Progress`.
    *   Requester *Recently Resolved* -> `/tickets?status=Resolved&withinDays=30` (evaluates `resolvedAt >= NOW() - 30 days`).
    *   Requester *Closed* -> `/tickets?status=Closed`.
    *   Staff *Unassigned* card -> `/staff/tickets?ownerId=Unassigned`.
    *   Staff *My Assigned* card -> `/staff/tickets?ownerId={user.id}`.
    *   Staff *Status* cards -> `/staff/tickets?status={status}` (including `status=Reopened`).
    *   Staff *Priority Breakdown* -> `/staff/tickets?itPriority={priority}&scope=active`.

### 5.4 Authorization Matrix

| Feature / Action | Unauthenticated | Requester | IT Staff | Administrator |
|---|---|---|---|---|
| View Requester Dashboard | Deny (401) | Allow (Own) | Deny (403) | Deny (403) |
| View IT Staff Dashboard | Deny (401) | Deny (403) | Allow | Allow |
| View Actions Taken on Ticket | Deny (401) | Allow (Own Ticket) | Allow (All) | Allow (All) |
| Create Action Taken | Deny (401) | Deny (403) | Allow | Allow |
| Update Action Taken | Deny (401) | Deny (403) | Allow | Allow |
| View Action Taken Revision History | Deny (401) | Deny (403) | Allow | Allow |
| Change Ticket Status | Deny (401) | Deny (403)* | Allow | Deny (403) |
| Resolve Ticket (Pass Resolution Gate) | Deny (401) | Deny (403) | Allow | Deny (403) |
| Trigger "Appears Resolved" (Advisory) | Deny (401) | Allow (Own `In Progress`) | Deny (403) | Deny (403) |
| Post Public Comment | Deny (401) | Allow (Own Ticket) | Allow (All) | Deny (403) |
| Create Internal Note (Direct API) | Deny (401) | Deny (403) | Allow | Deny (403)** |
| Create Ticket | Deny (401) | Allow | Deny (403) | Deny (403) |
| View Staff Queue | Deny (401) | Deny (403) | Allow | Allow |
| Claim / Assign Ticket | Deny (401) | Deny (403) | Allow | Deny (403) |
| User Management | Deny (401) | Deny (403) | Deny (403) | Allow |

*\*Notes on RBAC & Handout Scope Interpretation:*
1.  *Requester Comment Auto-Transitions:* Requesters implicitly auto-transition tickets only when posting Public Comments on `Waiting for Requester`, `Resolved`, or `Closed` tickets per BR-11.
2.  *Actions Taken Creation & Editing (Authorized for IT Staff and Administrator):*
    *   *Handout Evidence:* Page 1, Section 1 explicitly states: *"IT Staff and Administrators can create and update Actions Taken for a Ticket;"*. Furthermore, Page 2–3, Section 4.3 Table (*Action Taken Roles and Responsibilities*) authorizes Administrator to *"Perform IT Staff behavior and retain administrative access needed for support and testing"* specifically within the scope of Actions Taken.
3.  *Conservative Baseline Enforcement for Unrelated Endpoints:*
    *   Section 4.3 is titled specifically *"4.3. Action Taken Roles and Responsibilities"*. Its Administrator row is therefore interpreted strictly within the context of Actions Taken rather than as a global grant of IT Staff capabilities across the application.
    *   Under `SE+Lab+4.pdf` Page 1, Section 1 and Page 7, Section 8.5, all previous authorization regression behavior must continue to work. The Lab 3 API baseline strictly denied non-IT Staff from modifying ticket status, posting public comments, and posting internal notes.
    *   **Ticket Status Transitions (`PATCH /api/staff/tickets/:id/status`):** Restricted strictly to `IT Staff` (`server/src/app.ts` line 315). Administrators receive `403 Forbidden` (`"Forbidden: Only IT Staff can update ticket status"`).
    *   **Public Comments (`POST /api/tickets/:id/comments`):** Restricted to `Requester` (own tickets) and `IT Staff` (`server/src/app.ts` line 606). Administrators receive `403 Forbidden` (`"Administrators cannot post comments"`).
    *   **Direct Internal Notes (`POST /api/tickets/:id/notes`):** Restricted strictly to `IT Staff` (`server/src/app.ts` line 725). Administrators receive `403 Forbidden` (`"Only IT Staff can post internal notes"`). System-generated internal audit notes produced upon status transitions (`Cancelled`, `Reopened`) are internal system records, not direct API invocations.
    *   *Resolution:* All previous RBAC open questions are closed under this conservative baseline. An explicit future instructor clarification may expand Administrator permissions, but the contract strictly enforces the preserved Lab 3 baseline.

### 5.5 Explicit Error Policy
*   **HTTP 400 Bad Request:** Payload validation failures (missing required fields, summary > 100 chars, description > 1000 chars, follow-up note missing when required, attachmentNotes > 500 chars, missing or malformed `Idempotency-Key` on Action Taken creation, missing owner on transitions requiring an assigned owner [`New->Open`, `Open->In Progress`, `Reopened->In Progress`], missing `lastUpdatedAt` / `actionLastUpdatedAt` token across Ticket status, ActionTaken edit, Public Comment, or Advisory Resolution, invalid transition, or failing Resolution Gate with 0 actions).
*   **HTTP 401 Unauthorized:** Missing, expired, or invalid session cookie.
*   **HTTP 403 Forbidden:** Authenticated user lacks permission for the endpoint (e.g. Requester attempting Action mutation or revision access; Administrator attempting status transition or comments).
*   **HTTP 404 Not Found (Non-Enumeration):** Resource does not exist OR user requests a Ticket, Attachment, Action Taken, or Revision belonging to another Requester.
*   **HTTP 409 Conflict:** Atomic conditional update affected 0 rows (stale update, concurrent status change, concurrent non-status modification, or ABA transition), idempotency key payload mismatch, concurrent idempotency reconciliation race, or duplicate email during user creation.
*   **HTTP 500 Internal Server Error:** Unexpected server-side failure. Returns a safe, generic message (`{ error: "Internal server error" }`).

---

## 6. UI Specification Summary
*(Full UI details are specified in `ui-spec.md`)*
*   **Global Shell Navigation:** The navigation bar expands to include a role-appropriate "Dashboard" link for all authenticated roles.
*   **Requester Dashboard:** High-level summary displaying 5 metric cards (`My Open Tickets`, `Action Required / Waiting on You`, `In Progress`, `Recently Resolved`, `Closed`), two separate lists for Recently Updated Tickets and Recently Resolved Tickets (30-day boundary via `resolvedAt`), quick action buttons (`+ Create Ticket`, `View My Tickets`), and 4 explicit UI states (Loading, Empty, Forbidden, Safe Failure).
*   **IT Staff Dashboard:** Operational triage center displaying 6 metric cards (`Unassigned`, `My Assigned`, `New`, `Open`, `In Progress`, `Waiting for Requester`), priority breakdown indicators, Recently Updated Queue items, quick action buttons (`Search Tickets`, `My Queue`, `Unassigned Queue` — strictly omitting ticket creation), and 4 explicit UI states.
*   **Actions Taken Interface on Ticket Detail:**
    *   *Staff Ticket Detail:* Positioned prominently above `CommunicationArea`. Features an "Actions Taken" timeline in deterministic chronological order (`actionDateTime ASC, id ASC`), a `+ Add Action Taken` button triggering create mode, inline/modal `Edit` controls supporting all editable fields while displaying the immutable original performer, and a `View Edit History` action opening a modal with chronological before/after revision snapshots. Create form generates client-side `Idempotency-Key: uuidv4()` and reuses it on retries.
    *   *Requester Ticket Detail:* Renders a read-only timeline of Actions Taken above `CommunicationArea`, allowing Requesters to review all technical steps taken on their ticket without internal revision history controls.
*   **Resolution Gate Feedback:** In the Staff status transition dropdown, selecting `Resolved` displays dynamic inline verification: if the ticket has 0 Actions Taken, the submit button is disabled and a warning alert explains that at least one Action Taken must be logged before the ticket can be resolved. If >= 1 Action Taken exists, the confirmation button is enabled immediately; supplying an optional resolution comment is supported but does NOT disable the button if left blank.
*   **Status Transition Dropdown Alignment:** Displays only valid transitions based on the 13-row transition matrix (e.g. for `Reopened` tickets, displays `In Progress`, `Open`, and `Waiting for Requester`).
*   **Restoration of Requester Ticket Detail:** Addressing the Lab 3 audit finding, `TicketDetail.tsx` is updated to render `<CommunicationArea>` directly below Actions Taken, restoring Public Comments and the advisory "Problem Appears Resolved" button.
*   **Duplicate Click Prevention & Conflict Preservation:** Submit buttons disable immediately on click with a spinner. If a 409 Conflict occurs, the UI displays a detailed alert and preserves unsaved user draft inputs rather than silently discarding them.
*   **Responsive & Zen Green Design:** Follows existing CSS tokens (`#006B3C` primary green, `#fdfaf6` card backgrounds, rounded pills). Uses flex-wrap, table-responsive wrappers, and stacked cards on mobile without blanket `overflow-x: hidden`.

---

## 7. Data Changes

### 7.1 Prisma Models & Schema Extensions
The PostgreSQL schema requires the addition of the `ActionTaken` model, `ActionTakenRevision` model, `IdempotencyKey` model, and enhancements to `Ticket`:

```prisma
model ActionTaken {
  id                Int                   @id @default(autoincrement())
  ticketId          Int
  actionDateTime    DateTime              @default(now())
  actionDescription String
  result            String
  performedById     Int
  followUpRequired  Boolean               @default(false)
  followUpNote      String?
  attachmentNotes   String?
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt @default(now())

  // Relations: Protect audit history with onDelete: Restrict
  ticket            Ticket                @relation(fields: [ticketId], references: [id], onDelete: Restrict)
  performedBy       User                  @relation("ActionPerformer", fields: [performedById], references: [id], onDelete: Restrict)
  revisions         ActionTakenRevision[]

  @@index([ticketId])
  @@index([performedById])
}

model ActionTakenRevision {
  id             String      @id @default(uuid())
  actionTakenId  Int
  editedById     Int
  editedAt       DateTime    @default(now())
  beforeSnapshot Json        // Complete snapshot of editable fields prior to modification
  afterSnapshot  Json        // Complete snapshot of editable fields after modification

  actionTaken    ActionTaken @relation(fields: [actionTakenId], references: [id], onDelete: Restrict)
  editedBy       User        @relation("ActionRevisionEditor", fields: [editedById], references: [id], onDelete: Restrict)

  @@index([actionTakenId, editedAt])
  @@index([editedById])
}

model IdempotencyKey {
  id           Int      @id @default(autoincrement())
  key          String   // UUIDv4 provided by client
  route        String   // e.g. "POST /api/tickets/:id/actions"
  ticketId     Int
  userId       Int
  requestHash  String   // SHA-256 hash of canonical request body
  statusCode   Int?     // Stored HTTP response status code (null while in-flight reservation)
  responseBody String?  // Serialized response JSON payload (null while in-flight reservation)
  createdAt    DateTime @default(now())
  expiresAt    DateTime // createdAt + 24 hours

  @@unique([route, ticketId, userId, key])
  @@index([expiresAt])
}
```

And in `model Ticket`:
```prisma
model Ticket {
  // ... existing fields ...
  resolvedAt        DateTime?     // Dedicated timestamp for resolution reporting
  updatedAt         DateTime      @updatedAt @default(now())
  actionsTaken      ActionTaken[]
  // ...
}
```

And in `model User`:
```prisma
model User {
  // ... existing fields ...
  actionsPerformed      ActionTaken[]         @relation("ActionPerformer")
  editedActionRevisions ActionTakenRevision[] @relation("ActionRevisionEditor")
  // ...
}
```

### 7.2 Database Design Decisions & Justifications
1.  **Decision 1: Audit Retention with `onDelete: Restrict`:**
    *   *Rationale:* Actions Taken represent immutable technical work records and legal audit trails. Setting `onDelete: Restrict` on `Ticket` and `User` relations prevents accidental cascade deletion of tickets or staff accounts that contain recorded actions. TokTickIT tickets are permanent and cannot be hard-deleted via API.
2.  **Decision 2: Dedicated `resolvedAt` Column on `Ticket` with NULL Legacy Policy:**
    *   *Rationale:* `Ticket.updatedAt` changes whenever comments, attachments, or Actions Taken are added/modified. Storing a dedicated `resolvedAt DateTime?` guarantees that subsequent activity on resolved tickets does not falsely alter their resolution age or corrupt the 30-day "Recently Resolved" dashboard metric. Legacy tickets are backfilled as `NULL` because reliable historical timestamps do not exist; inventing timestamps from `createdAt` would corrupt audit reporting.
3.  **Decision 3: Dedicated `IdempotencyKey` Table with SHA-256 Fingerprinting:**
    *   *Rationale:* Storing idempotency records in a dedicated table scoped by `[route, ticketId, userId, key]` supports all mutation endpoints uniformly, enforces exact payload verification via SHA-256, prevents duplicate Action Taken creation via mandatory header enforcement, and enables safe 24-hour TTL pruning without altering business models.
4.  **Decision 4: Direct Foreign Key Relations with Dedicated Indexes:**
    *   *Rationale:* Adding explicit indexes on `ticketId`, `performedById`, and `[actionTakenId, editedAt]` guarantees high-speed timeline retrieval (`WHERE ticketId = ? ORDER BY actionDateTime ASC, id ASC`) and fast audit queries without full-table scans.
5.  **Decision 5: Append-Only `ActionTakenRevision` Audit History & Database-Level Immutability:**
    *   *Rationale:* Originating from the repository owner's approved peer-review decision (not required by Handout Section 4.3), every successful edit of an Action Taken must be fully auditable for technical work accountability. Creating an immutable `ActionTakenRevision` record on every field-altering edit captures the authenticated editor (`editedById`), server timestamp (`editedAt`), and complete JSON snapshots of before and after states. Previous revisions cannot be updated, deleted, or truncated, and both parent relations enforce `onDelete: Restrict`. To guarantee that revision records cannot be rewritten, deleted, or wiped even via direct database mutations, PostgreSQL row and statement triggers reject any `UPDATE`, `DELETE`, or `TRUNCATE` at the database engine level, and `TRUNCATE` privileges are revoked from the application role. Pre-existing legacy actions receive no fabricated historical revisions.

### 7.3 Migration, Backfill & Safe Rollback Procedure
*   **Data Preservation:** The forward migration (`ALTER TABLE "Ticket" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "resolvedAt" TIMESTAMP(3); CREATE TABLE "ActionTaken" ...; CREATE TABLE "ActionTakenRevision" ...; CREATE TABLE "IdempotencyKey" ...;`) does not alter, drop, or rename existing columns in `RequesterUser`, `Ticket`, `Attachment`, `PublicComment`, or `InternalNote`.
*   **Backfill Strategy:**
    *   Existing tickets receive `updatedAt = createdAt`.
    *   Existing tickets already in `Resolved` or `Closed` status receive `resolvedAt = NULL`.
    *   Existing active tickets receive `resolvedAt = NULL`.
    *   Existing tickets with zero actions behave naturally with `actionsTaken = []`.
    *   Existing `ActionTaken` records initially have zero revisions in `ActionTakenRevision`. No fabricated historical revisions are generated for pre-migration actions; their first edit after migration appends their first revision.

#### 7.3.1 Database-Level Append-Only Trigger Specification (Proposed Migration Requirement)
To enforce true immutability beyond application-level route restrictions, the future database migration shall define a PostgreSQL trigger function, row-level trigger, statement-level truncate trigger, and privilege restrictions that reject any `UPDATE`, `DELETE`, or `TRUNCATE` statement executed against `"ActionTakenRevision"` while permitting `INSERT`:

```sql
CREATE OR REPLACE FUNCTION prevent_action_taken_revision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ActionTakenRevision records are append-only and cannot be updated, deleted, or truncated.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_action_taken_revision_mutation
BEFORE UPDATE OR DELETE ON "ActionTakenRevision"
FOR EACH ROW
EXECUTE FUNCTION prevent_action_taken_revision_mutation();

CREATE TRIGGER trg_prevent_action_taken_revision_truncate
BEFORE TRUNCATE ON "ActionTakenRevision"
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_action_taken_revision_mutation();

-- Revoke TRUNCATE privilege on ActionTakenRevision from the application database role
REVOKE TRUNCATE ON TABLE "ActionTakenRevision" FROM toktickit;
```

*Note on Migration Stage:* This trigger, function, and privilege specification is a **proposed migration requirement at the documentation stage** and will be implemented as part of the future database migration.

*Execution Semantics:*
*   `INSERT` operations remain fully permitted (invoked during `PATCH /api/tickets/:id/actions/:actionId` within the CAS transaction).
*   `UPDATE` operations raise an immediate SQL exception: `'ActionTakenRevision records are append-only and cannot be updated, deleted, or truncated.'`.
*   `DELETE` operations raise the same exception.
*   `TRUNCATE` operations raise the same exception via `trg_prevent_action_taken_revision_truncate` and are additionally barred by privilege revocation.

*   **Safe Backup & Recovery Procedure for Rollback:**
    *   *Important Caveat on Data Loss:* Rolling back the Lab 4 migration drops the `ActionTaken`, `ActionTakenRevision`, and `IdempotencyKey` tables and drops `Ticket.updatedAt` and `Ticket.resolvedAt`. Therefore, any newly recorded Actions Taken and Revision History in Lab 4 will be lost if a rollback is executed. Pre-Lab-4 data (Lab 1–3 records) will be preserved.
    *   *Procedure:*
        1.  *Pre-Migration Backup:* Prior to applying migrations, take a complete logical dump:
            `pg_dump -U toktickit toktickit > backup_pre_lab4.sql`
        2.  *Pre-Rollback Backup:* If rolling back after Lab 4 has been in use, dump the Lab 4 tables separately:
            `pg_dump -U toktickit -t "ActionTaken" -t "ActionTakenRevision" -t "IdempotencyKey" toktickit > backup_lab4_data.sql`
        3.  *Down Migration SQL (with Correct Trigger and Function Teardown Order):*
            ```sql
            DROP TRIGGER IF EXISTS trg_prevent_action_taken_revision_truncate ON "ActionTakenRevision";
            DROP TRIGGER IF EXISTS trg_prevent_action_taken_revision_mutation ON "ActionTakenRevision";
            DROP FUNCTION IF EXISTS prevent_action_taken_revision_mutation();
            DROP TABLE IF EXISTS "ActionTakenRevision" CASCADE;
            DROP TABLE IF EXISTS "ActionTaken" CASCADE;
            DROP TABLE IF EXISTS "IdempotencyKey" CASCADE;
            ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "resolvedAt";
            ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "updatedAt";
            ```
        4.  *Verification:* Verify that Lab 3 tables (`RequesterUser`, `Ticket`, `Attachment`, `PublicComment`, `InternalNote`, `Session`, `Category`, `RelatedSystem`) remain intact with identical pre-migration row counts.

### 7.4 Explicit Seed Fixtures Specification
The seed script ([`server/prisma/seed.ts`](../../server/prisma/seed.ts)) is updated with idempotent upserts to provide realistic fixtures across all workflow and dashboard states:
1.  **Status & Priority Coverage:** Tickets spanning all 8 statuses (`New`, `Open`, `In Progress`, `Waiting for Requester`, `Resolved`, `Closed`, `Reopened`, `Cancelled`) and all 4 priorities (`Low`, `Medium`, `High`, `Critical`).
2.  **Assignment Coverage:** Multiple assigned tickets (assigned to Staff 1 and Staff 2) and at least 2 distinct Unassigned tickets (`ownerId = null`) with active status (including unassigned `Reopened`) to populate the `Unassigned` staff dashboard card.
3.  **Actions Taken Variations:**
    *   *Zero Actions Taken:* At least one `In Progress` ticket with 0 actions (to test Resolution Gate refusal) and one `New` ticket with 0 actions.
    *   *One Action Taken:* At least one ticket with exactly 1 completed action (to test successful Resolution Gate passage).
    *   *Multiple Actions Taken:* At least one ticket with 3+ Actions Taken logged by multiple staff members (Staff 1 and Staff 2) demonstrating collaborative multi-staff work.
    *   *Follow-up Variations:* Actions with `followUpRequired = true` (with non-empty `followUpNote`) and `followUpRequired = false` (with `attachmentNotes`).
4.  **Dashboard Metric Verification:**
    *   Non-zero counts across all Requester metrics for `john@example.com` and `alice@example.com`, including tickets resolved within the last 30 days (`resolvedAt >= now() - 15 days`), older resolved tickets (`resolvedAt = now() - 45 days`), and legacy resolved tickets (`resolvedAt = null`).
    *   Non-zero counts across all Staff operational cards (including Unassigned and My Assigned) for `staff1@example.com`.
    *   A dedicated user account (`empty.req@example.com`) seeded with 0 tickets to verify zero/empty dashboard states.

---

## 8. API Contract Summary
*(Detailed request/response payloads in `api-spec.md`)*

### 8.1 Actions Taken Endpoints
*   `GET /api/tickets/:id/actions`: Fetch list of Actions Taken for a ticket in chronological order (`actionDateTime ASC, id ASC`). (Permitted: Requester for own ticket, IT Staff, Admin).
*   `POST /api/tickets/:id/actions`: Create a new Action Taken line. **Requires mandatory** `Idempotency-Key` header (<UUIDv4>) with SHA-256 fingerprinting (missing or malformed returns HTTP 400 Bad Request before any domain mutation: no ActionTaken insert, no IdempotencyKey reservation, and no Ticket timestamp refresh). Auto-sets `performedById`. Refreshes parent Ticket `updatedAt`. (Permitted: IT Staff, Admin).
*   `PATCH /api/tickets/:id/actions/:actionId`: Update an existing Action Taken line via atomic CAS. Requires `actionLastUpdatedAt`. Validates and updates editable fields (`actionDateTime`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes`). Atomically creates an append-only `ActionTakenRevision` record capturing `beforeSnapshot` and `afterSnapshot` JSON. Refreshes parent Ticket `updatedAt`. (Permitted: IT Staff, Admin).
*   `GET /api/tickets/:id/actions/:actionId/revisions`: Fetch append-only revision history for a specific Action Taken in chronological order (`editedAt ASC, id ASC`). Returns list of revisions with editor user info, timestamps, and before/after snapshots. Read-only. (Permitted: IT Staff, Admin; Requester receives `403 Forbidden` for own ticket, `404 Not Found` for unowned ticket).

### 8.2 Operational Dashboard Endpoints
*   `GET /api/dashboard/requester`: Returns `{ metrics: { openTickets, waitingForRequester, inProgress, resolved, closed }, recentlyUpdatedTickets: [...], recentlyResolvedTickets: [...] }`. All resolved calculations apply 30-day boundary via `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - 30 days`. (Permitted: Requester only).
*   `GET /api/dashboard/staff`: Returns `{ metrics: { unassigned, myAssigned, new, open, inProgress, waitingForRequester }, priorityBreakdown: { critical, high, medium, low }, recentTickets: [...] }`. Active triage metrics strictly exclude Resolved, Closed, and Cancelled, and include Reopened. (Permitted: IT Staff, Admin).
*   `GET /api/dashboard/admin`: Returns Staff metrics augmented with `{ userStats: { totalUsers, activeRequesters, activeStaff, activeAdmins, inactiveUsers } }`. (Permitted: Admin only).

### 8.3 Ticket Status & Workflow Endpoints
*   `PATCH /api/staff/tickets/:id/status`: Updates Ticket status and/or IT Priority via atomic CAS (`UPDATE ... WHERE id = :id AND updatedAt = :lastUpdatedAt`). Requires `lastUpdatedAt`. Enforces exact source-target owner validation (owner required only for `New -> Open`, `Open -> In Progress`, and `Reopened -> In Progress`; other transitions succeed with `ownerId = null`). Populates `resolvedAt = NOW()` on `Resolved`, clears `resolvedAt = null` on `Reopened` (outgoing transitions retain already-null `resolvedAt`). Enforces 13-row transition matrix and Resolution Gate (`actionCount >= 1` mandatory; resolution comment strictly optional, creating PublicComment only if non-empty). (Permitted: IT Staff only; Administrators receive `403 Forbidden` per preserved Lab 3 baseline).
*   `POST /api/tickets/:id/comments`: Supports optional `Idempotency-Key` header. Posting comment on `Waiting for Requester` ticket auto-transitions to `Open`. Posting comment on `Resolved` or `Closed` ticket auto-transitions to `Reopened` (resets `resolvedAt = null`). (Permitted: Requester for own tickets, IT Staff; Administrators receive `403 Forbidden`).
*   `POST /api/tickets/:id/appears-resolved`: Advisory feedback from Requester. Supports optional `Idempotency-Key` header. Appends Public Comment. Permitted exclusively when status is `In Progress`. Does NOT change Ticket status. (Permitted: Requester only).

---

## 9. Acceptance Criteria

*   **AC-01 [Action Taken Creation & Mandatory Idempotency]:** Given an authenticated IT Staff user (or Administrator) and valid action data, when `POST /api/tickets/:id/actions` is called with a valid `Idempotency-Key` header, the Action Taken is persisted with the authenticated user automatically recorded as `performedById`, and parent Ticket `updatedAt` is refreshed. If `Idempotency-Key` is missing or malformed, the backend rejects the request with HTTP 400 Bad Request before any domain mutation (no ActionTaken insert, no IdempotencyKey reservation, and no Ticket timestamp refresh).
*   **AC-02 [Action Taken - Follow-up Validation]:** Given an Action Taken creation or update request with `followUpRequired = true` and an empty `followUpNote`, the backend rejects the request with HTTP 400 Bad Request. When `followUpRequired = false`, `followUpNote` must be null.
*   **AC-03 [Action Taken - Multi-Staff Collaboration]:** Given a Ticket assigned to Staff A, when Staff B logs an Action Taken on that Ticket, the action is successfully saved with Staff B as `performedById` and the Ticket's `ownerId` remains Staff A.
*   **AC-04 [Action Taken - Requester Forbidden from Mutation]:** Given an authenticated Requester, when attempting to create or update an Action Taken, the backend rejects the request with HTTP 403 Forbidden.
*   **AC-05 [Action Taken - Requester Read Ownership & Ordering]:** Given an authenticated Requester, when fetching Actions Taken on a Ticket they own, the list is returned in chronological order (HTTP 200). When attempting to fetch Actions Taken on a Ticket owned by another Requester, the backend returns HTTP 404 Not Found (non-enumeration).
*   **AC-06 [Action Taken - Full Update Support via CAS]:** Given an authorized IT Staff member and an existing Action Taken, when updating `actionDateTime`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, or `attachmentNotes` with matching `actionLastUpdatedAt`, the action is conditionally updated (HTTP 200), the immutable original `performedById` is preserved, an append-only revision record is inserted, and parent Ticket `updatedAt` is refreshed.
*   **AC-06b [Action Taken - Append-Only Revision History]:** Given an authorized IT Staff member or Administrator updating an Action Taken line via CAS, an `ActionTakenRevision` record is atomically created in the same transaction capturing the exact `beforeSnapshot` and `afterSnapshot` JSON of all 6 editable fields, the editor's `editedById`, and server-generated `editedAt`. Historical revisions can be fetched via `GET /api/tickets/:id/actions/:actionId/revisions` (ordered `editedAt ASC, id ASC`). Requesters receive HTTP 403 Forbidden on own tickets (HTTP 404 on unowned). Revisions are append-only, immutable, and protected by `onDelete: Restrict`.
*   **AC-07 [Resolution Gate Enforcement - Zero Actions]:** Given a Ticket in `In Progress` with zero Actions Taken, when IT Staff attempts to transition the status to `Resolved`, the backend rejects the change with HTTP 400 Bad Request (`"At least one action taken must be recorded before resolving the ticket."`).
*   **AC-08 [Resolution Gate Success & Optional Resolution Comment]:** Given a Ticket in `In Progress` with at least one Action Taken (`actionCount >= 1`), when IT Staff submits a transition to `Resolved` with valid `lastUpdatedAt`, the Ticket status transitions to `Resolved` and `resolvedAt` is set to current timestamp. If a non-empty resolution comment is provided, a Public Comment is created atomically. If the resolution comment is empty or omitted, the transition succeeds without creating an empty comment and without blocking resolution.
*   **AC-09 [Comment-Driven Auto-Transition - Waiting for Requester]:** Given a Ticket in `Waiting for Requester`, when the owning Requester posts a Public Comment, the Ticket status automatically transitions to `Open` atomically.
*   **AC-10 [Comment-Driven Auto-Transition - Resolved/Closed]:** Given a Ticket in `Resolved` or `Closed`, when the owning Requester posts a Public Comment, the Ticket status automatically transitions to `Reopened` and `resolvedAt` is cleared to `null` atomically.
*   **AC-11 [Advisory Appears Resolved]:** Given a Ticket in `In Progress`, when the owning Requester triggers "Appears Resolved", a standardized Public Comment is created, and the Ticket status remains `In Progress`.
*   **AC-12 [Advisory Appears Resolved - Invalid Status]:** Given a Ticket with status other than `In Progress`, when a Requester triggers "Appears Resolved", the request is rejected with HTTP 400 Bad Request.
*   **AC-13 [Atomic CAS Concurrency - Ticket Status Collision]:** Given a Ticket modified by another session, when a client submits a status transition where the conditional update affects 0 rows due to an outdated `lastUpdatedAt` timestamp, the backend rejects the request with HTTP 409 Conflict.
*   **AC-14 [Atomic CAS Concurrency - Action Taken Collision]:** Given an Action Taken modified by another session, when a client submits an edit where the conditional update affects 0 rows due to an outdated `actionLastUpdatedAt`, the backend rejects the request with HTTP 409 Conflict.
*   **AC-15 [Optimistic Concurrency - Missing Tokens]:** Given a Ticket status or Action Taken update request where `lastUpdatedAt` or `actionLastUpdatedAt` is omitted, the backend rejects the request with HTTP 400 Bad Request.
*   **AC-16 [Idempotency Policy & Concurrent Replay]:** `Idempotency-Key` header (<UUIDv4>) is **mandatory** on `POST /api/tickets/:id/actions` (missing or malformed returns HTTP 400 Bad Request before any domain mutation: no ActionTaken insert, no IdempotencyKey reservation, and no Ticket timestamp refresh). It is **optional** on `POST /api/tickets/:id/comments` and `POST /api/tickets/:id/appears-resolved`. Given a mutation request re-sent with an identical `Idempotency-Key` and matching SHA-256 payload fingerprint (whether sequential or arriving concurrently and unblocking via Two-Phase in-transaction reservation), the backend safely replays the previously created record with HTTP 200/201 and header `Idempotency-Replayed: true` without failing Ticket CAS. Reusing the same key with a different payload returns HTTP 409 Conflict. Separate legitimate submissions with distinct keys both persist.
*   **AC-17 [Requester Dashboard - Data Isolation & Waiting Metric]:** Given an authenticated Requester, `GET /api/dashboard/requester` returns metrics (including My Open Tickets, Waiting for Requester, In Progress, Resolved within 30 days, Closed) and recent lists belonging strictly to that Requester.
*   **AC-18 [Requester Dashboard - 30-Day Boundary via `resolvedAt` & Legacy Policy]:** The Recently Resolved metric and list include only tickets where `status == 'Resolved'` and `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - 30 days`, sorted strictly by `resolvedAt DESC`. Subsequent edits to Actions Taken (which refresh `updatedAt`) do not alter `resolvedAt`. Legacy tickets with `resolvedAt = NULL` are excluded.
*   **AC-19 [Requester Dashboard - Open Tickets Drill-Down]:** Clicking the "My Open Tickets" metric card navigates to `/tickets?view=open`, which displays active open tickets and strictly excludes Closed and Cancelled tickets.
*   **AC-20 [IT Staff Dashboard - Operational Metrics & Reopened Work]:** Given an authenticated IT Staff member, `GET /api/dashboard/staff` returns accurate counts for Unassigned, My Assigned, New, Open, In Progress, and Waiting for Requester. Active triage metrics include Reopened tickets and strictly exclude Resolved, Closed, and Cancelled tickets.
*   **AC-21 [IT Staff Dashboard - Zero/Empty State]:** When a staff member has zero assigned tickets or the queue is empty, dashboard endpoints return 0 for all metrics and empty lists `[]`, rendering cleanly in the UI.
*   **AC-22 [Administrator Dashboard - User Statistics]:** Given an authenticated Administrator, `GET /api/dashboard/admin` returns IT Staff operational metrics plus exact account counts for all five user metrics: Total Users, Active Requesters, Active Staff, Active Admins, and Inactive Accounts.
*   **AC-23 [Dashboard UI States]:** Both dashboards render distinct UI presentations for Loading (skeletons), Empty (zero counts), Forbidden (access denied), and Safe Failure (error alert with retry button).
*   **AC-24 [Data Retention & Legacy Ticket Preservation]:** Existing Lab 1–3 data remains intact after migration. `ActionTaken` and `ActionTakenRevision` reference `Ticket` and `ActionTaken` with `onDelete: Restrict`, protecting audit logs and revision trails from cascade deletion. Existing legacy tickets receive `resolvedAt = NULL`.
*   **AC-25 [Responsive & Accessible UI]:** Dashboards and Actions Taken UI render without horizontal clipping, blanket `overflow-x: hidden`, keyboard traps, or missing labels across Desktop (1200px), Tablet (800px), and Mobile (400px) viewports, supporting Tab, Enter, Space, and Escape keyboard navigation.

---

## 10. Product Definition of Done (DoD)
1.  **Specification & Contract Complete:** `specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md` are reviewed, consistent, and checked into version control.
2.  **Database Migration & Seed:** Prisma migration cleanly applies the `ActionTaken` model (with `onDelete: Restrict`), `ActionTakenRevision` model (with `onDelete: Restrict`), `IdempotencyKey` model, `Ticket.updatedAt`, and `Ticket.resolvedAt` without altering or losing existing Lab 1–3 data. Seed script is idempotent and provides comprehensive test scenarios.
3.  **Actions Taken Implemented:** Full backend CRUD (with automated actor, CAS conditional updates, deterministic ordering, parent `updatedAt` refresh, and append-only revision history recording) and frontend UI (list, create, edit, requester read-only, and revision history modal) fully operational.
4.  **Workflow & Resolution Gate Enforced:** Complete 13-row transition matrix enforced server-side. Exact source-target owner validation active (owner required only for `New -> Open`, `Open -> In Progress`, and `Reopened -> In Progress`; other transitions permit `ownerId = null`). Outgoing transitions from `Reopened` to `In Progress`, `Open`, and `Waiting for Requester` operational (retaining already-null `resolvedAt` value). Resolution Gate enforces mandatory `actionCount >= 1` (resolution comment is strictly optional, creating PublicComment only if non-empty). Populates `resolvedAt = NOW()` on `Resolved`, clears `resolvedAt = null` on `Reopened`. Comment-driven auto-transitions operational. "Appears Resolved" remains strictly advisory.
5.  **Atomic CAS Concurrency & Idempotency Active:** Stale update attempts to Ticket status or Action Taken return HTTP 409 Conflict via atomic conditional update row count verification. Missing tokens return HTTP 400. Mandatory `Idempotency-Key` enforced on `POST /api/tickets/:id/actions` (missing or malformed returns HTTP 400 Bad Request before any domain mutation: no ActionTaken insert, no IdempotencyKey reservation, and no Ticket timestamp refresh). Optional `Idempotency-Key` supported on `/comments` and `/appears-resolved`. All endpoints safely replay responses with SHA-256 payload verification.
6.  **Role Dashboards Functional:** Authoritative backend calculation for Requester, IT Staff, and Administrator dashboards, with accurate metrics (including Unassigned, Waiting for Requester, and `resolvedAt` 30-day boundary), recent ticket lists, working drill-down navigation, and 4 UI states.
7.  **Zen Green UI & Accessibility:** Application shell, dashboards, Actions Taken UI, and Revision History modal adhere to Zen Green styling, pass responsive checks on 3 viewports without blanket `overflow-x: hidden`, and have zero horizontal overflow and full keyboard accessibility.
8.  **Automated Test Suite Passing:** All 106 planned backend unit/integration tests, frontend component tests, and Playwright E2E tests pass reliably.
9.  **Complete Regression Verified:** All Lab 1–3 capabilities (Auth, RBAC, Queue, Attachments, Comments, Notes, User Admin) pass regression testing.

---

## 11. Assumptions and Decisions
*   **Decision - Complete Outgoing Transitions from Reopened:** Reopened tickets return to active service via `Reopened` -> `In Progress` (staff resumes work), `Reopened` -> `Open` (reset to queue), or `Reopened` -> `Waiting for Requester` (more info needed). Direct re-closing without work is prohibited.
*   **Decision - Exact Source-Target Owner Validation:** Owner (`ownerId != null`) is strictly required only on transitions introducing an active working commitment: `New -> Open`, `Open -> In Progress`, and `Reopened -> In Progress`. Other transitions (`Waiting for Requester -> Open`, `Waiting for Requester -> In Progress`, `Reopened -> Open`, `Reopened -> Waiting for Requester`) succeed with `ownerId = null` to allow triaging and queuing unassigned tickets. The validation error explicitly identifies the transition: `"Ticket must be assigned to an owner before transitioning from '{source}' to '{target}'."`
*   **Decision - Resolution Gate Action Count as Sole Mandatory Condition:** Handout Section 8.3 requires Actions Taken to prove technical work completed. The resolution comment is strictly optional: if provided and non-empty, a `PublicComment` is created atomically; if blank or omitted, the status change to `Resolved` succeeds without creating empty comment rows or blocking IT Staff.
*   **Decision - Append-Only Action Taken Revision History:** Originating from the repository owner's approved peer-review decision (not required by Handout Section 4.3), updates to Action Taken records append an immutable `ActionTakenRevision` containing `beforeSnapshot` and `afterSnapshot` JSON, editor ID, and server timestamp within the CAS transaction to satisfy technical work auditing and accountability requirements without violating data integrity. Revisions cannot be updated, deleted, or truncated (`onDelete: Restrict`). Requesters are denied access (403 on own ticket, 404 on unowned ticket) to prevent exposure of internal edit trails. Pre-migration actions begin with zero revisions (no fabricated historical records).
*   **Decision - Mandatory Idempotency-Key for Action Taken Creation:** Unlike comments and advisory signals which have natural user text variations, Action Taken creation represents formal work logging prone to accidental double-submission during form submission. `Idempotency-Key: <UUIDv4>` is mandatory on `POST /api/tickets/:id/actions` (returning HTTP 400 if omitted or malformed) to guarantee deduplication before any domain mutation (no ActionTaken insert, no IdempotencyKey reservation, and no parent Ticket timestamp refresh) occurs. Header remains optional on `/comments` and `/appears-resolved`. Actions Taken serve strictly for technical work auditability, troubleshooting history, and staff accountability—not for billing, timesheet logging, or labor-cost accounting.
*   **Decision - Legacy Resolution Timestamp Policy:** Because reliable historical resolution dates do not exist for legacy Lab 1–3 tickets, they are backfilled with `resolvedAt = NULL` rather than fabricating timestamps from `createdAt`. Queries for 30-day recent resolutions require `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - 30 days`, cleanly excluding unverified legacy records.
*   **Decision - Dedicated `IdempotencyKey` Table:** Scoped compound uniqueness `[route, ticketId, userId, key]` and SHA-256 payload fingerprinting cleanly protect `/actions`, `/comments`, and `/appears-resolved` without corrupting business entities.
*   **Decision - Atomic CAS Conditional Updates:** Concurrency control is implemented via database-level conditional mutations (`UPDATE ... WHERE id = :id AND updatedAt = :lastUpdatedAt`), checking affected row counts rather than relying on application-level read-then-write transactions.
*   **Decision - Action Taken Timeline Ordering:** Actions Taken are retrieved and rendered in chronological order (`actionDateTime ASC, id ASC`) so users read work history chronologically.
*   **Decision - Staff Dashboard Quick Actions:** `+ Create Ticket` is removed from the Staff Dashboard because TokTickIT RBAC explicitly denies ticket creation to IT Staff and Administrators.
*   **Decision - Conservative Administrator RBAC Baseline:** Handout Section 4.3 Table is titled specifically *"Action Taken Roles and Responsibilities"*, and its Administrator row (*"Perform IT Staff behavior and retain administrative access needed for support and testing"*) is interpreted strictly within Actions Taken scope. Administrator is authorized to create and edit Actions Taken. Under the regression mandate (Page 1 Section 1, Page 7 Section 8.5), Administrator remains denied from updating Ticket status (403), posting Public Comments (403), and posting direct Internal Notes (403). While an explicit future instructor clarification may expand Administrator permissions across other endpoints, the contract unambiguously enforces this conservative baseline.
