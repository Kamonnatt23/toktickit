# Lab 3 API Specification

## 1. Authentication Design
*   **Password Hashing Approach:** Passwords will be strictly hashed using `bcrypt` (minimum salt factor 10) before storage. Plaintext passwords will never be stored or logged.
*   **Session Approach:** The API will use stateful server-side sessions. The server generates a secure random session token. The *hash* of this token is stored in the database alongside a `userId` and `lastActiveAt` timestamp.
*   **Storage Behavior:** The raw session token is sent to the client via an `HttpOnly`, `Secure` (in production), and `SameSite=Strict` cookie to prevent Cross-Site Scripting (XSS) extraction.
*   **Expiration:** Sessions will expire after 24 hours of inactivity. The backend will validate and extend the `lastActiveAt` timestamp on incoming requests.
*   **Logout Invalidation:** The `/api/auth/logout` endpoint will definitively destroy the session hash record in the database *and* clear the cookie from the client.
*   **CSRF Considerations:** Because `SameSite=Strict` is used, cross-site request forgery is heavily mitigated.
*   **Safe Error Behavior (Explicit Policy):**
    *   **401 Unauthenticated:** Missing, invalid, or expired session. Login attempts with unknown email, invalid password, or inactive account return a generic 401 ("Invalid credentials or account inactive") without revealing if the email exists.
    *   **403 Forbidden:** Authenticated, but lacks the required role for the endpoint entirely.
    *   **404 Not Found (Non-Enumeration):** Resource doesn't exist, OR the user is requesting an ownership-protected resource (Ticket, Attachment, Note) they are not permitted to see.
    *   **400 Bad Request:** Validation failure, invalid transition, or invalid request shape.
    *   **409 Conflict:** Resource state conflict (e.g., duplicate email address).
    *   **500 Internal Server Error:** Unexpected backend failure.
*   **Secret Handling:** Database connection strings will be managed securely via environment variables.

## 2. Queue Query Behavior (Staff Queue)
*   **Searchable Fields:** Ticket ID (exact match on numeric part) and Summary (case-insensitive partial match).
*   **Filterable Fields:** `status` (exact match), `categoryId`, `ownerId`.
*   **Sortable Fields:** `createdAt`, `priority`, `itPriority`, `status`.
*   **Default Ordering:** `createdAt` descending (newest first).
*   **Page Size:** Configurable via query parameter `limit` (default: 10, max: 50).
*   **Pagination Metadata:** Responses will include `total`, `page`, `limit`, and `totalPages`.
*   **Invalid Query Parameters:** Invalid sorts or filters will safely ignore the invalid parameter or fallback to defaults without throwing a 500 error.

## 3. Endpoints

### 3.1 Authentication

#### POST `/api/auth/login`
*   **Purpose:** Authenticate user and issue stateful session cookie.
*   **Auth Requirement:** None.
*   **Request Shape:** `{ "email": "user@example.com", "password": "securepassword" }`
*   **Response Shape:** `{ "id": 1, "email": "user@example.com", "role": "Requester", "requiresPasswordChange": false }`
*   **Success Status:** `200 OK` (with `Set-Cookie` header containing raw token).
*   **Errors:** `400` (missing fields), `401` (invalid credentials or inactive account, without revealing email existence), `500` (unexpected error).

#### POST `/api/auth/logout`
*   **Purpose:** Invalidate session definitively.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** All.
*   **Response Shape:** `{ "message": "Logged out successfully" }`
*   **Success Status:** `200 OK` (destroys DB session record and clears cookie).

#### GET `/api/auth/me`
*   **Purpose:** Retrieve current authenticated user.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** All.
*   **Response Shape:** `{ "id": 1, "email": "user@example.com", "role": "IT Staff", "name": "Alice", "requiresPasswordChange": false }`
*   **Success Status:** `200 OK`.
*   **Errors:** `401` (unauthorized/no valid session).

#### POST `/api/auth/change-password`
*   **Purpose:** Complete mandatory first-login password change.
*   **Auth Requirement:** Required (even if `requiresPasswordChange` is true).
*   **Permitted Roles:** All.
*   **Request Shape:** `{ "oldPassword": "old", "newPassword": "new" }`
*   **Success Status:** `200 OK`.
*   **Errors:** `400` (validation), `401` (wrong old password).

### 3.2 Tickets (Requester & Staff Shared)

#### POST `/api/tickets`
*   **Purpose:** Create a new ticket.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester.
*   **Request Shape:** `{ "categoryId": 1, "relatedSystemId": 1, "summary": "Issue", "priority": "High", "description": "Details", "attachmentIds": [1, 2] }`
*   **Response Shape:** Created ticket object.
*   **Success Status:** `201 Created`.
*   **Errors:** `400` (validation), `403` (forbidden role).

#### GET `/api/tickets` (Requester)
*   **Purpose:** Fetch requester's own tickets.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester.
*   **Parameters:** `search`, `status`, `page`, `limit`, `sortBy`, `sortOrder`.
*   **Response Shape:** `{ "data": [ticketObjects], "pagination": { ... } }`
*   **Success Status:** `200 OK`.
*   **Errors:** `401`, `403`.

#### GET `/api/tickets/:id` (Requester, Staff, Admin)
*   **Purpose:** Get ticket details.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester (own tickets only), IT Staff (all), Administrator (all, read-only).
*   **Response Shape:** Ticket object with relations (category, system, attachments).
*   **Success Status:** `200 OK`.
*   **Errors:** `404` (ticket not found, OR requested by a Requester who does not own it - non-enumeration policy).

### 3.3 IT Staff Ticket Operations

#### GET `/api/staff/tickets`
*   **Purpose:** Fetch shared ticket queue.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** IT Staff, Administrator (read-only).
*   **Parameters:** Query parameters as defined in Section 2.
*   **Success Status:** `200 OK`.
*   **Errors:** `403` (forbidden for Requesters).

#### PATCH `/api/staff/tickets/:id/assign`
*   **Purpose:** Claim or assign/reassign a ticket.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** IT Staff. (Administrators denied).
*   **Request Shape:** `{ "ownerId": 5 }` (Send null to unassign).
*   **Success Status:** `200 OK`.
*   **Errors:** `400` (invalid owner ID, owner not active IT Staff), `403` (forbidden for Requesters/Admins), `404` (not found).

#### PATCH `/api/staff/tickets/:id/status`
*   **Purpose:** Update ticket status (and IT Priority).
*   **Auth Requirement:** Required.
*   **Permitted Roles:** IT Staff. (Administrators and Requesters denied).
*   **Request Shape:** `{ "status": "In Progress", "itPriority": "High" }`
*   **Success Status:** `200 OK`.
*   **Errors:** `400` (invalid transition based on matrix), `403` (forbidden), `404` (not found).

### 3.4 Comments & Notes

#### GET `/api/tickets/:id/comments`
*   **Purpose:** Fetch public comments.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester (own tickets only), IT Staff, Administrator.
*   **Success Status:** `200 OK`.
*   **Errors:** `404` (not found or unowned ticket).

#### POST `/api/tickets/:id/comments`
*   **Purpose:** Create a public comment. If Ticket is `Waiting for Requester`, auto-transitions Ticket status to `Open`. If Ticket is `Resolved` or `Closed`, the mere submission of a comment automatically transitions it to `Reopened`.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester (own tickets only), IT Staff. (Administrators denied).
*   **Request Shape:** `{ "content": "Did you try turning it off?" }`
*   **Success Status:** `201 Created`.
*   **Errors:** `400` (empty content), `403` (Administrators denied), `404` (unowned/not found).

#### POST `/api/tickets/:id/appears-resolved`
*   **Purpose:** Allow a Requester to indicate the problem appears resolved. Generates a standardized Public Comment authored by the Requester but DOES NOT change the ticket status.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester (own tickets only).
*   **Request Shape:** `{}` (empty body).
*   **Success Status:** `201 Created` (returns the generated comment).
*   **Errors:** `400` (ticket is not strictly `In Progress`), `403` (forbidden), `404` (unowned/not found).

#### GET `/api/tickets/:id/notes`
*   **Purpose:** Fetch internal notes.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** IT Staff, Administrator.
*   **Success Status:** `200 OK`.
*   **Errors:** `403` (forbidden for Requesters), `404` (not found).

#### POST `/api/tickets/:id/notes`
*   **Purpose:** Create an internal note.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** IT Staff. (Administrators denied).
*   **Request Shape:** `{ "content": "Server is fried." }`
*   **Success Status:** `201 Created`.
*   **Errors:** `400` (empty), `403` (forbidden for Requesters/Admins), `404` (not found).

### 3.5 Attachments

#### POST `/api/attachments`
*   **Purpose:** Upload a new attachment and optionally link it to a ticket.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester (own tickets only), IT Staff. (Administrators denied from uploading).
*   **Ownership Rule:** If a `ticketId` is provided, the user must be IT Staff or the Requester who owns the ticket.
*   **Request Shape:** `multipart/form-data` with `file` and optional `ticketId`.
*   **Response Shape:** Created attachment object (metadata only).
*   **Success Status:** `201 Created`.
*   **Errors:** `400` (invalid file type/size, too many attachments), `403` (Admin upload attempt), `404` (ticket not found / unowned non-enumeration).

#### GET `/api/attachments/:id`
*   **Purpose:** Fetch metadata for a specific attachment.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester, IT Staff, Administrator.
*   **Ownership Rule:** If linked to a ticket, Requester must own the ticket. IT Staff/Admin can view all.
*   **Response Shape:** Attachment metadata object.
*   **Success Status:** `200 OK`.
*   **Errors:** `404` (attachment not found, or linked ticket unowned by Requester - non-enumeration).

#### GET `/api/attachments/:id/download`
*   **Purpose:** Download the raw file contents of an attachment.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester, IT Staff, Administrator.
*   **Ownership Rule:** Same as metadata (Requester must own the associated ticket).
*   **Response Shape:** Raw file stream (e.g., `image/jpeg`, `application/pdf`).
*   **Success Status:** `200 OK` (with `Content-Disposition: attachment`).
*   **Errors:** `404` (file not found on disk, or attachment/ticket not found/unowned).

#### DELETE `/api/attachments/:id`
*   **Purpose:** Soft-delete an attachment and record the removal reason.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Requester (own tickets only), IT Staff. (Administrators denied).
*   **Ownership Rule:** Requester can only delete attachments linked to their own ticket.
*   **Request Shape:** `{ "removalReason": "Uploaded wrong file" }`
*   **Response Shape:** Empty.
*   **Success Status:** `204 No Content`.
*   **Errors:** `400` (missing reason), `403` (Admin attempt), `404` (attachment/ticket not found/unowned).

### 3.6 Administrator User Management

#### GET `/api/admin/users`
*   **Purpose:** List users.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Administrator.
*   **Parameters:** `search`, `role`, `page`, `limit`.
*   **Success Status:** `200 OK`.
*   **Errors:** `403` (forbidden for IT Staff/Requesters).

#### POST `/api/admin/users`
*   **Purpose:** Create a new user.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Administrator.
*   **Request Shape:** `{ "name": "Bob", "email": "bob@example.com", "role": "IT Staff", "initialPassword": "tempPassword" }`
*   **Success Status:** `201 Created`.
*   **Errors:** `400` (validation), `403` (forbidden), `409` (conflict: duplicate email).

#### PATCH `/api/admin/users/:id`
*   **Purpose:** Update user details, role, or activation state.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Administrator.
*   **Request Shape:** `{ "name": "Bob", "email": "bob2@example.com", "role": "IT Staff", "isActive": false }`
*   **Success Status:** `200 OK`.
*   **Errors:** `400` (self-deactivation, last admin modification), `403` (forbidden), `404` (user not found), `409` (duplicate email).

#### POST `/api/admin/users/:id/reset-password`
*   **Purpose:** Set a new initial password for a user.
*   **Auth Requirement:** Required.
*   **Permitted Roles:** Administrator.
*   **Request Shape:** `{ "newPassword": "newTempPassword" }`
*   **Success Status:** `200 OK`. (Automatically sets `requiresPasswordChange` to true).
*   **Errors:** `404` (user not found).
