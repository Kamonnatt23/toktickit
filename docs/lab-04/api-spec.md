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
*   **Dedicated Idempotency-Key Architecture & CAS Interaction:** In-scope POST endpoints (`/actions`, `/comments`, `/appears-resolved`) support `Idempotency-Key: <UUIDv4>`. The header is **optional** on all three endpoints (clients are encouraged to supply it; if omitted, requests execute normally without deduplication).
    *   *Scope & Hashing:* Scoped strictly to compound key `[route, ticketId, userId, key]`, storing a SHA-256 fingerprint of the canonical request payload.
    *   *Concurrency Race & False 409 Prevention:* Under PostgreSQL default Read Committed isolation, if two concurrent identical requests arrive with the same `Idempotency-Key` and expected `lastUpdatedAt`, both pass the pre-transaction lookup before either commits. If the transaction were to evaluate Ticket CAS before inserting into `IdempotencyKey`, Request 1's Ticket CAS would update `Ticket.updatedAt`. When Request 2's transaction unblocks and evaluates Ticket CAS, the conditional update condition matches 0 rows because `updatedAt` changed. Request 2 would throw a false `409 Conflict` and abort *before* reaching `IdempotencyKey`. Request 2 would never receive a `P2002` error, thereby failing to replay Request 1's response.
    *   *Two-Phase In-Transaction Reservation Pattern:* To guarantee reliable replay without CAS false 409s across all endpoints combining idempotency and Ticket updates:
        1.  **Phase 1 (In-Transaction Reservation Claim):** Immediately upon entering `prisma.$transaction`, if `idempotencyKey` is present, the transaction claims the slot FIRST:
            `tx.idempotencyKey.create({ data: { key, route, ticketId, userId, requestHash, statusCode: null, responseBody: null, expiresAt } })`
            Under PostgreSQL, this acquires an exclusive tuple lock on the compound unique index `[route, ticketId, userId, key]`. If Request 2 arrives concurrently with the same compound key, Request 2's `tx.idempotencyKey.create` immediately **blocks** at the database level on this unique index tuple lock *before* evaluating Ticket CAS. Request 2 does not evaluate Ticket CAS while Request 1 is executing.
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
    *   `Idempotency-Key`: UUIDv4 string (**optional** on all POST endpoints; if omitted, request executes normally without deduplication).
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
    *   `actionDescription`: String, required, trimmed, min 1 char, max 2000 chars.
    *   `result`: String, required, trimmed, min 1 char, max 2000 chars.
    *   `actionDateTime`: ISO 8601 string, optional (defaults to `new Date()` if omitted); cannot be in the future.
    *   `followUpRequired`: Boolean, required.
    *   `followUpNote`: String, **mandatory** (1–2000 non-whitespace chars) if `followUpRequired === true`. Must be submitted as `null` if `followUpRequired === false`.
    *   `attachmentNotes`: String, optional, max 500 chars. (Validation returns `400 Bad Request` if length > 500).
    *   `performedById`: Server-managed and strictly immutable. Extracted automatically from `req.user.id`. Any value sent in the body is stripped and ignored by the server, and excluded from canonicalization.
*   **Idempotency & Replay Handling:**
    *   `Idempotency-Key` is strictly optional. If provided:
        *   Verify header format is valid UUIDv4 (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`). If invalid, return `400 Bad Request` (`{ error: "Invalid Idempotency-Key header format. Must be UUIDv4." }`).
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
      let requestHash = '';
      if (idempotencyKey) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
          return res.status(400).json({ error: "Invalid Idempotency-Key header format. Must be UUIDv4." });
        }
        // Canonicalize payload: strip server-managed performedById, trim strings, sort keys
        const canonicalPayload = {
          actionDateTime: actionDateTime ? new Date(actionDateTime).toISOString() : undefined,
          actionDescription: actionDescription?.trim(),
          result: result?.trim(),
          followUpRequired: Boolean(followUpRequired),
          followUpNote: followUpRequired ? followUpNote?.trim() : null,
          attachmentNotes: attachmentNotes ? attachmentNotes.trim() : null
        };
        requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

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
      }

      // Rename transaction result variable to createdAction to avoid shadowing request field 'result'
      const createdAction = await prisma.$transaction(async (tx) => {
        // 1. Verify parent ticket exists
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) {
          const err = new Error("Ticket not found");
          (err as any).status = 404;
          throw err;
        }

        // 2. Reserve idempotency slot FIRST if key was provided (Phase 1 Reservation)
        // Under PostgreSQL, competing concurrent requests with the identical compound key block
        // on the unique index tuple lock here BEFORE modifying any tables or evaluating CAS.
        let reservationId: number | null = null;
        if (idempotencyKey) {
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
          reservationId = reservation.id;
        }

        // 3. Create ActionTaken record with immutable session actor (result is accessed without TDZ/shadowing)
        const action = await tx.actionTaken.create({
          data: {
            ticketId,
            actionDateTime: actionDateTime ? new Date(actionDateTime) : new Date(),
            actionDescription: actionDescription.trim(),
            result: result.trim(),
            performedById: req.user.id,
            followUpRequired,
            followUpNote: followUpRequired ? followUpNote.trim() : null,
            attachmentNotes: attachmentNotes ? attachmentNotes.trim() : null
          },
          include: {
            performedBy: { select: { id: true, name: true, role: true, email: true } }
          }
        });

        // 4. Atomically refresh parent Ticket.updatedAt
        await tx.ticket.update({
          where: { id: ticketId },
          data: { updatedAt: new Date() }
        });

        // 5. Finalize idempotency reservation with response payload and status before commit
        if (reservationId) {
          await tx.idempotencyKey.update({
            where: { id: reservationId },
            data: {
              statusCode: 201,
              responseBody: JSON.stringify(action)
            }
          });
        }

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
    *   `400 Bad Request`: Missing required fields, validation failure (future date, note > 2000 chars, attachmentNotes > 500 chars), or `followUpRequired: true` without `followUpNote`.
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
    *   `actionLastUpdatedAt`: ISO 8601 string, **mandatory**. If omitted, returns `400 Bad Request` (`{ error: "actionLastUpdatedAt is required for concurrency validation." }`).
    *   `actionDescription`: String, optional. If provided, must contain 1–2000 non-whitespace characters after trimming. Supplying empty or whitespace-only text returns `400 Bad Request`.
    *   `result`: String, optional. If provided, must contain 1–2000 non-whitespace characters after trimming. Supplying empty or whitespace-only text returns `400 Bad Request`.
    *   `actionDateTime`: ISO 8601 string, optional, cannot be in the future.
    *   `followUpRequired`: Boolean, optional.
    *   `followUpNote`: Conditionally mandatory when `followUpRequired === true`: must be validated as a non-empty string (1–2000 non-whitespace chars) before calling `.trim()`. If missing, null, or empty whitespace, returns `400 Bad Request`. When `followUpRequired === false`, must be `null` (or is coerced to `null`).
    *   `attachmentNotes`: String, optional, max 500 chars. If empty string or whitespace-only, normalized to `null`.
    *   `performedById`: Server-managed and strictly immutable. Any attempt to supply `performedById` in the request body is stripped and ignored by the server, preserving the original performer intact.
    *   *Payload Completeness:* At least one mutable field (`actionDescription`, `result`, `actionDateTime`, `followUpRequired`, `followUpNote`, `attachmentNotes`) must be supplied in addition to `actionLastUpdatedAt`. If omitted, returns `400 Bad Request` (`{ error: "At least one mutable field must be provided for update." }`).
*   **Atomic Conditional CAS Update Implementation Pattern:**
    ```typescript
    try {
      // Validate that at least one mutable field is provided
      const mutableFields = [actionDescription, result, actionDateTime, followUpRequired, followUpNote, attachmentNotes];
      if (mutableFields.every((f) => f === undefined)) {
        return res.status(400).json({ error: "At least one mutable field must be provided for update." });
      }

      // Validate non-empty text strings if provided
      if (actionDescription !== undefined && actionDescription.trim() === '') {
        return res.status(400).json({ error: "actionDescription cannot be empty or whitespace-only." });
      }
      if (result !== undefined && result.trim() === '') {
        return res.status(400).json({ error: "result cannot be empty or whitespace-only." });
      }

      // Validate followUpNote before trimming
      if (followUpRequired === true) {
        if (!followUpNote || typeof followUpNote !== 'string' || followUpNote.trim() === '') {
          return res.status(400).json({ error: "followUpNote is required when followUpRequired is true." });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        // 1. Conditional update combining entity ID, ticketId, and expected updatedAt token
        const updateResult = await tx.actionTaken.updateMany({
          where: {
            id: actionId,
            ticketId: ticketId,
            updatedAt: new Date(actionLastUpdatedAt)
          },
          data: {
            ...(actionDescription !== undefined && { actionDescription: actionDescription.trim() }),
            ...(result !== undefined && { result: result.trim() }),
            ...(actionDateTime !== undefined && { actionDateTime: new Date(actionDateTime) }),
            ...(followUpRequired !== undefined && { followUpRequired }),
            ...(followUpRequired === true && { followUpNote: followUpNote.trim() }),
            ...(followUpRequired === false && { followUpNote: null }),
            ...(attachmentNotes !== undefined && { attachmentNotes: attachmentNotes.trim() ? attachmentNotes.trim() : null }),
            updatedAt: new Date()
          }
        });

        // 2. Affected row check: distinguish not found (404) from concurrency conflict (409)
        if (updateResult.count === 0) {
          const exists = await tx.actionTaken.findFirst({ where: { id: actionId, ticketId } });
          if (!exists) {
            const err = new Error("Action Taken not found");
            (err as any).status = 404;
            throw err;
          }
          const err = new Error("Action Taken was modified by another session. Please reload and try again.");
          (err as any).status = 409;
          throw err;
        }

        // 3. Atomically refresh parent Ticket.updatedAt
        await tx.ticket.update({
          where: { id: ticketId },
          data: { updatedAt: new Date() }
        });

        // 4. Return updated record with populated performer details
        return await tx.actionTaken.findUnique({
          where: { id: actionId },
          include: { performedBy: { select: { id: true, name: true, role: true, email: true } } }
        });
      });

      // Send HTTP response strictly after transaction commit
      return res.status(200).json(updated);
    } catch (err: any) {
      if (err.status) {
        return res.status(err.status).json({ error: err.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
    ```
*   **Errors:**
    *   `400 Bad Request`: Missing `actionLastUpdatedAt`, no mutable fields provided, empty/whitespace string for `actionDescription` or `result`, or invalid `followUpNote`.
    *   `401 Unauthorized`: Unauthenticated.
    *   `403 Forbidden`: Requester role.
    *   `404 Not Found`: Action Taken or Ticket does not exist.
    *   `409 Conflict`: Stale update detected (conditional update affected 0 rows due to timestamp mismatch).

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
    *   `lastUpdatedAt`: ISO 8601 string, **mandatory**. If omitted, returns `400 Bad Request` (`{ error: "lastUpdatedAt is required for concurrency validation." }`).
    *   `status`: String, valid target status per the 13-row transition matrix below.
    *   `itPriority`: String, optional (`Low`, `Medium`, `High`, `Critical`).
    *   `comment`: String, mandatory when transitioning to `Waiting for Requester` or `Resolved`.
    *   `reason`: String, mandatory when transitioning to `Cancelled` or `Reopened`.
*   **Permitted Status Transitions Matrix (13 Permitted IT Staff Transitions):**

| # | Source Status | Target Status | Authorized Roles | Required Conditions / Side Effects |
|---|---|---|---|---|
| 1 | `New` | `Open` | IT Staff | Ticket must have an assigned owner (`ownerId != null`). |
| 2 | `New` | `Cancelled` | IT Staff | Cancellation `reason` is required; generates an `InternalNote`. |
| 3 | `Open` | `In Progress` | IT Staff | Ticket must have an assigned owner (`ownerId != null`). |
| 4 | `Open` | `Waiting for Requester` | IT Staff | Public `comment` is required; generates a `PublicComment`. |
| 5 | `In Progress` | `Waiting for Requester` | IT Staff | Public `comment` is required; generates a `PublicComment`. |
| 6 | `Waiting for Requester` | `In Progress` | IT Staff | Staff resumes active work. |
| 7 | `Waiting for Requester` | `Open` | IT Staff | Staff resets ticket to open queue. |
| 8 | `In Progress` | `Resolved` | IT Staff | **Resolution Gate**: requires `>= 1` Action Taken AND non-empty resolution `comment` (creates `PublicComment`); **sets `resolvedAt = NOW()`**. |
| 9 | `Resolved` | `Closed` | IT Staff | Final closure confirmation; preserves `resolvedAt`. |
| 10| `Closed` | `Reopened` | IT Staff | Exceptionally reopened; requires `reason` (creates `InternalNote`); **clears `resolvedAt` to `null`**. |
| 11| `Reopened` | `In Progress` | IT Staff | Staff resumes active work; ticket must have an assigned owner (`ownerId != null`); retains already-null `resolvedAt` value. |
| 12| `Reopened` | `Open` | IT Staff | Staff resets ticket to open pool; retains already-null `resolvedAt` value. |
| 13| `Reopened` | `Waiting for Requester` | IT Staff | Staff requests additional information; requires public `comment` (creates `PublicComment`); retains already-null `resolvedAt` value. |

*   **Distinct Comment-Driven Requester Transitions (Reconciled with Matrix):**
    *   The 13 transitions above govern explicit IT Staff transitions via `PATCH /api/staff/tickets/:id/status`. (Administrators receive `403 Forbidden`).
    *   In addition, the system supports two automated comment-driven transitions triggered exclusively by the owning Requester via `POST /api/tickets/:id/comments`:
        1.  `Waiting for Requester` $\rightarrow$ `Open`: Resumes ticket to open triage pool upon customer reply.
        2.  `Resolved` or `Closed` $\rightarrow$ `Reopened`: Reopens ticket upon customer follow-up. The customer's `PublicComment` content itself serves as the reopening explanation; no `InternalNote` is generated (preserving internal note privacy). Resets `resolvedAt = null` and updates parent `updatedAt = NOW()`.
*   **Atomic CAS & Side-Effect Transaction Implementation Pattern:**
    ```typescript
    try {
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

        // 3. Validate owner requirement for transitions requiring assigned owner
        if (['Open', 'In Progress'].includes(status) && !ticket.ownerId) {
          const err = new Error("Ticket must have an assigned owner before transitioning to Open or In Progress.");
          (err as any).status = 400;
          throw err;
        }

        // 4. Validate Resolution Gate within the transaction
        if (status === 'Resolved') {
          const actionCount = await tx.actionTaken.count({ where: { ticketId } });
          if (actionCount === 0) {
            const err = new Error("Resolution Gate failed: At least one Action Taken must be recorded before resolving this ticket.");
            (err as any).status = 400;
            throw err;
          }
          if (!comment || comment.trim() === '') {
            const err = new Error("Resolution comment is required.");
            (err as any).status = 400;
            throw err;
          }
        }

        // 5. Validate cancellation or reopen reason
        if (['Cancelled', 'Reopened'].includes(status) && (!reason || reason.trim() === '')) {
          const err = new Error(`${status} reason is required.`);
          (err as any).status = 400;
          throw err;
        }

        // 6. Validate required public comment for Waiting for Requester
        if (status === 'Waiting for Requester' && (!comment || comment.trim() === '')) {
          const err = new Error("Public comment is required when placing ticket in Waiting for Requester.");
          (err as any).status = 400;
          throw err;
        }

        // 7. Conditional update matching ticket ID, current status, and expected lastUpdatedAt token
        const updateResult = await tx.ticket.updateMany({
          where: {
            id: ticketId,
            status: ticket.status,
            updatedAt: new Date(lastUpdatedAt)
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
        if (comment && ['Waiting for Requester', 'Resolved'].includes(status)) {
          await tx.publicComment.create({
            data: { content: comment.trim(), ticketId, authorId: req.user.id }
          });
        }
        if (reason && ['Cancelled', 'Reopened'].includes(status)) {
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
    *   `400 Bad Request`: Missing `lastUpdatedAt`, invalid transition, missing owner, missing cancellation reason, missing required comment, or Resolution Gate failure.
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
    *   `Idempotency-Key`: UUIDv4 string (**optional** on all POST endpoints; if omitted, request executes normally without deduplication).
*   **Request Shape:**
    ```json
    {
      "content": "I restarted the router as requested and the error persists.",
      "lastUpdatedAt": "2026-11-01T08:30:00.000Z"
    }
    ```
*   **Validation Rules:**
    *   `content`: String, required, trimmed, min 1 char.
    *   `lastUpdatedAt`: ISO 8601 string, **mandatory** for concurrency validation. If omitted, returns `400 Bad Request` (`{ error: "lastUpdatedAt is required for concurrency validation." }`).
*   **Comment-Driven Status Transitions & Transaction Atomicity Implementation Pattern:**
    ```typescript
    try {
      let requestHash = '';
      if (idempotencyKey) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
          return res.status(400).json({ error: "Invalid Idempotency-Key header format. Must be UUIDv4." });
        }
        // Canonicalize payload: trim content, format timestamp, sort keys
        const canonicalPayload = {
          content: content?.trim(),
          lastUpdatedAt: lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : undefined
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
                updatedAt: new Date(lastUpdatedAt)
              },
              data: { status: 'Open', updatedAt: new Date() }
            });
            updateCount = res.count;
          } else if (['Resolved', 'Closed'].includes(ticket.status)) {
            const res = await tx.ticket.updateMany({
              where: {
                id: ticketId,
                status: ticket.status,
                updatedAt: new Date(lastUpdatedAt)
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
                updatedAt: new Date(lastUpdatedAt)
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
              updatedAt: new Date(lastUpdatedAt)
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
            content: content.trim(),
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
    *   `Idempotency-Key`: UUIDv4 string (**optional** on all POST endpoints; if omitted, request executes normally without deduplication).
*   **Request Shape:**
    ```json
    {
      "lastUpdatedAt": "2026-11-01T08:30:00.000Z"
    }
    ```
*   **Validation Rules:**
    *   `lastUpdatedAt`: ISO 8601 string, **mandatory** for concurrency validation. If omitted, returns `400 Bad Request` (`{ error: "lastUpdatedAt is required for concurrency validation." }`).
    *   Ticket status must be strictly `In Progress`. If in any other status, returns `400 Bad Request`.
*   **Atomic Transaction & Idempotency Implementation Pattern:**
    ```typescript
    try {
      let requestHash = '';
      if (idempotencyKey) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
          return res.status(400).json({ error: "Invalid Idempotency-Key header format. Must be UUIDv4." });
        }
        const canonicalPayload = {
          lastUpdatedAt: lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : undefined
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
            updatedAt: new Date(lastUpdatedAt)
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
    *   `400 Bad Request`: Missing `lastUpdatedAt`, ticket is not in `In Progress`, or invalid `Idempotency-Key` UUIDv4 format.
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
