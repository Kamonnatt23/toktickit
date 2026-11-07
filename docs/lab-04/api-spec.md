# Lab 4 API Specification

## 1. Overview & Architectural Principles
The Lab 4 API increments the TokTickIT service desk with granular work tracking via **Actions Taken**, authoritative operational **Dashboards**, an **Authoritative Resolution Gate**, **Database-Level Atomic Compare-And-Swap (CAS) Concurrency**, a dedicated **`resolvedAt` Timestamp**, and a persistent **Idempotency-Key Architecture**.

Key architectural rules:
*   **Stateful Session Authentication:** All endpoints (except public health and catalog endpoints) require an authenticated session cookie (`sessionId`).
*   **Automated Performer Binding:** When logging Actions Taken, the actor (`performedById`) is inferred directly and immutably from the authenticated session context (`req.user.id`). Manual override or editing of the performer is prohibited.
*   **Authoritative Server Calculation:** Dashboard endpoints perform database aggregations server-side and return concise metric objects. Clients never fetch entire ticket collections to compute summary counts.
*   **Timezone & Date Standard:** All timestamps (`createdAt`, `updatedAt`, `resolvedAt`, `actionDateTime`) are stored in PostgreSQL as UTC and serialized over REST as ISO 8601 strings (e.g. `2026-11-01T08:30:00.000Z`). Clients are responsible for formatting into local user timezones.
*   **Dedicated Resolution Timestamp (`resolvedAt`) & Legacy Policy:** Ticket resolution age and 30-day dashboard boundaries are evaluated strictly against `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - 30 days`, isolating resolution history from subsequent `updatedAt` refreshes. Historical legacy tickets receive `resolvedAt = NULL` and are excluded from 30-day windows.
*   **Non-Enumeration Protection:** If a Requester attempts to access Actions Taken, Tickets, or Attachments belonging to another Requester, the server returns `404 Not Found`.
*   **Atomic Concurrency Control (CAS & State-Conditional Updates):** A database transaction alone is not sufficient concurrency control under `READ COMMITTED` isolation. Mutation endpoints enforce atomic conditional updates directly in the database:
    *   *Timestamp CAS Mutations:* `PATCH /api/staff/tickets/:id/status` and `PATCH /api/tickets/:id/actions/:actionId` require timestamp tokens (`lastUpdatedAt`, `actionLastUpdatedAt`) and execute `UPDATE ... WHERE id = :id AND updatedAt = :token`. If 0 rows are affected, the API checks existence and ownership to distinguish missing or inaccessible resources (`404 Not Found`) from concurrent collisions (`409 Conflict`).
    *   *Comment & Advisory State-Conditional Mutations:* `POST /api/tickets/:id/comments` and `POST /api/tickets/:id/appears-resolved` require the Ticket's expected `lastUpdatedAt` token in the payload and execute atomic conditional updates matching both the expected status and timestamp (`UPDATE "Ticket" ... WHERE id = :ticketId AND status = :expectedStatus AND updatedAt = :lastUpdatedAt`) within the transaction. This prevents concurrent Staff status updates, concurrent non-status updates (such as owner or priority changes), and ABA status changes from being silently overwritten. If 0 rows are affected, the API checks existence and ownership to distinguish missing resources (`404 Not Found`) from concurrent collisions (`409 Conflict`), rolling back the entire transaction.
*   **True Append-Only Revision History & Database-Level Immutability:** Originating from the repository owner's approved peer-review decision (not required by Handout Section 4.3), `ActionTakenRevision` records are strictly immutable. Beyond having no operational edit or delete endpoints, PostgreSQL triggers (`trg_prevent_action_taken_revision_mutation`, `trg_prevent_action_taken_revision_truncate`) and role privilege revocations reject any `UPDATE`, `DELETE`, or `TRUNCATE` at the database engine level (proposed migration requirement at documentation stage).
*   **Dedicated Idempotency-Key Architecture & CAS Interaction:** In-scope POST endpoints (`/actions`, `/comments`, `/appears-resolved`) support `Idempotency-Key: <UUIDv4>`. The header is **mandatory** on `POST /api/tickets/:id/actions` (missing or malformed returns HTTP 400 Bad Request before any domain mutation: no ActionTaken insert, no IdempotencyKey reservation, and no Ticket timestamp refresh). It remains **optional** on `POST /api/tickets/:id/comments` and `POST /api/tickets/:id/appears-resolved` (clients are encouraged to supply it; if omitted, requests execute normally without deduplication).
    *   *Scope & Hashing:* Scoped strictly to compound key `[route, ticketId, userId, key]`, storing a SHA-256 fingerprint of the canonical request payload.
    *   *Concurrency Race & False 409 Prevention:* Under PostgreSQL default Read Committed isolation, if two concurrent identical requests arrive with the same `Idempotency-Key` and expected `lastUpdatedAt`, both pass the pre-transaction lookup before either commits. If the transaction were to evaluate Ticket CAS before inserting into `IdempotencyKey`, Request 1's Ticket CAS would update `Ticket.updatedAt`. When Request 2's transaction unblocks and evaluates Ticket CAS, the conditional update condition matches 0 rows because `updatedAt` changed. Request 2 would throw a false `409 Conflict` and abort *before* reaching `IdempotencyKey`. Request 2 would never receive a `P2002` error, thereby failing to replay Request 1's response.
    *   *Two-Phase In-Transaction Reservation Pattern:* To guarantee reliable replay without CAS false 409s across all endpoints combining idempotency and Ticket updates:
        1.  **Phase 1 (In-Transaction Reservation Claim):** The reservation must be claimed before any state-changing domain operation or CAS update. Read-only existence and ownership checks may occur before reservation creation. If `idempotencyKey` is present (mandatory on `/actions`, optional on `/comments` and `/appears-resolved`), the transaction claims the slot:
            `tx.idempotencyKey.create({ data: { key, route, ticketId, userId, requestHash, statusCode: null, responseBody: null, expiresAt } })`
            Under PostgreSQL, this acquires an exclusive tuple lock on the compound unique index `[route, ticketId, userId, key]`. If Request 2 arrives concurrently with the same compound key, Request 2's `tx.idempotencyKey.create` immediately **blocks** at the database level on this unique index tuple lock *before* evaluating Ticket CAS or performing any domain mutations. Request 2 does not evaluate Ticket CAS while Request 1 is executing.
        2.  **Phase 2 (CAS & Domain Execution):** Request 1 executes the Ticket CAS and domain logic (creating ActionTaken or PublicComment and refreshing `Ticket.updatedAt`). Upon success, Request 1 finalizes the reservation:
            `tx.idempotencyKey.update({ where: { id: reservation.id }, data: { statusCode: 201, responseBody: JSON.stringify(result) } })`
            Request 1 commits its transaction.
        3.  **Outcome A (Commit Replay, Exact Constraint Targeting & Reservation Invariant):** When Request 1 commits, Request 2 unblocks at Phase 1. Because Request 1 committed the unique index entry, Request 2's `tx.idempotencyKey.create` immediately throws unique constraint violation `P2002` (SQLSTATE `23505`).
            *   *Prisma Metadata Shape & Exact Matching:* In `server/package.json`, `@prisma/client` is declared as `"^5.22.0"`, and `server/package-lock.json` locks the installed version to `"5.22.0"`. In Prisma Client 5.22.0 on PostgreSQL, `err.meta?.target` for mapped compound unique constraints is represented as an array of field names: `['route', 'ticketId', 'userId', 'key']`. The catch handler strictly matches against this exact 4-element field array. Substring fallback matching (`includes(...)`) is prohibited and removed. Exact physical database constraint name matching is marked as pending runtime verification upon Prisma migration creation. Unrelated `P2002` errors (such as `User_email_key`) evaluate to false, are never swallowed, and are immediately re-thrown.
            *   *Reservation Finalization Invariant:* Because reservation insertion (Phase 1) and finalization with response data (Phase 2) occur within the same atomic database transaction, other concurrent transactions under PostgreSQL `READ COMMITTED` cannot observe an uncommitted Phase 1 reservation. When Request 2 receives `P2002`, Request 1 has already committed. Therefore, a committed reservation MUST already have non-null `statusCode` and non-null `responseBody`. If Request 1 rolled back, the reservation was discarded atomically, and Request 2 would have proceeded without `P2002`. A committed record with `null` `statusCode` or `responseBody` is an invariant violation (abnormal system state), NOT a normal in-progress concurrency state; the server logs an error and returns HTTP 500 rather than polling. Upon retrieving the committed, finalized record, Request 2 verifies payload fingerprint: if `requestHash` matches, it safely replays with `Idempotency-Replayed: true` and the original HTTP status code; if `requestHash` differs, it returns `409 Conflict`. Request 2 aborts without ever executing Ticket CAS, completely avoiding false 409s.
        4.  **Outcome B (Rollback Handling & Atomic Cleanliness):** If Request 1 rolls back (e.g. due to domain validation failure or database exception), PostgreSQL transaction rollback cleanly removes both the reservation row and all associated domain mutations atomically. Request 2 unblocks at Phase 1; because Request 1 rolled back, Request 2 does not receive `P2002`. Request 2's reservation succeeds, and Request 2 proceeds to evaluate CAS and execute normally.
        5.  **Outcome C (Non-Idempotent / Distinct Updates):** If Request 2 has a different key or no key, it does not block on `IdempotencyKey`. It proceeds directly to Ticket CAS, where the `updatedAt` mismatch causes 0 rows affected $\rightarrow$ genuine `409 Conflict`. CAS protection against true concurrent modifications remains fully intact.
    *   *Expired-Key Handling:* Keys expire after 24 hours (`expiresAt <= NOW()`). Before inserting a new record, the server prunes any expired scoped record (`DELETE WHERE id = :existingId`), ensuring the database unique constraint does not block legitimate key reuse after 24 hours.
*   **Atomic Transaction Boundaries:** State updates and side effects (status transition + comment/note creation + parent `updatedAt` refresh + idempotency reservation and finalization) must execute within a single atomic database transaction (`prisma.$transaction`). Any failed condition rolls back the entire operation, leaving no orphan records.
*   **Safe Error Feedback:** Server-side failures return safe, generic error objects (`{ error: "Internal server error" }`) without leaking stack traces or database schema details.

### 1.1 Shared Strict ISO Timestamp Parser & Validation Conventions
All API mutation endpoints handling client-supplied timestamps enforce a single shared, strict ISO 8601 timestamp parser. JavaScript's native `Date.parse()` alone is insufficient because it permits non-standard date formats (e.g., month names, two-digit years, omitted time components).

*   **Accepted Format:** `YYYY-MM-DDTHH:mm:ss[.S|.SS|.SSS](Z|±HH:mm)`
*   **Accepted Syntax Rules:**
    *   Uppercase `T` separating calendar date and wall-clock time.
    *   Four-digit year from `0001` through `9999`.
    *   Mandatory seconds (`:ss`).
    *   Optional fractional seconds of 1 to 3 digits (`.S`, `.SS`, `.SSS`).
    *   Mandatory timezone designator: uppercase `Z` (for UTC) or explicit timezone offset `±HH:mm` (e.g., `+07:00`, `-05:00`).
*   **Valid Input Examples:**
    *   `2026-11-02T08:30:00Z`
    *   `2026-11-02T08:30:00.000Z`
    *   `2026-11-02T15:30:00+07:00`
    *   `2026-11-02T01:30:00-07:00`
*   **Validation Steps:**
    1. The input value must be of type string.
    2. The string must match the strict ISO regex.
    3. Year (`1..9999`), month (`1..12`), day (`1..31`), hour (`0..23`), minute (`0..59`), second (`0..59`), and timezone offset hours (`0..23`) and minutes (`0..59`) must be within valid mathematical ranges.
    4. The calendar date must be physically real, including strict leap-year calculation for February (29 days on leap years, 28 days otherwise). Invalid calendar dates (such as `2026-02-30T08:30:00Z` or `2026-04-31T12:00:00Z`) are strictly rejected with HTTP `400 Bad Request` rather than being coerced or normalized into subsequent dates.
    5. `Date.parse(value)` must yield a finite integer timestamp.
    6. When valid, the parsed value is instantiated as a JavaScript `Date` representing the exact UTC instant. Offsets are mathematically applied to represent the precise epoch millisecond point in time.
*   **Shared Implementation Pattern:**
    ```typescript
    const parseStrictIsoTimestamp = (value: unknown): Date | null => {
      if (typeof value !== 'string') {
        return null;
      }

      const match =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);

      if (!match) {
        return null;
      }

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = Number(match[6]);
      const timezone = match[7];

      if (
        year < 1 ||
        year > 9999 ||
        month < 1 ||
        month > 12 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59 ||
        second < 0 ||
        second > 59
      ) {
        return null;
      }

      const isLeapYear =
        year % 4 === 0 &&
        (year % 100 !== 0 || year % 400 === 0);

      const daysPerMonth = [
        31,
        isLeapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31
      ];

      if (day < 1 || day > daysPerMonth[month - 1]) {
        return null;
      }

      if (timezone !== 'Z') {
        const offset = /^([+-])(\d{2}):(\d{2})$/.exec(timezone);

        if (
          !offset ||
          Number(offset[2]) > 23 ||
          Number(offset[3]) > 59
        ) {
          return null;
        }
      }

      const milliseconds = Date.parse(value);

      if (!Number.isFinite(milliseconds)) {
        return null;
      }

      return new Date(milliseconds);
    };
    ```
*   **Universal Endpoint Scope:** This parser is the authoritative timestamp validator across:
    *   `actionDateTime` in `POST /api/tickets/:id/actions` (optional; defaults to current time if omitted; cannot be in the future).
    *   `actionDateTime` in `PATCH /api/tickets/:id/actions/:actionId` (optional; cannot be in the future).
    *   `actionLastUpdatedAt` in `PATCH /api/tickets/:id/actions/:actionId` (mandatory CAS token).
    *   `lastUpdatedAt` in `PATCH /api/staff/tickets/:id/status` (mandatory CAS token).
    *   `lastUpdatedAt` in `POST /api/tickets/:id/comments` (mandatory CAS token).
    *   `lastUpdatedAt` in `POST /api/tickets/:id/appears-resolved` (mandatory CAS token).

---

## 2. Actions Taken Endpoints

### 2.1 GET `/api/tickets/:id/actions`
*   **Purpose:** Retrieve the ordered timeline of Actions Taken for a specific ticket.
*   **Authentication:** Required.
*   **Permitted Roles:**
    *   `Requester`: Allowed only if the ticket belongs to the requester (`ticket.requesterId === req.user.id`). Otherwise returns `404 Not Found`.
    *   `IT Staff`: Allowed for all tickets.
    *   `Administrator`: Allowed for all tickets.
*   **Parameters:** `id` (integer in path).
*   **Ordering:** Strictly deterministic chronological order: `ORDER BY actionDateTime ASC, id ASC`.
*   **Response Shape (200 OK):**
    ```json
    [
      {
        "id": 101,
        "ticketId": 12,
        "actionDateTime": "2026-11-01T08:30:00.000Z",
        "actionDescription": "Checked switch port configuration and re-terminated cable.",
        "result": "Link light restored; packet loss dropped to 0%.",
        "performedById": 6,
        "performedBy": {
          "id": 6,
          "name": "Staff One",
          "email": "staff1@example.com",
          "role": "IT Staff"
        },
        "followUpRequired": true,
        "followUpNote": "Monitor error rates over the next 24 hours.",
        "attachmentNotes": "See ping_results.png in ticket attachments.",
        "createdAt": "2026-11-01T08:32:00.000Z",
        "updatedAt": "2026-11-01T08:32:00.000Z"
      }
    ]
    ```
*   **Errors:**
    *   `400 Bad Request`: Invalid ticket ID format.
    *   `401 Unauthorized`: Missing or invalid session.
    *   `404 Not Found`: Ticket not found, OR requested by a Requester who does not own the ticket (non-enumeration).

### 2.2 POST `/api/tickets/:id/actions`
*   **Purpose:** Record a new technical action taken on a ticket.
*   **Authentication:** Required.
*   **Permitted Roles:** `IT Staff`, `Administrator`. (Requesters denied with `403 Forbidden`).
*   **Request Headers:**
    *   `Content-Type: application/json`
    *   `Idempotency-Key`: UUIDv4 string (**mandatory**; missing or malformed header returns HTTP 400 Bad Request before any domain mutation: no ActionTaken insert, no IdempotencyKey reservation, and no Ticket timestamp refresh).
*   **Request Shape:**
    ```json
    {
      "actionDateTime": "2026-11-01T09:00:00.000Z",
      "actionDescription": "Updated firmware on Cisco SG350 switch to version 2.5.9.15.",
      "result": "Firmware update completed successfully. Switch rebooted in 3 minutes.",
      "followUpRequired": false,
      "followUpNote": null,
      "attachmentNotes": "firmware_upgrade_log.txt"
    }
    ```
*   **Validation Rules:**
    *   `actionDescription`: String, required. Must contain 1–2000 non-whitespace characters after trimming. Supplying empty string, whitespace-only, non-string, or text exceeding 2000 characters returns `400 Bad Request`.
    *   `result`: String, required. Must contain 1–2000 non-whitespace characters after trimming. Supplying empty string, whitespace-only, non-string, or text exceeding 2000 characters returns `400 Bad Request`.
    *   `actionDateTime`: ISO 8601 string, optional. If omitted, defaults to the server's current timestamp (`new Date()`). If supplied, it must pass `parseStrictIsoTimestamp` and cannot be in the future. Supplying an invalid format, unparseable timestamp, or future date returns `400 Bad Request`.
    *   `followUpRequired`: Boolean, required. Must be an actual boolean primitive (`typeof followUpRequired === 'boolean'`). Supplying non-boolean types (strings, numbers, objects) or omitting returns `400 Bad Request` (no `Boolean(...)` coercion permitted).
    *   `followUpNote`: Conditionally validated based on `followUpRequired`:
        *   When `followUpRequired === true`: String, mandatory. Must contain 1–2000 non-whitespace characters after trimming. Supplying missing, null, empty whitespace, non-string, or text exceeding 2000 characters returns `400 Bad Request`.
        *   When `followUpRequired === false`: Must be `null` according to the documented contract. Supplying a non-null string, empty string, or non-null value returns `400 Bad Request`.
    *   `attachmentNotes`: String, optional. May be omitted, null, or a string. If string, it is trimmed and blank/whitespace-only values are normalized to `null`. If trimmed length exceeds 500 characters, returns `400 Bad Request`.
    *   `performedById`: Server-managed and strictly immutable. Extracted automatically from `req.user.id`. Any value sent in the body is stripped and ignored by the server, and excluded from canonicalization and request hashing.
    *   *Validation Precedence:* All request validations execute **strictly before** any `IdempotencyKey` pre-lookup, expired-key cleanup, reservation creation, or domain mutation. Invalid input is rejected with HTTP `400 Bad Request` with no state modification.
*   **Idempotency & Replay Handling:**
    *   `Idempotency-Key` is **mandatory**.
        *   Verify header presence: if missing, return `400 Bad Request` (`{ error: "Idempotency-Key header is required. Must be UUIDv4." }`).
        *   Verify header format is valid UUIDv4 (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`). If invalid, return `400 Bad Request` (`{ error: "Invalid Idempotency-Key header format. Must be UUIDv4." }`).
        *   Validation occurs strictly before any domain mutation (no ActionTaken insert, no IdempotencyKey reservation, and no parent Ticket timestamp refresh).
        *   Canonicalize payload: strip ignored fields (`performedById`), trim string fields (`actionDescription`, `result`, `followUpNote`, `attachmentNotes`), normalize timestamps, and recursively sort object keys alphabetically.
        *   Compute `requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalize(req.body))).digest('hex')`.
        *   Pre-lookup `IdempotencyKey` where `[route: "POST /api/tickets/:id/actions", ticketId, userId, key]`:
            *   If found:
                *   If `existing.expiresAt > new Date()`:
                    *   If `existing.requestHash === requestHash`: return stored response with HTTP stored status (201) and header `Idempotency-Replayed: true`.
                    *   If `existing.requestHash !== requestHash`: return `409 Conflict` (`{ error: "Idempotency key reused with different request payload" }`).
                *   If `existing.expiresAt <= new Date()`: Expired entry (> 24 hours old); safely delete expired record (`deleteMany({ where: { id: existingKey.id, expiresAt: { lte: new Date() } } })`) so concurrent deletion does not throw P2025 and unique constraint does not block key reuse. Proceed with execution.
    *   Separate legitimate work entries with unique client UUIDs both succeed normally.
*   **Atomic Transaction Boundary & Implementation Pattern:**
    ```typescript
    try {
      // 1. Mandatory UUIDv4 Idempotency-Key header validation
      if (!idempotencyKey) {
        return res.status(400).json({ error: "Idempotency-Key header is required. Must be UUIDv4." });
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
        return res.status(400).json({ error: "Invalid Idempotency-Key header format. Must be UUIDv4." });
      }

      // 2. Validate all request fields upfront before any database pre-lookup, pruning, or reservation
      if (typeof actionDescription !== 'string' || actionDescription.trim().length < 1 || actionDescription.trim().length > 2000) {
        return res.status(400).json({ error: "actionDescription is required and must be 1-2000 characters after trimming." });
      }
      const normalizedActionDescription = actionDescription.trim();

      if (typeof result !== 'string' || result.trim().length < 1 || result.trim().length > 2000) {
        return res.status(400).json({ error: "result is required and must be 1-2000 characters after trimming." });
      }
      const normalizedResult = result.trim();

      let effectiveActionDateTime: Date;
      if (actionDateTime !== undefined && actionDateTime !== null) {
        const parsed = parseStrictIsoTimestamp(actionDateTime);
        if (!parsed) {
          return res.status(400).json({ error: "actionDateTime must be a valid strict ISO 8601 timestamp." });
        }
        if (parsed > new Date()) {
          return res.status(400).json({ error: "actionDateTime cannot be in the future." });
        }
        effectiveActionDateTime = parsed;
      } else {
        effectiveActionDateTime = new Date();
      }

      if (typeof followUpRequired !== 'boolean') {
        return res.status(400).json({ error: "followUpRequired must be an actual boolean." });
      }

      let normalizedFollowUpNote: string | null = null;
      if (followUpRequired === true) {
        if (typeof followUpNote !== 'string' || followUpNote.trim().length < 1 || followUpNote.trim().length > 2000) {
          return res.status(400).json({ error: "followUpNote is required (1-2000 characters) when followUpRequired is true." });
        }
        normalizedFollowUpNote = followUpNote.trim();
      } else {
        if (followUpNote !== null && followUpNote !== undefined) {
          return res.status(400).json({ error: "followUpNote must be null when followUpRequired is false." });
        }
        normalizedFollowUpNote = null;
      }

      let normalizedAttachmentNotes: string | null = null;
      if (attachmentNotes !== undefined && attachmentNotes !== null) {
        if (typeof attachmentNotes !== 'string') {
          return res.status(400).json({ error: "attachmentNotes must be a string or null." });
        }
        const trimmed = attachmentNotes.trim();
        if (trimmed.length > 500) {
          return res.status(400).json({ error: "attachmentNotes cannot exceed 500 characters." });
        }
        normalizedAttachmentNotes = trimmed.length > 0 ? trimmed : null;
      }

      // 3. Build canonical payload strictly from validated, normalized values
      const canonicalPayload = {
        actionDateTime: actionDateTime !== undefined && actionDateTime !== null ? effectiveActionDateTime.toISOString() : undefined,
        actionDescription: normalizedActionDescription,
        attachmentNotes: normalizedAttachmentNotes,
        followUpNote: normalizedFollowUpNote,
        followUpRequired,
        result: normalizedResult
      };
      const requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

      // 4. Pre-lookup IdempotencyKey and handle 24-hour expiration
      const existingKey = await prisma.idempotencyKey.findUnique({
        where: {
          route_ticketId_userId_key: {
            route: "POST /api/tickets/:id/actions",
            ticketId,
            userId: req.user.id,
            key: idempotencyKey
          }
        }
      });
      if (existingKey) {
        if (existingKey.expiresAt > new Date()) {
          if (existingKey.statusCode !== null && existingKey.responseBody !== null) {
            if (existingKey.requestHash === requestHash) {
              res.setHeader('Idempotency-Replayed', 'true');
              return res.status(existingKey.statusCode).json(JSON.parse(existingKey.responseBody));
            }
            return res.status(409).json({ error: "Idempotency key reused with different request payload" });
          }
        } else {
          // Expired entry (> 24 hours): prune safely using deleteMany to tolerate concurrent purges
          await prisma.idempotencyKey.deleteMany({
            where: { id: existingKey.id, expiresAt: { lte: new Date() } }
          });
        }
      }

      // 5. In-Transaction execution: read-only checks allowed before Phase 1 reservation
      const createdAction = await prisma.$transaction(async (tx) => {
        // 5.1 Read-only verification of parent ticket existence
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) {
          const err = new Error("Ticket not found");
          (err as any).status = 404;
          throw err;
        }

        // 5.2 Phase 1 Reservation Claim (before domain mutation or CAS update)
        // Under PostgreSQL, competing concurrent requests with the identical compound key block
        // on the unique index tuple lock here BEFORE modifying any tables or evaluating CAS.
        const reservation = await tx.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            route: "POST /api/tickets/:id/actions",
            ticketId,
            userId: req.user.id,
            requestHash,
            statusCode: null,
            responseBody: null,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        });

        // 5.3 Create ActionTaken record with immutable session actor
        const action = await tx.actionTaken.create({
          data: {
            ticketId,
            actionDateTime: effectiveActionDateTime,
            actionDescription: normalizedActionDescription,
            result: normalizedResult,
            performedById: req.user.id,
            followUpRequired,
            followUpNote: normalizedFollowUpNote,
            attachmentNotes: normalizedAttachmentNotes
          },
          include: {
            performedBy: { select: { id: true, name: true, role: true, email: true } }
          }
        });

        // 5.4 Atomically refresh parent Ticket.updatedAt
        await tx.ticket.update({
          where: { id: ticketId },
          data: { updatedAt: new Date() }
        });

        // 5.5 Finalize idempotency reservation with response payload and status before commit
        await tx.idempotencyKey.update({
          where: { id: reservation.id },
          data: {
            statusCode: 201,
            responseBody: JSON.stringify(action)
          }
        });

        return action;
      });

      // Send HTTP response strictly after transaction commit
      return res.status(201).json(createdAction);
    } catch (err: any) {
      // Strictly intercept ONLY the IdempotencyKey compound unique constraint collision [route, ticketId, userId, key]
      // In server/package-lock.json, @prisma/client is locked to version 5.22.0.
      // In Prisma Client 5.22.0 on PostgreSQL, mapped compound unique constraint targets are represented as
      // an array of field names: ['route', 'ticketId', 'userId', 'key']. Physical database constraint name matching
      // is marked as pending runtime verification upon Prisma migration creation.
      const target = err.meta?.target;
      const isExactFieldArray = Array.isArray(target) &&
        target.length === 4 &&
        ['route', 'ticketId', 'userId', 'key'].every((f) => target.includes(f));
      const isIdempotencyKeyCollision = err.code === 'P2002' && isExactFieldArray;

      if (isIdempotencyKeyCollision && idempotencyKey) {
        // In PostgreSQL READ COMMITTED, the competing insert in Phase 1 blocked on the unique index tuple lock.
        // Receiving P2002 guarantees that the competing transaction committed (if it rolled back, this transaction would succeed).
        const existing = await prisma.idempotencyKey.findUnique({
          where: {
            route_ticketId_userId_key: {
              route: "POST /api/tickets/:id/actions",
              ticketId,
              userId: req.user.id,
              key: idempotencyKey
            }
          }
        });

        // Reservation Finalization Invariant:
        // Because Phase 1 reservation and Phase 2 finalization occur in the same database transaction,
        // a committed reservation MUST already have non-null statusCode and responseBody.
        // A committed record with null statusCode/responseBody represents an invariant violation (abnormal state),
        // not a normal in-progress concurrency state. It logs diagnostic details and returns a safe 500 error.
        if (!existing || existing.statusCode === null || existing.responseBody === null) {
          console.error("Invariant violation: Committed IdempotencyKey record is missing finalized response data", {
            key: idempotencyKey,
            route: "POST /api/tickets/:id/actions",
            ticketId,
            userId: req.user.id
          });
          return res.status(500).json({ error: "Internal server error" });
        }

        if (existing.expiresAt > new Date()) {
          if (existing.requestHash === requestHash) {
            res.setHeader("Idempotency-Replayed", "true");
            return res.status(existing.statusCode).json(JSON.parse(existing.responseBody));
          }
          return res.status(409).json({ error: "Idempotency key reused with different request payload" });
        }
      }

      // Re-throw unrelated P2002 errors (e.g. User email uniqueness) so they are not swallowed
      if (err.code === 'P2002') {
        throw err;
      }
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
    ```
*   **Response Shape (201 Created):** Returns created `ActionTaken` object with populated `performedBy` relation.
*   **Errors:**
    *   `400 Bad Request`: Missing or malformed `Idempotency-Key` header, missing required fields, validation failure (future date, note > 2000 chars, attachmentNotes > 500 chars), or `followUpRequired: true` without `followUpNote`.
    *   `401 Unauthorized`: Unauthenticated.
    *   `403 Forbidden`: Authenticated user is a Requester.
    *   `404 Not Found`: Ticket does not exist.
    *   `409 Conflict`: Idempotency key payload mismatch, concurrent in-flight collision, or aborted competing request retry.

### 2.3 PATCH `/api/tickets/:id/actions/:actionId`
*   **Purpose:** Update an existing Action Taken record via atomic Compare-And-Swap.
*   **Authentication:** Required.
*   **Permitted Roles:** `IT Staff`, `Administrator`. (Requesters denied with `403 Forbidden`).
*   **Request Shape:**
    ```json
    {
      "actionLastUpdatedAt": "2026-11-01T08:32:00.000Z",
      "actionDateTime": "2026-11-01T08:30:00.000Z",
      "actionDescription": "Checked switch port configuration and re-terminated cable (updated with port details).",
      "result": "24-hour observation complete: 0 errors detected.",
      "followUpRequired": false,
      "followUpNote": null,
      "attachmentNotes": "See ping_results.png and error_log.txt"
    }
    ```
*   **Validation Rules:**
    *   `actionLastUpdatedAt`: ISO 8601 string, **mandatory**. Must pass `parseStrictIsoTimestamp`. If omitted, malformed, or invalid calendar date, returns `400 Bad Request` (`{ error: "actionLastUpdatedAt is required and must be a valid strict ISO 8601 timestamp." }`).
    *   *Payload Completeness:* At least one mutable field (`actionDescription`, `result`, `actionDateTime`, `followUpRequired`, `followUpNote`, `attachmentNotes`) must be supplied in addition to `actionLastUpdatedAt`. If omitted, returns `400 Bad Request` (`{ error: "At least one mutable field must be provided for update." }`).
    *   `actionDescription`: String, optional. If provided, must contain 1–2000 non-whitespace characters after trimming. Supplying empty string, whitespace-only, non-string, or text exceeding 2000 characters returns `400 Bad Request`. Exactly 2000 trimmed characters are accepted; 2001 characters are rejected.
    *   `result`: String, optional. If provided, must contain 1–2000 non-whitespace characters after trimming. Supplying empty string, whitespace-only, non-string, or text exceeding 2000 characters returns `400 Bad Request`. Exactly 2000 trimmed characters are accepted; 2001 characters are rejected.
    *   `actionDateTime`: ISO 8601 string, optional. If supplied, must pass `parseStrictIsoTimestamp` and cannot be in the future. Valid `Z` and `±HH:mm` timestamps are accepted and converted to their correct UTC instant. Supplying an invalid format, unparseable timestamp, or future date returns `400 Bad Request`.
    *   `followUpRequired`: Boolean, optional. Must be an actual boolean primitive if supplied (`typeof followUpRequired === 'boolean'`).
    *   `followUpNote`: Conditionally validated based on the effective `followUpRequired` state:
        *   PATCH supports partial field updates: omitted fields retain their existing values from the database.
        *   Effective state is calculated by merging current database values with incoming PATCH fields prior to validation.
        *   When effective `followUpRequired === true`, the resulting `followUpNote` must be a non-empty string of 1–2000 non-whitespace characters after trimming. Exactly 2000 trimmed characters are accepted; 2001 characters are rejected with `400 Bad Request`.
        *   Transitioning `followUpRequired` from `false` to `true` without supplying a valid `followUpNote` returns `400 Bad Request`.
        *   When `followUpRequired` is already `true`, updating other fields without resending `followUpNote` preserves the existing note without forcing the client to retransmit it.
        *   When `followUpRequired` is already `true`, sending a new `followUpNote` without resending `followUpRequired` updates the note.
        *   When effective `followUpRequired === false`, `followUpNote` is set to `null` always, regardless of whether a note was included in the request payload.
    *   `attachmentNotes`: String, optional, max 500 characters after trimming. If empty string or whitespace-only, normalized to `null`. Text exceeding 500 characters returns `400 Bad Request`.
    *   `performedById`: Server-managed and strictly immutable. Any attempt to supply `performedById` in the request body is stripped and ignored by the server, preserving the original performer intact.
    *   *No-op Handling:*
        *   If at least one mutable field is provided, but after normalization and merging with current database values, all 6 editable fields (`actionDateTime`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes`) produce zero net change against the existing record, the request is treated as a No-op.
        *   No-op performs the standard CAS verification against `expectedActionLastUpdatedAt`.
        *   If the CAS token matches, No-op returns `200 OK` with the unchanged record.
        *   If the CAS token is stale, No-op returns `409 Conflict`.
        *   A No-op does NOT create an `ActionTakenRevision` record.
        *   A No-op does NOT modify `ActionTaken.updatedAt`.
        *   A No-op does NOT refresh the parent `Ticket.updatedAt`.
*   **Atomic Conditional CAS Update Implementation Pattern:**
    ```typescript
    try {
      // 1. Validate the mandatory CAS token before any database mutation using strict parser
      const parsedExpectedUpdatedAt = parseStrictIsoTimestamp(actionLastUpdatedAt);
      if (!parsedExpectedUpdatedAt) {
        return res.status(400).json({
          error: "actionLastUpdatedAt is required and must be a valid strict ISO 8601 timestamp."
        });
      }
      const expectedActionLastUpdatedAt = parsedExpectedUpdatedAt;

      // 2. At least one mutable field must be supplied
      const mutableFields = [
        actionDescription,
        result,
        actionDateTime,
        followUpRequired,
        followUpNote,
        attachmentNotes
      ];

      if (mutableFields.every((field) => field === undefined)) {
        return res.status(400).json({
          error: "At least one mutable field must be provided for update."
        });
      }

      // 3. Validate supplied values before entering the transaction
      if (actionDescription !== undefined) {
        if (typeof actionDescription !== 'string' || actionDescription.trim().length < 1 || actionDescription.trim().length > 2000) {
          return res.status(400).json({
            error: "actionDescription must be 1-2000 characters after trimming."
          });
        }
      }

      if (result !== undefined) {
        if (typeof result !== 'string' || result.trim().length < 1 || result.trim().length > 2000) {
          return res.status(400).json({
            error: "result must be 1-2000 characters after trimming."
          });
        }
      }

      let parsedActionDateTime: Date | undefined;
      if (actionDateTime !== undefined) {
        parsedActionDateTime = parseStrictIsoTimestamp(actionDateTime) ?? undefined;
        if (!parsedActionDateTime) {
          return res.status(400).json({
            error: "actionDateTime must be a valid strict ISO 8601 timestamp."
          });
        }
        if (parsedActionDateTime > new Date()) {
          return res.status(400).json({
            error: "actionDateTime cannot be in the future."
          });
        }
      }

      if (
        followUpRequired !== undefined &&
        typeof followUpRequired !== 'boolean'
      ) {
        return res.status(400).json({
          error: "followUpRequired must be a boolean."
        });
      }

      if (followUpNote !== undefined && followUpNote !== null) {
        if (typeof followUpNote !== 'string' || followUpNote.trim().length < 1 || followUpNote.trim().length > 2000) {
          return res.status(400).json({
            error: "followUpNote must be a string of 1-2000 characters after trimming."
          });
        }
      }

      if (
        attachmentNotes !== undefined &&
        attachmentNotes !== null &&
        typeof attachmentNotes !== 'string'
      ) {
        return res.status(400).json({
          error: "attachmentNotes must be a string or null."
        });
      }

      if (
        typeof attachmentNotes === 'string' &&
        attachmentNotes.trim().length > 500
      ) {
        return res.status(400).json({
          error: "attachmentNotes cannot exceed 500 characters."
        });
      }

      // 4. Execute CAS, compare effective values, and write revision atomically
      const updated = await prisma.$transaction(async (tx) => {
        // 4.1 Fetch the existing Action Taken and verify parent association
        const existing = await tx.actionTaken.findFirst({
          where: {
            id: actionId,
            ticketId
          }
        });

        if (!existing) {
          const err = new Error("Action Taken not found");
          (err as any).status = 404;
          throw err;
        }

        // 4.2 Merge supplied values with existing values.
        // Omitted fields must preserve their existing values.
        const nextActionDateTime =
          parsedActionDateTime !== undefined
            ? parsedActionDateTime
            : existing.actionDateTime;

        const nextActionDescription =
          actionDescription !== undefined
            ? actionDescription.trim()
            : existing.actionDescription;

        const nextResult =
          result !== undefined
            ? result.trim()
            : existing.result;

        const nextFollowUpRequired =
          followUpRequired !== undefined
            ? followUpRequired
            : existing.followUpRequired;

        // followUpNote depends on the effective followUpRequired value.
        // When follow-up is disabled, the note must always become null.
        // When enabled, an omitted note preserves the existing note.
        // A supplied note is accepted even when followUpRequired is omitted.
        let nextFollowUpNote: string | null;

        if (nextFollowUpRequired === false) {
          nextFollowUpNote = null;
        } else if (followUpNote !== undefined) {
          nextFollowUpNote =
            typeof followUpNote === 'string'
              ? followUpNote.trim()
              : null;
        } else {
          nextFollowUpNote = existing.followUpNote;
        }

        // Validate effective merged note before CAS update
        if (
          nextFollowUpRequired === true &&
          (
            typeof nextFollowUpNote !== 'string' ||
            nextFollowUpNote.trim().length < 1 ||
            nextFollowUpNote.trim().length > 2000
          )
        ) {
          const err = new Error(
            "followUpNote is required (1-2000 characters) when the resulting followUpRequired value is true."
          );
          (err as any).status = 400;
          throw err;
        }

        const nextAttachmentNotes =
          attachmentNotes !== undefined
            ? (
                typeof attachmentNotes === 'string' &&
                attachmentNotes.trim() !== ''
              )
              ? attachmentNotes.trim()
              : null
            : existing.attachmentNotes;

        // 4.3 Build complete before/after snapshots.
        // Snapshots contain all six editable fields.
        const beforeSnapshot = {
          actionDateTime: existing.actionDateTime.toISOString(),
          actionDescription: existing.actionDescription,
          result: existing.result,
          followUpRequired: existing.followUpRequired,
          followUpNote: existing.followUpNote,
          attachmentNotes: existing.attachmentNotes
        };

        const afterSnapshot = {
          actionDateTime: nextActionDateTime.toISOString(),
          actionDescription: nextActionDescription,
          result: nextResult,
          followUpRequired: nextFollowUpRequired,
          followUpNote: nextFollowUpNote,
          attachmentNotes: nextAttachmentNotes
        };

        // 4.4 Detect whether any normalized editable value actually changed.
        // Date values are compared by timestamp, not by their original string format.
        const hasChanges =
          nextActionDateTime.getTime() !== existing.actionDateTime.getTime() ||
          nextActionDescription !== existing.actionDescription ||
          nextResult !== existing.result ||
          nextFollowUpRequired !== existing.followUpRequired ||
          nextFollowUpNote !== existing.followUpNote ||
          nextAttachmentNotes !== existing.attachmentNotes;

        // 4.5 Perform database-level CAS.
        // For a real edit, update all six effective values and refresh ActionTaken.updatedAt.
        // For a no-op, preserve ActionTaken.updatedAt while still checking the CAS token.
        const changedAt = new Date();

        const updateResult = await tx.actionTaken.updateMany({
          where: {
            id: actionId,
            ticketId,
            updatedAt: expectedActionLastUpdatedAt
          },
          data: hasChanges
            ? {
                actionDateTime: nextActionDateTime,
                actionDescription: nextActionDescription,
                result: nextResult,
                followUpRequired: nextFollowUpRequired,
                followUpNote: nextFollowUpNote,
                attachmentNotes: nextAttachmentNotes,
                updatedAt: changedAt
              }
            : {
                // Deliberate no-op CAS check.
                // Keep the logical timestamp unchanged.
                updatedAt: existing.updatedAt
              }
        });

        // 4.6 Distinguish missing records from stale CAS tokens.
        if (updateResult.count === 0) {
          const current = await tx.actionTaken.findFirst({
            where: {
              id: actionId,
              ticketId
            }
          });

          if (!current) {
            const err = new Error("Action Taken not found");
            (err as any).status = 404;
            throw err;
          }

          const err = new Error(
            "Action Taken was modified by another session. Please reload and try again."
          );
          (err as any).status = 409;
          throw err;
        }

        // 4.7 Only a real change creates exactly one append-only revision.
        // A no-op must never create a revision row.
        if (hasChanges) {
          await tx.actionTakenRevision.create({
            data: {
              actionTakenId: actionId,
              editedById: req.user.id,
              beforeSnapshot,
              afterSnapshot
              // editedAt is generated by the database/schema default.
            }
          });

          // Refresh the parent Ticket only for a real Action Taken edit.
          await tx.ticket.update({
            where: {
              id: ticketId
            },
            data: {
              updatedAt: changedAt
            }
          });
        }

        // 4.8 Return the final Action Taken record.
        // No-op returns the unchanged record with its original updatedAt.
        const updatedAction = await tx.actionTaken.findUnique({
          where: {
            id: actionId
          },
          include: {
            performedBy: {
              select: {
                id: true,
                name: true,
                role: true,
                email: true
              }
            }
          }
        });

        if (!updatedAction) {
          const err = new Error("Action Taken not found");
          (err as any).status = 404;
          throw err;
        }

        return updatedAction;
      });

      // Send the HTTP response only after the transaction commits.
      return res.status(200).json(updated);

    } catch (err: any) {
      if (err.status) {
        return res.status(err.status).json({
          error: err.message
        });
      }

      // Database failures, including revision insertion or parent Ticket refresh
      // failures, must result in transaction rollback and a safe 500 response.
      return res.status(500).json({
        error: "Internal server error"
      });
    }
    ```
*   **Errors:**
    *   `400 Bad Request`: Missing or invalid `actionLastUpdatedAt`, no mutable fields provided, invalid `actionDateTime` format, future `actionDateTime`, empty or overlength `actionDescription` (> 2000 characters), empty or overlength `result` (> 2000 characters), invalid or overlength `followUpNote` (> 2000 characters), or overlength `attachmentNotes` (> 500 characters).
    *   `401 Unauthorized`: Unauthenticated.
    *   `403 Forbidden`: Requester role.
    *   `404 Not Found`: Action Taken or Ticket does not exist.
    *   `409 Conflict`: Stale update detected (conditional update affected 0 rows due to timestamp mismatch).

### 2.4 GET `/api/tickets/:id/actions/:actionId/revisions`
*   **Purpose:** Retrieve the ordered timeline of revision history for a specific Action Taken.
*   **Authentication:** Required.
*   **Permitted Roles:** `IT Staff`, `Administrator`. (Requesters receive `403 Forbidden` if they own the ticket, or `404 Not Found` if they do not own the ticket, preserving non-enumeration).
*   **Parameters:** `id` (integer in path), `actionId` (integer in path).
*   **Ordering:** Strictly deterministic chronological order: `ORDER BY editedAt ASC, id ASC`.
*   **Non-Fabrication Policy:** Existing legacy actions with zero edits return an empty array `[]`. No artificial or fabricated past revisions are generated.
*   **Response Shape (200 OK):**
    ```json
    [
      {
        "id": 1,
        "actionTakenId": 101,
        "editedById": 6,
        "editedBy": {
          "id": 6,
          "name": "Staff One",
          "email": "staff1@example.com",
          "role": "IT Staff"
        },
        "editedAt": "2026-11-01T10:15:00.000Z",
        "beforeSnapshot": {
          "actionDateTime": "2026-11-01T08:30:00.000Z",
          "actionDescription": "Checked switch port configuration and re-terminated cable.",
          "result": "Link light restored; packet loss dropped to 0%.",
          "followUpRequired": true,
          "followUpNote": "Monitor error rates over the next 24 hours.",
          "attachmentNotes": "See ping_results.png in ticket attachments."
        },
        "afterSnapshot": {
          "actionDateTime": "2026-11-01T08:30:00.000Z",
          "actionDescription": "Checked switch port configuration and re-terminated cable (updated with port details).",
          "result": "24-hour observation complete: 0 errors detected.",
          "followUpRequired": false,
          "followUpNote": null,
          "attachmentNotes": "See ping_results.png and error_log.txt"
        }
      }
    ]
    ```
*   **Errors:**
    *   `400 Bad Request`: Invalid ticket ID or action ID format.
    *   `401 Unauthorized`: Missing or invalid session.
    *   `403 Forbidden`: Authenticated user is a Requester requesting a ticket they own.
    *   `404 Not Found`: Ticket not found, Action Taken not found, OR requested by a Requester who does not own the parent ticket (non-enumeration).

### 2.4.1 True Append-Only Enforcement & PostgreSQL Trigger Specification (Proposed Migration Requirement)
`ActionTakenRevision` records are strictly append-only. The application provides no HTTP endpoints to modify or delete revisions. To guarantee that revisions cannot be rewritten, deleted, or pruned even via direct database connections, the future database migration will install PostgreSQL triggers, a trigger function, and role privilege restrictions:

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
-- ('toktickit' is verified as the default application role in server/.env.example;
-- in custom/production environments, replace with the verified unprivileged runtime role)
REVOKE TRUNCATE ON TABLE "ActionTakenRevision" FROM toktickit;
```

*Execution Semantics & Privilege Layering:*
*   `INSERT` statements remain fully permitted (executing during `PATCH /api/tickets/:id/actions/:actionId` within the atomic CAS transaction).
*   `UPDATE` statements are blocked by the row-level trigger (`trg_prevent_action_taken_revision_mutation`) for database roles that have update privileges and cannot disable the trigger, raising SQL exception: `'ActionTakenRevision records are append-only and cannot be updated, deleted, or truncated.'`.
*   `DELETE` statements are blocked by the row-level trigger for database roles that have delete privileges, raising the same exception.
*   `TRUNCATE` statements are blocked by the statement-level trigger (`trg_prevent_action_taken_revision_truncate`) for a permitted non-owner, non-superuser role while the trigger remains enabled.
*   For the application runtime role, `TRUNCATE` is additionally barred at the PostgreSQL privilege layer via `REVOKE TRUNCATE`. When an unprivileged runtime connection attempts `TRUNCATE`, PostgreSQL rejects the operation at the privilege checking layer with SQLSTATE `42501` (`permission denied for table ActionTakenRevision`) before any trigger executes.
*   *Security & Role Limitations:* These database protections protect against application bugs and standard database connections. They do not protect against a PostgreSQL superuser (who can disable or drop triggers and bypass privilege checks), nor do revoked privileges restrict table owners (as PostgreSQL bypasses privilege checks for table owners). Consequently, production deployment strictly requires that the application runtime role must NOT be the table owner or a PostgreSQL superuser.

*Deployment Requirement on Runtime Role Privilege:*
*   The default application runtime database role is verified as `toktickit` per `server/.env.example` (`postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public`).
*   In custom, staging, or production environments, substitute `toktickit` with the verified application runtime database username.
*   The application runtime role must be provisioned as a regular unprivileged role and must **never** be the database table owner or a PostgreSQL superuser.

*Testing Connection Semantics:*
*   **Trigger Test Connection:** Uses a privileged, non-owner, non-superuser database role possessing `UPDATE`, `DELETE`, and `TRUNCATE` table privileges. Direct SQL `UPDATE`, `DELETE`, and `TRUNCATE` executed over this connection reach the triggers and assert trigger exception `'ActionTakenRevision records are append-only and cannot be updated, deleted, or truncated.'`.
*   **Application Runtime Connection:** Uses the authenticated unprivileged application runtime role (e.g. `toktickit`). Direct SQL `TRUNCATE` over this connection asserts immediate denial at the PostgreSQL privilege checking layer with SQLSTATE `42501` prior to trigger invocation.

*Note on Migration Stage:* This trigger, function, and privilege specification is a **proposed migration requirement at the documentation stage** and will be implemented as part of the future database migration.

*Rollback Teardown Order:*
If a migration rollback is required:
1. `DROP TRIGGER IF EXISTS trg_prevent_action_taken_revision_truncate ON "ActionTakenRevision";`
2. `DROP TRIGGER IF EXISTS trg_prevent_action_taken_revision_mutation ON "ActionTakenRevision";`
3. `DROP FUNCTION IF EXISTS prevent_action_taken_revision_mutation();`
4. `DROP TABLE IF EXISTS "ActionTakenRevision" CASCADE;`

---

## 3. Operational Dashboard Endpoints

### 3.1 GET `/api/dashboard/requester`
*   **Purpose:** Retrieve operational summary counts, recently updated tickets, and recently resolved tickets for the authenticated Requester.
*   **Authentication:** Required.
*   **Permitted Roles:** `Requester` only. (Staff and Admin receive `403 Forbidden`).
*   **Response Shape (200 OK):**
    ```json
    {
      "metrics": {
        "openTickets": 3,
        "waitingForRequester": 1,
        "inProgress": 2,
        "resolved": 5,
        "closed": 12
      },
      "recentlyUpdatedTickets": [
        {
          "id": 14,
          "ticketNumber": "TKT-014",
          "summary": "Laptop battery drains quickly",
          "status": "In Progress",
          "priority": "High",
          "itPriority": "High",
          "updatedAt": "2026-11-01T09:14:00.000Z",
          "createdAt": "2026-10-31T14:20:00.000Z"
        }
      ],
      "recentlyResolvedTickets": [
        {
          "id": 10,
          "ticketNumber": "TKT-010",
          "summary": "VPN connection drops repeatedly",
          "status": "Resolved",
          "priority": "Medium",
          "itPriority": "Medium",
          "resolvedAt": "2026-10-30T16:00:00.000Z",
          "updatedAt": "2026-11-01T08:30:00.000Z",
          "createdAt": "2026-10-29T10:00:00.000Z"
        }
      ]
    }
    ```
*   **Calculation Logic & Dedicated `resolvedAt` Standard:**
    *   `openTickets`: `status IN ['New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened']` AND `requesterId == req.user.id`. (Excludes `Closed` and `Cancelled`).
    *   `waitingForRequester`: `status == 'Waiting for Requester'` AND `requesterId == req.user.id`.
    *   `inProgress`: `status == 'In Progress'` AND `requesterId == req.user.id`.
    *   `resolved`: `status == 'Resolved'` AND **`resolvedAt IS NOT NULL AND resolvedAt >= NOW() - INTERVAL '30 days'`** AND `requesterId == req.user.id`. Legacy tickets with `resolvedAt = NULL` are excluded.
    *   `closed`: `status == 'Closed'` AND `requesterId == req.user.id`.
    *   `recentlyUpdatedTickets`: Up to 5 tickets for this requester ordered strictly by deterministic sort: `ORDER BY updatedAt DESC, id DESC`.
    *   `recentlyResolvedTickets`: Up to 5 tickets for this requester where `status == 'Resolved'` AND `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - INTERVAL '30 days'`, ordered strictly by deterministic sort: **`ORDER BY resolvedAt DESC, id DESC`**.
*   **Drill-Down Filter Alignment on `GET /api/tickets`:**
    *   `?view=open`: Filters tickets where `status IN ('New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened')`, strictly excluding `Closed` and `Cancelled`.
    *   `?status={status}`: Filters by specific status (e.g. `?status=Waiting for Requester`, `?status=In Progress`, `?status=Closed`).
    *   `?withinDays={days}`: When querying `?status=Resolved`, applies date filter `resolvedAt >= NOW() - INTERVAL '{days} days'`. (e.g. `?status=Resolved&withinDays=30`).
*   **Empty State:** If requester has 0 tickets, returns `0` for all counts, `recentlyUpdatedTickets: []`, and `recentlyResolvedTickets: []`.

### 3.2 GET `/api/dashboard/staff`
*   **Purpose:** Retrieve real-time operational triage metrics (including Unassigned and My Assigned), priority breakdowns, and recently updated tickets for IT Staff.
*   **Authentication:** Required.
*   **Permitted Roles:** `IT Staff`, `Administrator`. (Requesters receive `403 Forbidden`).
*   **Active Triage Definition & Reopened Status Alignment:**
    *   Tickets in `Resolved`, `Closed`, and `Cancelled` represent completed work and are strictly **excluded** from `unassigned`, `myAssigned`, and `priorityBreakdown`.
    *   Tickets in `Reopened` represent active unresolved work and are strictly **included** in `unassigned` (if unowned), `myAssigned` (if owned by the staff user), and `priorityBreakdown`.
    *   *Card Representation vs Queue:* While the 6 dashboard cards display high-velocity buckets (`Unassigned`, `My Assigned`, `New`, `Open`, `In Progress`, `Waiting for Requester`), Reopened tickets are monitored through the `Unassigned` or `My Assigned` cards and accessed directly via the staff queue filter `?status=Reopened`.
*   **Response Shape (200 OK):**
    ```json
    {
      "metrics": {
        "unassigned": 12,
        "myAssigned": 16,
        "new": 14,
        "open": 23,
        "inProgress": 18,
        "waitingForRequester": 7
      },
      "priorityBreakdown": {
        "critical": 5,
        "high": 12,
        "medium": 20,
        "low": 6
      },
      "recentTickets": [
        {
          "id": 34,
          "ticketNumber": "TKT-034",
          "summary": "Cannot access HR portal",
          "status": "New",
          "priority": "Critical",
          "itPriority": "Critical",
          "owner": null,
          "requester": { "id": 4, "name": "Alice Smith" },
          "updatedAt": "2026-11-01T09:15:00.000Z"
        }
      ]
    }
    ```
*   **Calculation Logic & Boundaries:**
    *   `unassigned`: `ownerId == null` AND `status NOT IN ('Resolved', 'Closed', 'Cancelled')` (includes unassigned `Reopened` tickets).
    *   `myAssigned`: `ownerId == req.user.id` AND `status NOT IN ('Resolved', 'Closed', 'Cancelled')` (includes assigned `Reopened` tickets).
    *   `new`: `status == 'New'`.
    *   `open`: `status == 'Open'`.
    *   `inProgress`: `status == 'In Progress'`.
    *   `waitingForRequester`: `status == 'Waiting for Requester'`.
    *   `priorityBreakdown`: Active tickets (`status NOT IN ('Resolved', 'Closed', 'Cancelled')`) grouped by `itPriority`.
    *   `recentTickets`: Up to 5 most recently active tickets across the service desk, ordered strictly by deterministic sort: `ORDER BY updatedAt DESC, id DESC`.
*   **Drill-Down Filter Alignment on `GET /api/staff/tickets`:**
    *   `?ownerId={id|Unassigned}`: If `ownerId=Unassigned`, filters `ownerId IS NULL AND status NOT IN ('Resolved', 'Closed', 'Cancelled')`. If integer ID, filters by that owner.
    *   `?status={status}`: Filters by specific status (e.g. `?status=New`, `?status=Reopened`).
    *   `?itPriority={priority}`: Filters by IT priority (`Critical`, `High`, `Medium`, `Low`).
    *   `?scope=active`: Filters `status NOT IN ('Resolved', 'Closed', 'Cancelled')`.

### 3.3 GET `/api/dashboard/admin`
*   **Purpose:** Retrieve IT Staff operational metrics plus all five user administration statistics.
*   **Authentication:** Required.
*   **Permitted Roles:** `Administrator` strictly. (Staff and Requesters receive `403 Forbidden`).
*   **Response Shape (200 OK):**
    ```json
    {
      "staffMetrics": {
        "unassigned": 12,
        "myAssigned": 0,
        "new": 14,
        "open": 23,
        "inProgress": 18,
        "waitingForRequester": 7
      },
      "priorityBreakdown": {
        "critical": 5,
        "high": 12,
        "medium": 20,
        "low": 6
      },
      "userStats": {
        "totalUsers": 25,
        "activeRequesters": 18,
        "activeStaff": 5,
        "activeAdmins": 2,
        "inactiveUsers": 2
      },
      "recentTickets": [ ... ]
    }
    ```
*   **User Stats Calculation Logic:**
    *   `totalUsers`: `prisma.user.count()`
    *   `activeRequesters`: `prisma.user.count({ where: { role: 'Requester', isActive: true } })`
    *   `activeStaff`: `prisma.user.count({ where: { role: 'IT Staff', isActive: true } })`
    *   `activeAdmins`: `prisma.user.count({ where: { role: 'Administrator', isActive: true } })`
    *   `inactiveUsers`: `prisma.user.count({ where: { isActive: false } })`

### 3.4 Query Filter Semantics & Dashboard Drill-Down Replication
*   **Combination Logic:** All query parameters combine strictly with boolean `AND`.
*   **Validation & Error Handling:**
    *   `view`: String. Valid values: `open`. Filters tickets where `status IN ('New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened')`. Supplying any other value returns `400 Bad Request` (`{ error: "Invalid view parameter. Supported value: 'open'." }`).
    *   `status`: String. Valid values: `'New'`, `'Open'`, `'In Progress'`, `'Waiting for Requester'`, `'Resolved'`, `'Closed'`, `'Reopened'`, `'Cancelled'`. Supplying an unrecognized status returns `400 Bad Request` (`{ error: "Invalid status parameter." }`).
    *   `withinDays`: Integer `> 0`. Applies date boundary `resolvedAt >= NOW() - INTERVAL '{withinDays} days'` when `status=Resolved`. Supplying a non-positive integer or non-numeric value returns `400 Bad Request` (`{ error: "withinDays must be a positive integer." }`).
    *   `ownerId`: String `'Unassigned'` or positive integer ID. If `'Unassigned'`, filters `ownerId IS NULL AND status NOT IN ('Resolved', 'Closed', 'Cancelled')`. If integer ID, filters by that owner ID. Any invalid string returns `400 Bad Request`.
    *   `itPriority`: String. Valid values: `'Low'`, `'Medium'`, `'High'`, `'Critical'`. Any invalid value returns `400 Bad Request`.
    *   `scope`: String. Valid values: `'active'`. Filters `status NOT IN ('Resolved', 'Closed', 'Cancelled')`. Any unrecognized value returns `400 Bad Request`.
*   **Authoritative Dashboard Card Replication Matrix:**

| Dashboard Card / Metric | Target Endpoint & Exact Query String | Server WHERE Condition Applied |
|---|---|---|
| **Requester: My Open Tickets** | `GET /api/tickets?view=open` | `requesterId = :userId AND status IN ('New', 'Open', 'In Progress', 'Waiting for Requester', 'Reopened')` |
| **Requester: Waiting for Requester** | `GET /api/tickets?status=Waiting%20for%20Requester` | `requesterId = :userId AND status = 'Waiting for Requester'` |
| **Requester: In Progress** | `GET /api/tickets?status=In%20Progress` | `requesterId = :userId AND status = 'In Progress'` |
| **Requester: Recently Resolved** | `GET /api/tickets?status=Resolved&withinDays=30` | `requesterId = :userId AND status = 'Resolved' AND resolvedAt IS NOT NULL AND resolvedAt >= NOW() - INTERVAL '30 days'` |
| **Requester: Closed** | `GET /api/tickets?status=Closed` | `requesterId = :userId AND status = 'Closed'` |
| **Staff: Unassigned Queue** | `GET /api/staff/tickets?ownerId=Unassigned` | `ownerId IS NULL AND status NOT IN ('Resolved', 'Closed', 'Cancelled')` |
| **Staff: My Assigned Queue** | `GET /api/staff/tickets?ownerId={session.userId}` | `ownerId = :userId AND status NOT IN ('Resolved', 'Closed', 'Cancelled')` |
| **Staff: New Status** | `GET /api/staff/tickets?status=New` | `status = 'New'` |
| **Staff: Open Status** | `GET /api/staff/tickets?status=Open` | `status = 'Open'` |
| **Staff: In Progress Status** | `GET /api/staff/tickets?status=In%20Progress` | `status = 'In Progress'` |
| **Staff: Waiting for Requester** | `GET /api/staff/tickets?status=Waiting%20for%20Requester` | `status = 'Waiting for Requester'` |
| **Staff: Reopened Status** | `GET /api/staff/tickets?status=Reopened` | `status = 'Reopened'` |
| **Staff: Priority Breakdown** | `GET /api/staff/tickets?itPriority={priority}&scope=active` | `itPriority = :priority AND status NOT IN ('Resolved', 'Closed', 'Cancelled')` |

---

## 4. Ticket Workflow & Resolution Gate Endpoints

### 4.1 PATCH `/api/staff/tickets/:id/status`
*   **Purpose:** Transition ticket lifecycle status and/or update IT Priority via atomic Compare-And-Swap.
*   **Authentication:** Required.
*   **Permitted Roles:** `IT Staff`. (Requesters and Administrators denied with `403 Forbidden` per preserved Lab 3 baseline, as Section 4.3 is restricted to Actions Taken).
*   **Request Shape:**
    ```json
    {
      "status": "Resolved",
      "itPriority": "High",
      "comment": "Replaced thermal paste and dusted heatsink. CPU temperatures stable at 45C under load.",
      "reason": null,
      "lastUpdatedAt": "2026-11-01T08:15:00.000Z"
    }
    ```
*   **Validation Rules:**
    *   `lastUpdatedAt`: ISO 8601 string, **mandatory**. Must pass `parseStrictIsoTimestamp`. If omitted, malformed, or invalid calendar date, returns `400 Bad Request` (`{ error: "lastUpdatedAt is required and must be a valid strict ISO 8601 timestamp." }`).
    *   `status`: String, valid target status per the 13-row transition matrix below.
    *   `itPriority`: String, optional (`Low`, `Medium`, `High`, `Critical`).
    *   `comment`: String, mandatory when transitioning to `Waiting for Requester`. Strictly optional when transitioning to `Resolved` (creates `PublicComment` only if non-empty).
    *   `reason`: String, mandatory when transitioning to `Cancelled` or `Reopened`.
*   **Permitted Status Transitions Matrix (13 Permitted IT Staff Transitions):**

| # | Source Status | Target Status | Authorized Roles | Required Conditions / Side Effects |
|---|---|---|---|---|
| 1 | `New` | `Open` | IT Staff | Ticket must have an assigned owner (`ownerId != null`). |
| 2 | `New` | `Cancelled` | IT Staff | Cancellation `reason` is required; generates an `InternalNote`. |
| 3 | `Open` | `In Progress` | IT Staff | Ticket must have an assigned owner (`ownerId != null`). |
| 4 | `Open` | `Waiting for Requester` | IT Staff | Public `comment` is required; generates a `PublicComment`. |
| 5 | `In Progress` | `Waiting for Requester` | IT Staff | Public `comment` is required; generates a `PublicComment`. |
| 6 | `Waiting for Requester` | `In Progress` | IT Staff | Staff resumes active work (`ownerId = null` permitted). |
| 7 | `Waiting for Requester` | `Open` | IT Staff | Staff resets ticket to open queue (`ownerId = null` permitted). |
| 8 | `In Progress` | `Resolved` | IT Staff | **Resolution Gate**: requires `>= 1` Action Taken (mandatory); non-empty resolution `comment` is optional (creates `PublicComment` only if provided); **sets `resolvedAt = NOW()`**. |
| 9 | `Resolved` | `Closed` | IT Staff | Final closure confirmation; preserves `resolvedAt`. |
| 10| `Closed` | `Reopened` | IT Staff | Exceptionally reopened; requires `reason` (creates `InternalNote`); **clears `resolvedAt` to `null`**. |
| 11| `Reopened` | `In Progress` | IT Staff | Staff resumes active work; ticket must have an assigned owner (`ownerId != null`); retains already-null `resolvedAt` value. |
| 12| `Reopened` | `Open` | IT Staff | Staff resets ticket to open pool (`ownerId = null` permitted); retains already-null `resolvedAt` value. |
| 13| `Reopened` | `Waiting for Requester` | IT Staff | Staff requests additional information; requires public `comment` (creates `PublicComment`); `ownerId = null` permitted; retains already-null `resolvedAt` value. |

*   **Distinct Comment-Driven Requester Transitions (Reconciled with Matrix):**
    *   The 13 transitions above govern explicit IT Staff transitions via `PATCH /api/staff/tickets/:id/status`. (Administrators receive `403 Forbidden`).
    *   In addition, the system supports two automated comment-driven transitions triggered exclusively by the owning Requester via `POST /api/tickets/:id/comments`:
        1.  `Waiting for Requester` $\rightarrow$ `Open`: Resumes ticket to open triage pool upon customer reply.
        2.  `Resolved` or `Closed` $\rightarrow$ `Reopened`: Reopens ticket upon customer follow-up. The customer's `PublicComment` content itself serves as the reopening explanation; no `InternalNote` is generated (preserving internal note privacy). Resets `resolvedAt = null` and updates parent `updatedAt = NOW()`.
*   **Atomic CAS & Side-Effect Transaction Implementation Pattern:**
    ```typescript
    try {
      // Upfront validation before entering transaction: mandatory lastUpdatedAt concurrency token
      const parsedLastUpdatedAt = parseStrictIsoTimestamp(lastUpdatedAt);
      if (!parsedLastUpdatedAt) {
        return res.status(400).json({ error: "lastUpdatedAt is required and must be a valid strict ISO 8601 timestamp." });
      }

      const updatedTicket = await prisma.$transaction(async (tx) => {
        // 1. Fetch ticket inside transaction to evaluate current state
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) {
          const err = new Error("Ticket not found");
          (err as any).status = 404;
          throw err;
        }

        // 2. Validate transition validity from current ticket.status to target status
        const validTransitions: Record<string, string[]> = {
          'New': ['Open', 'Cancelled'],
          'Open': ['In Progress', 'Waiting for Requester'],
          'Waiting for Requester': ['In Progress', 'Open'],
          'In Progress': ['Resolved', 'Waiting for Requester'],
          'Resolved': ['Closed'],
          'Closed': ['Reopened'],
          'Reopened': ['In Progress', 'Open', 'Waiting for Requester'],
          'Cancelled': []
        };
        if (!validTransitions[ticket.status]?.includes(status)) {
          const err = new Error(`Invalid status transition from '${ticket.status}' to '${status}'.`);
          (err as any).status = 400;
          throw err;
        }

        // 3. Validate owner requirement for exact source-target transitions requiring assigned owner
        const ownerRequiredTransitions = new Set(['New->Open', 'Open->In Progress', 'Reopened->In Progress']);
        const transitionKey = `${ticket.status}->${status}`;
        if (ownerRequiredTransitions.has(transitionKey) && !ticket.ownerId) {
          const err = new Error(`Ticket must be assigned to an owner before transitioning from '${ticket.status}' to '${status}'.`);
          (err as any).status = 400;
          throw err;
        }

        // 4. Validate Resolution Gate within the transaction (Action Count is sole mandatory condition)
        if (status === 'Resolved') {
          const actionCount = await tx.actionTaken.count({ where: { ticketId } });
          if (actionCount === 0) {
            const err = new Error("At least one action taken must be recorded before resolving the ticket.");
            (err as any).status = 400;
            throw err;
          }
          // Note: Resolution comment is strictly optional. If provided and non-empty, creates PublicComment; otherwise no comment is created and transition is not blocked.
        }

        // 5. Validate cancellation or reopen reason
        if (['Cancelled', 'Reopened'].includes(status)) {
          if (!reason || typeof reason !== 'string' || reason.trim() === '') {
            const err = new Error(`${status} reason is required.`);
            (err as any).status = 400;
            throw err;
          }
        }

        // 6. Validate required public comment for Waiting for Requester
        if (status === 'Waiting for Requester') {
          if (!comment || typeof comment !== 'string' || comment.trim() === '') {
            const err = new Error("Public comment is required when placing ticket in Waiting for Requester.");
            (err as any).status = 400;
            throw err;
          }
        }

        // 7. Conditional update matching ticket ID, current status, and expected lastUpdatedAt token
        const updateResult = await tx.ticket.updateMany({
          where: {
            id: ticketId,
            status: ticket.status,
            updatedAt: parsedLastUpdatedAt
          },
          data: {
            status,
            ...(itPriority && { itPriority }),
            resolvedAt: status === 'Resolved' ? new Date() : (status === 'Reopened' ? null : undefined),
            updatedAt: new Date()
          }
        });

        // 8. Affected row check: distinguish not found (404) from concurrency conflict (409)
        if (updateResult.count === 0) {
          const current = await tx.ticket.findUnique({ where: { id: ticketId } });
          if (!current) {
            const err = new Error("Ticket not found");
            (err as any).status = 404;
            throw err;
          }
          const err = new Error("Ticket was modified by another session. Please reload and try again.");
          (err as any).status = 409;
          throw err;
        }

        // 9. Atomic side effects within the same transaction
        if (status === 'Resolved' && comment && typeof comment === 'string' && comment.trim() !== '') {
          await tx.publicComment.create({
            data: { content: comment.trim(), ticketId, authorId: req.user.id }
          });
        }
        if (status === 'Waiting for Requester' && comment && typeof comment === 'string' && comment.trim() !== '') {
          await tx.publicComment.create({
            data: { content: comment.trim(), ticketId, authorId: req.user.id }
          });
        }
        if (reason && typeof reason === 'string' && ['Cancelled', 'Reopened'].includes(status)) {
          await tx.internalNote.create({
            data: { content: `${status} Reason: ${reason.trim()}`, ticketId, authorId: req.user.id }
          });
        }

        // 10. Return updated ticket with relations
        return await tx.ticket.findUnique({
          where: { id: ticketId },
          include: { category: true, relatedSystem: true, requester: true, owner: true, actionsTaken: true }
        });
      });

      // Send HTTP response strictly after transaction commit
      return res.status(200).json(updatedTicket);
    } catch (err: any) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
    ```
*   **Errors:**
    *   `400 Bad Request`: Missing or invalid `lastUpdatedAt`, invalid transition, missing owner on transitions requiring assignment ('New->Open', 'Open->In Progress', 'Reopened->In Progress'), missing/invalid cancellation reason, missing/invalid required comment for Waiting for Requester, or Resolution Gate failure (0 actions recorded).
    *   `401 Unauthorized`: Unauthenticated.
    *   `403 Forbidden`: Authenticated user is not IT Staff (Requesters and Administrators are denied per preserved Lab 3 baseline).
    *   `404 Not Found`: Ticket not found.
    *   `409 Conflict`: Stale update detected (conditional update affected 0 rows due to timestamp mismatch).

### 4.2 POST `/api/tickets/:id/comments` (Comment-Driven Status Auto-Transitions)
*   **Purpose:** Post a Public Comment on a ticket. Supports idempotency key protection and concurrency-safe atomic status auto-transitions.
*   **Authentication:** Required.
*   **Permitted Roles:** `Requester` (for tickets they own), `IT Staff`. (Administrators denied with `403 Forbidden` per preserved Lab 3 baseline, as Section 4.3 is restricted to Actions Taken).
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Idempotency-Key`: UUIDv4 string (**optional**; if omitted, request executes normally without deduplication).
*   **Request Shape:**
    ```json
    {
      "content": "I restarted the router as requested and the error persists.",
      "lastUpdatedAt": "2026-11-01T08:30:00.000Z"
    }
    ```
*   **Validation Rules:**
    *   `content`: String, required. Must contain at least 1 non-whitespace character after trimming (`typeof content === 'string' && content.trim().length > 0`). Empty string, whitespace-only, non-string, or missing value returns `400 Bad Request`.
    *   `lastUpdatedAt`: ISO 8601 string, **mandatory** for concurrency validation. Must pass `parseStrictIsoTimestamp`. If omitted, malformed, or invalid calendar date, returns `400 Bad Request` (`{ error: "lastUpdatedAt is required and must be a valid strict ISO 8601 timestamp." }`).
    *   `Idempotency-Key`: UUIDv4 string, **optional**. If supplied, must match valid UUIDv4 format (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`). If malformed, returns `400 Bad Request` (`{ error: "Invalid Idempotency-Key header format. Must be UUIDv4." }`).
    *   *Validation Ordering Precedence:* All input validations execute **strictly before** any `IdempotencyKey` lookup, expired-key cleanup, reservation creation, or ticket mutation. Invalid requests return `400 Bad Request` without modifying state or reserving idempotency slots.
*   **Comment-Driven Status Transitions & Transaction Atomicity Implementation Pattern:**
    ```typescript
    try {
      // 1. Upfront request validation before any IdempotencyKey lookup, pruning, or transaction
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: "content is required and cannot be empty or whitespace-only." });
      }
      const normalizedContent = content.trim();

      const parsedLastUpdatedAt = parseStrictIsoTimestamp(lastUpdatedAt);
      if (!parsedLastUpdatedAt) {
        return res.status(400).json({ error: "lastUpdatedAt is required and must be a valid strict ISO 8601 timestamp." });
      }

      if (idempotencyKey) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
          return res.status(400).json({ error: "Invalid Idempotency-Key header format. Must be UUIDv4." });
        }
      }

      // 2. Canonicalize payload and pre-lookup IdempotencyKey if provided
      let requestHash = '';
      if (idempotencyKey) {
        const canonicalPayload = {
          content: normalizedContent,
          lastUpdatedAt: parsedLastUpdatedAt.toISOString()
        };
        requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

        const existingKey = await prisma.idempotencyKey.findUnique({
          where: {
            route_ticketId_userId_key: {
              route: "POST /api/tickets/:id/comments",
              ticketId,
              userId: req.user.id,
              key: idempotencyKey
            }
          }
        });
        if (existingKey) {
          if (existingKey.expiresAt > new Date()) {
            if (existingKey.statusCode !== null && existingKey.responseBody !== null) {
              if (existingKey.requestHash === requestHash) {
                res.setHeader('Idempotency-Replayed', 'true');
                return res.status(existingKey.statusCode).json(JSON.parse(existingKey.responseBody));
              }
              return res.status(409).json({ error: "Idempotency key reused with different request payload" });
            }
          } else {
            // Expired entry (> 24 hours): prune safely using deleteMany to tolerate concurrent purges
            await prisma.idempotencyKey.deleteMany({
              where: { id: existingKey.id, expiresAt: { lte: new Date() } }
            });
          }
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch ticket to verify existence and ownership
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) {
          const err = new Error("Ticket not found");
          (err as any).status = 404;
          throw err;
        }
        if (req.user.role === 'Requester' && ticket.requesterId !== req.user.id) {
          const err = new Error("Ticket not found");
          (err as any).status = 404;
          throw err;
        }

        // 2. Reserve idempotency slot FIRST if key was provided (Two-Phase In-Transaction Reservation)
        // Under PostgreSQL, competing requests with the identical compound key block
        // on the unique index tuple lock HERE, BEFORE attempting the Ticket CAS mutation.
        // This prevents Request 2 from failing the Ticket CAS with a false 409 after Request 1 updates updatedAt.
        let reservationId: number | null = null;
        if (idempotencyKey) {
          const reservation = await tx.idempotencyKey.create({
            data: {
              key: idempotencyKey,
              route: "POST /api/tickets/:id/comments",
              ticketId,
              userId: req.user.id,
              requestHash,
              statusCode: null,
              responseBody: null,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
          });
          reservationId = reservation.id;
        }

        // 3. Concurrency-safe status auto-transitions via atomic state-and-timestamp conditional update across all branches
        let updateCount = 0;
        if (req.user.role === 'Requester') {
          if (ticket.status === 'Waiting for Requester') {
            const res = await tx.ticket.updateMany({
              where: {
                id: ticketId,
                status: 'Waiting for Requester',
                updatedAt: parsedLastUpdatedAt
              },
              data: { status: 'Open', updatedAt: new Date() }
            });
            updateCount = res.count;
          } else if (['Resolved', 'Closed'].includes(ticket.status)) {
            const res = await tx.ticket.updateMany({
              where: {
                id: ticketId,
                status: ticket.status,
                updatedAt: parsedLastUpdatedAt
              },
              data: { status: 'Reopened', resolvedAt: null, updatedAt: new Date() }
            });
            updateCount = res.count;
          } else {
            // Requester comment on New, Open, In Progress, Reopened, or Cancelled: status remains unchanged
            const res = await tx.ticket.updateMany({
              where: {
                id: ticketId,
                status: ticket.status,
                updatedAt: parsedLastUpdatedAt
              },
              data: { updatedAt: new Date() }
            });
            updateCount = res.count;
          }
        } else {
          // IT Staff comment: status remains unchanged, parent updatedAt refreshed conditionally (Administrators are rejected with 403 Forbidden at auth layer)
          const res = await tx.ticket.updateMany({
            where: {
              id: ticketId,
              status: ticket.status,
              updatedAt: parsedLastUpdatedAt
            },
            data: { updatedAt: new Date() }
          });
          updateCount = res.count;
        }

        // 4. If conditional update matched 0 rows, check existence and ownership before deciding 404 vs 409
        if (updateCount === 0) {
          const currentTicket = await tx.ticket.findUnique({ where: { id: ticketId } });
          if (!currentTicket || (req.user.role === 'Requester' && currentTicket.requesterId !== req.user.id)) {
            const err = new Error("Ticket not found");
            (err as any).status = 404;
            throw err;
          }
          const err = new Error("Ticket was modified by another session. Please reload and try again.");
          (err as any).status = 409;
          throw err;
        }

        // 5. Create PublicComment
        const comment = await tx.publicComment.create({
          data: {
            content: normalizedContent,
            ticketId,
            authorId: req.user.id
          },
          include: { author: { select: { id: true, name: true, role: true } } }
        });

        // 6. Finalize idempotency reservation with response payload and status before commit
        if (reservationId) {
          await tx.idempotencyKey.update({
            where: { id: reservationId },
            data: {
              statusCode: 201,
              responseBody: JSON.stringify(comment)
            }
          });
        }

        return comment;
      });

      // Send HTTP response strictly after transaction commit
      return res.status(201).json(result);
    } catch (err: any) {
      // Strictly intercept ONLY the IdempotencyKey compound unique constraint collision [route, ticketId, userId, key]
      // In server/package-lock.json, @prisma/client is locked to version 5.22.0.
      // In Prisma Client 5.22.0 on PostgreSQL, mapped compound unique constraint targets are represented as
      // an array of field names: ['route', 'ticketId', 'userId', 'key']. Physical database constraint name matching
      // is marked as pending runtime verification upon Prisma migration creation.
      const target = err.meta?.target;
      const isExactFieldArray = Array.isArray(target) &&
        target.length === 4 &&
        ['route', 'ticketId', 'userId', 'key'].every((f) => target.includes(f));
      const isIdempotencyKeyCollision = err.code === 'P2002' && isExactFieldArray;

      if (isIdempotencyKeyCollision && idempotencyKey) {
        // In PostgreSQL READ COMMITTED, the competing insert in Phase 1 blocked on the unique index tuple lock.
        // Receiving P2002 proves that the competing transaction committed.
        const existing = await prisma.idempotencyKey.findUnique({
          where: {
            route_ticketId_userId_key: {
              route: "POST /api/tickets/:id/comments",
              ticketId,
              userId: req.user.id,
              key: idempotencyKey
            }
          }
        });

        // Reservation Finalization Invariant:
        // Phase 1 reservation and Phase 2 finalization occur in the same database transaction;
        // a committed reservation MUST already have non-null statusCode and responseBody.
        // A committed record with null statusCode/responseBody represents an invariant violation (abnormal state),
        // not a normal in-progress concurrency state. It logs diagnostic details and returns a safe 500 error.
        if (!existing || existing.statusCode === null || existing.responseBody === null) {
          console.error("Invariant violation: Committed IdempotencyKey record is missing finalized response data", {
            key: idempotencyKey,
            route: "POST /api/tickets/:id/comments",
            ticketId,
            userId: req.user.id
          });
          return res.status(500).json({ error: "Internal server error" });
        }

        if (existing.expiresAt > new Date()) {
          if (existing.requestHash === requestHash) {
            res.setHeader("Idempotency-Replayed", "true");
            return res.status(existing.statusCode).json(JSON.parse(existing.responseBody));
          }
          return res.status(409).json({ error: "Idempotency key reused with different request payload" });
        }
      }

      // Re-throw unrelated P2002 errors (e.g. User email uniqueness) so they are not swallowed
      if (err.code === 'P2002') {
        throw err;
      }
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
    ```
*   **Response Shape (201 Created):** Returns the created `PublicComment` object with updated ticket status.
*   **Errors:**
    *   `400 Bad Request`: Missing or blank `content`, missing `lastUpdatedAt`, or invalid UUIDv4 `Idempotency-Key` format.
    *   `401 Unauthorized`: Missing, invalid, or expired session.
    *   `403 Forbidden`: Authenticated user role is not permitted to comment.
    *   `404 Not Found`: Ticket not found OR ticket belongs to another user when requested by a Requester (non-enumeration policy). Staff and Administrators are authorized to view any ticket across the service desk (Staff are authorized to comment; Administrators are denied comment creation with 403 Forbidden).
    *   `409 Conflict`: Stale `lastUpdatedAt`, concurrent status change, concurrent non-status modification (e.g. owner/priority reassignment), ABA status change, idempotency key payload mismatch, or unresolvable idempotency race.

### 4.3 POST `/api/tickets/:id/appears-resolved`
*   **Purpose:** Advisory feedback from the owning Requester indicating the issue appears resolved.
*   **Authentication:** Required.
*   **Permitted Roles:** `Requester` (for tickets they own).
*   **Request Headers:**
    *   `Content-Type: application/json`
    *   `Idempotency-Key`: UUIDv4 string (**optional**; if omitted, request executes normally without deduplication).
*   **Request Shape:**
    ```json
    {
      "lastUpdatedAt": "2026-11-01T08:30:00.000Z"
    }
    ```
*   **Validation Rules:**
    *   `lastUpdatedAt`: ISO 8601 string, **mandatory** for concurrency validation. Must pass `parseStrictIsoTimestamp` (defined in Section 1.1). Missing, malformed, non-strict ISO string (e.g. missing timezone designator, out-of-range calendar components such as Feb 30, non-zero padding), or non-string returns `400 Bad Request` (`{ error: "lastUpdatedAt is required and must be a valid ISO 8601 timestamp string." }`).
    *   `Idempotency-Key` (header): Optional. If provided, must be a valid UUIDv4 string matching `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`. Invalid format returns `400 Bad Request` (`{ error: "Invalid Idempotency-Key header format. Must be UUIDv4." }`).
    *   All request validation is performed upfront before any IdempotencyKey pre-lookup, 24-hour expiration cleanup, or database transaction.
    *   Ticket status must be strictly `In Progress`. If in any other status, returns `400 Bad Request`.
*   **Atomic Transaction & Idempotency Implementation Pattern:**
    ```typescript
    try {
      // 1. Upfront Request Validation (Enforced BEFORE any database lookup, pruning, or reservation)
      let parsedLastUpdatedAt: Date;
      try {
        parsedLastUpdatedAt = parseStrictIsoTimestamp(lastUpdatedAt, 'lastUpdatedAt');
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey !== undefined) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
          return res.status(400).json({ error: "Invalid Idempotency-Key header format. Must be UUIDv4." });
        }
      }

      // 2. Pre-lookup & 24h expiration pruning if Idempotency-Key provided
      let requestHash = '';
      if (idempotencyKey) {
        const canonicalPayload = {
          lastUpdatedAt: parsedLastUpdatedAt.toISOString()
        };
        requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

        const existingKey = await prisma.idempotencyKey.findUnique({
          where: {
            route_ticketId_userId_key: {
              route: "POST /api/tickets/:id/appears-resolved",
              ticketId,
              userId: req.user.id,
              key: idempotencyKey
            }
          }
        });
        if (existingKey) {
          if (existingKey.expiresAt > new Date()) {
            if (existingKey.statusCode !== null && existingKey.responseBody !== null) {
              if (existingKey.requestHash === requestHash) {
                res.setHeader('Idempotency-Replayed', 'true');
                return res.status(existingKey.statusCode).json(JSON.parse(existingKey.responseBody));
              }
              return res.status(409).json({ error: "Idempotency key reused with different request payload" });
            }
          } else {
            // Expired entry (> 24 hours): prune safely using deleteMany to tolerate concurrent purges
            await prisma.idempotencyKey.deleteMany({
              where: { id: existingKey.id, expiresAt: { lte: new Date() } }
            });
          }
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch ticket to verify existence and ownership
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket || ticket.requesterId !== req.user.id) {
          const err = new Error("Ticket not found");
          (err as any).status = 404;
          throw err;
        }

        // 2. Reserve idempotency slot FIRST if key was provided (Two-Phase In-Transaction Reservation)
        // Under PostgreSQL, competing requests with the identical compound key block
        // on the unique index tuple lock HERE, BEFORE attempting the Ticket CAS mutation.
        // This prevents Request 2 from failing the Ticket CAS with a false 409 after Request 1 updates updatedAt.
        let reservationId: number | null = null;
        if (idempotencyKey) {
          const reservation = await tx.idempotencyKey.create({
            data: {
              key: idempotencyKey,
              route: "POST /api/tickets/:id/appears-resolved",
              ticketId,
              userId: req.user.id,
              requestHash,
              statusCode: null,
              responseBody: null,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            }
          });
          reservationId = reservation.id;
        }

        // 3. Enforce advisory rule: ticket must be strictly In Progress
        if (ticket.status !== 'In Progress') {
          const err = new Error("Advisory resolution feedback is permitted only when ticket is In Progress.");
          (err as any).status = 400;
          throw err;
        }

        // 4. Atomic conditional update: verify status is In Progress AND updatedAt matches expected token
        const updateResult = await tx.ticket.updateMany({
          where: {
            id: ticketId,
            status: 'In Progress',
            updatedAt: parsedLastUpdatedAt
          },
          data: { updatedAt: new Date() }
        });

        // 5. If conditional update matched 0 rows, check existence and ownership before deciding 404 vs 409
        if (updateResult.count === 0) {
          const currentTicket = await tx.ticket.findUnique({ where: { id: ticketId } });
          if (!currentTicket || currentTicket.requesterId !== req.user.id) {
            const err = new Error("Ticket not found");
            (err as any).status = 404;
            throw err;
          }
          const err = new Error("Ticket was modified by another session. Advisory feedback requires the ticket to remain In Progress at the current revision.");
          (err as any).status = 409;
          throw err;
        }

        // 6. Create standardized PublicComment authored by Requester
        const comment = await tx.publicComment.create({
          data: {
            content: "The requester has indicated that the problem appears resolved.",
            ticketId,
            authorId: req.user.id
          },
          include: { author: { select: { id: true, name: true, role: true } } }
        });

        // 7. Finalize idempotency reservation with response payload and status before commit
        if (reservationId) {
          await tx.idempotencyKey.update({
            where: { id: reservationId },
            data: {
              statusCode: 201,
              responseBody: JSON.stringify(comment)
            }
          });
        }

        return comment;
      });

      // Send HTTP response strictly after transaction commit
      return res.status(201).json(result);
    } catch (err: any) {
      // Strictly intercept ONLY the IdempotencyKey compound unique constraint collision [route, ticketId, userId, key]
      // In server/package-lock.json, @prisma/client is locked to version 5.22.0.
      // In Prisma Client 5.22.0 on PostgreSQL, mapped compound unique constraint targets are represented as
      // an array of field names: ['route', 'ticketId', 'userId', 'key']. Physical database constraint name matching
      // is marked as pending runtime verification upon Prisma migration creation.
      const target = err.meta?.target;
      const isExactFieldArray = Array.isArray(target) &&
        target.length === 4 &&
        ['route', 'ticketId', 'userId', 'key'].every((f) => target.includes(f));
      const isIdempotencyKeyCollision = err.code === 'P2002' && isExactFieldArray;

      if (isIdempotencyKeyCollision && idempotencyKey) {
        // In PostgreSQL READ COMMITTED, the competing insert in Phase 1 blocked on the unique index tuple lock.
        // Receiving P2002 proves that the competing transaction committed.
        const existing = await prisma.idempotencyKey.findUnique({
          where: {
            route_ticketId_userId_key: {
              route: "POST /api/tickets/:id/appears-resolved",
              ticketId,
              userId: req.user.id,
              key: idempotencyKey
            }
          }
        });

        // Reservation Finalization Invariant:
        // Phase 1 reservation and Phase 2 finalization occur in the same database transaction;
        // a committed reservation MUST already have non-null statusCode and responseBody.
        // A committed record with null statusCode/responseBody represents an invariant violation (abnormal state),
        // not a normal in-progress concurrency state. It logs diagnostic details and returns a safe 500 error.
        if (!existing || existing.statusCode === null || existing.responseBody === null) {
          console.error("Invariant violation: Committed IdempotencyKey record is missing finalized response data", {
            key: idempotencyKey,
            route: "POST /api/tickets/:id/appears-resolved",
            ticketId,
            userId: req.user.id
          });
          return res.status(500).json({ error: "Internal server error" });
        }

        if (existing.expiresAt > new Date()) {
          if (existing.requestHash === requestHash) {
            res.setHeader("Idempotency-Replayed", "true");
            return res.status(existing.statusCode).json(JSON.parse(existing.responseBody));
          }
          return res.status(409).json({ error: "Idempotency key reused with different request payload" });
        }
      }

      // Re-throw unrelated P2002 errors (e.g. User email uniqueness) so they are not swallowed
      if (err.code === 'P2002') {
        throw err;
      }
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
    ```
*   **Behavior Summary:**
    *   Appends a standardized `PublicComment`: `"The requester has indicated that the problem appears resolved."`
    *   **Ticket status remains `In Progress`**. It does NOT change status to `Resolved` or `Closed`.
    *   If an `Idempotency-Key` was provided that matches a recorded advisory submission, the API safely returns the stored 201 response with header `Idempotency-Replayed: true` without appending duplicate comments.
*   **Response Shape (201 Created):** Returns the created `PublicComment` object.
*   **Errors:**
    *   `400 Bad Request`: Missing or invalid `lastUpdatedAt` format (must be strict ISO 8601), ticket is not in `In Progress`, or invalid `Idempotency-Key` UUIDv4 format.
    *   `401 Unauthorized`: Unauthenticated.
    *   `403 Forbidden`: Non-requester role.
    *   `404 Not Found`: Ticket not found or unowned by the requester (non-enumeration).
    *   `409 Conflict`: Stale `lastUpdatedAt`, concurrent status change away from In Progress, concurrent non-status modification, idempotency key payload mismatch, or unresolvable idempotency race.

---

## 5. Summary of Continuing Lab 1–3 APIs

| Endpoint | Method | Permitted Roles | Brief Description |
|---|---|---|---|
| `/api/auth/login` | POST | Public | Authenticates user; issues `sessionId` HttpOnly cookie. |
| `/api/auth/logout` | POST | Authenticated | Destroys session record in database; clears cookie. |
| `/api/auth/me` | GET | Authenticated | Returns current authenticated user record. |
| `/api/auth/change-password` | POST | Authenticated | Mandatory first-login password change. |
| `/api/health` | GET | Public | Service health check (`{ status: "ok" }`). |
| `/api/categories` | GET | Public | Returns IT service categories. |
| `/api/related-systems` | GET | Public | Returns IT related systems. |
| `/api/tickets` | POST | Requester | Creates a ticket (with optional attachment IDs). |
| `/api/tickets` | GET | Requester | Lists tickets owned by the authenticated Requester. Supports `?view=open`, `?status={status}`, `?withinDays={days}`. |
| `/api/tickets/:id` | GET | Requester (own), Staff, Admin | Detailed ticket view (404 for unowned tickets). |
| `/api/staff/tickets` | GET | Staff, Admin | Centralized queue supporting `?ownerId={id|Unassigned}`, `?status={status}`, `?itPriority={priority}`, `?scope=active`, search, sort, and pagination. |
| `/api/staff/users` | GET | Staff, Admin | Minimal read-only active IT Staff list for assignee filter. |
| `/api/staff/tickets/:id/assign` | PATCH | IT Staff | Claim unassigned ticket or assign to active IT Staff. |
| `/api/tickets/:id/comments` | GET | Requester (own), Staff, Admin | Fetch public comments. |
| `/api/tickets/:id/notes` | GET | Staff, Admin | Fetch internal notes (Requester receives 403). |
| `/api/tickets/:id/notes` | POST | IT Staff | Post internal note (Admin and Requester receive 403). |
| `/api/attachments` | POST | Requester (own), Staff | Upload attachment (max 5MB, max 5 per ticket). |
| `/api/attachments/:id` | GET | Requester (own), Staff, Admin | Fetch attachment metadata. |
| `/api/attachments/:id/download` | GET | Requester (own), Staff, Admin | Stream attachment file. |
| `/api/attachments/:id` | DELETE | Requester (own), Staff | Soft-delete attachment with removal reason. |
| `/api/admin/users` | GET | Administrator | List, search, and filter user accounts. |
| `/api/admin/users` | POST | Administrator | Create user account with unique email. |
| `/api/admin/users/:id` | PATCH | Administrator | Edit profile, role, or active status (safeguards active). |
| `/api/admin/users/:id/reset-password` | POST | Administrator | Reset user's password; forces change on next login. |
| `/api/tickets/:id/actions/:actionId/revisions` | GET | Staff, Admin | Fetch append-only revision history of an Action Taken in chronological order (Requester receives 403 on own, 404 on unowned). |

### 5.1 Lab 4 RBAC Baseline & Explicit Authorization Changes from Lab 3
Sprint 4 preserves the core role permissions established in Labs 1–3 while explicitly introducing authorized RBAC extensions to support administrative triage, supervision, and technical escalation:

1.  **Preserved Lab 3 Baseline Permissions:**
    *   **Direct Internal Note Creation (`POST /api/tickets/:id/notes`):** Restricted strictly to `IT Staff` only. Administrators and Requesters attempting to directly call this endpoint receive `403 Forbidden`.
    *   **Ticket Assignment (`PATCH /api/staff/tickets/:id/assign`):** Restricted strictly to `IT Staff` (self-claim or reassign).
    *   **User Management (`/api/admin/users/*`):** Restricted strictly to `Administrator`.
    *   **Ticket Creation (`POST /api/tickets`):** Restricted to `Requester` (Requesters create their own tickets).
    *   **Non-Enumeration Isolation:** Requesters receive `404 Not Found` when requesting tickets, comments, attachments, or actions belonging to other users.

2.  **Explicit Lab 4 RBAC Finalization & Conservative Baseline:**
    *   **Actions Taken Management (`POST /api/tickets/:id/actions`, `PATCH /api/tickets/:id/actions/:actionId`):** Explicitly authorized for both `IT Staff` and `Administrator` per `SE+Lab+4.pdf` Page 1, Section 1 (*"IT Staff and Administrators can create and update Actions Taken for a Ticket;"*) and Page 2–3, Section 4.3 Table (*"Administrator: Perform IT Staff behavior and retain administrative access needed for support and testing."*).
    *   **Action Taken Revision History (`GET /api/tickets/:id/actions/:actionId/revisions`):** Authorized for `IT Staff` and `Administrator`. Requesters receive `403 Forbidden` for tickets they own (and `404 Not Found` for unowned tickets), protecting internal revision details from requester exposure.
    *   **Direct Internal Notes (`POST /api/tickets/:id/notes`):** Restricted strictly to `IT Staff` (Administrators receive `403 Forbidden`), preserving the Lab 3 baseline per `SE+Lab+4.pdf` Page 1, Section 1 and Page 7, Section 8.5 regression mandates (*"all previous authentication, authorization, Requester, IT Staff, Administrator, comment, note, and attachment behavior continues to work;"*). System-generated internal audit notes produced as status-transition side effects (`Cancelled`, `Reopened`) remain permitted.
    *   **Workflow Transitions & Resolution Gate (`PATCH /api/staff/tickets/:id/status`):** Restricted strictly to `IT Staff`. In Lab 3, `server/src/app.ts` line 315 strictly enforced `if (user.role !== 'IT Staff') return res.status(403).json({ error: "Forbidden: Only IT Staff can update ticket status" })`. Because Section 4.3 is titled specifically *"Action Taken Roles and Responsibilities"*, its Administrator permission is interpreted strictly within Actions Taken scope, preserving the Lab 3 403 Forbidden restriction for Administrators on status transitions.
    *   **Public Comments Posting (`POST /api/tickets/:id/comments`):** Restricted to `Requester` (own tickets) and `IT Staff`. In Lab 3, `server/src/app.ts` line 606 strictly enforced `if (req.user!.role === 'Administrator') return res.status(403).json({ error: "Administrators cannot post comments" })`. Preserving earlier comment regression behavior per Page 1 Section 1 and Page 7 Section 8.5 retains this 403 Forbidden restriction for Administrators.
    *   **Operational Dashboards:** Administrators are authorized to view both the IT Staff triage dashboard (`GET /api/dashboard/staff`) and the extended user statistics dashboard (`GET /api/dashboard/admin`).

> [!NOTE] Conservative Administrator RBAC Baseline
> All previous RBAC open questions are closed under this conservative baseline:
> 1. Actions Taken creation and editing are authorized for both IT Staff and Administrators.
> 2. Ticket status transitions, Public Comments, and direct Internal Notes remain strictly denied to Administrators (returning `403 Forbidden`), preserving Lab 3 regression behavior.
> 3. While an explicit future instructor clarification may expand Administrator permissions across other endpoints, the contract unambiguously enforces this conservative baseline.

---

## 6. Error Response Schema Standard
All API errors return standard JSON:
```json
{
  "error": "Human-readable description of error"
}
```
*   `400 Bad Request`: Field validation, missing `lastUpdatedAt` / `actionLastUpdatedAt` concurrency tokens across Ticket status, ActionTaken edit, Public Comment, and Appears-Resolved endpoints, transition violation, Resolution Gate failure.
*   `401 Unauthorized`: Generic `"Invalid credentials or account inactive"`.
*   `403 Forbidden`: Role check failure (`"Forbidden: Insufficient permissions"`).
*   `404 Not Found`: Non-existent resource or ownership failure (`"Ticket not found"`).
*   `409 Conflict`: Stale update detected via atomic CAS/state-conditional row count check (`"Ticket was modified by another session. Please reload and try again."` or `"Action Taken was modified by another session. Please reload and try again."`), idempotency key payload mismatch (`"Idempotency key reused with different request payload"`), concurrent idempotency reconciliation race, or duplicate email during user creation.
*   `500 Internal Server Error`: Generic safe message (`"Internal server error"`).
