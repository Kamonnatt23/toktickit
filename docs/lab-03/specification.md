# Lab 3 Engineering Specification

## 1. Sprint Goal
The goal of this sprint is to introduce real authentication, role-based access control (RBAC), IT Staff workflows, and Administrator user management to TokTickIT. We will extend the Lab 2 foundation to support secure identity and ensure that Requesters can only access their own data, while providing IT Staff the tools needed to manage a shared ticket queue. 

## 2. Stakeholder Request
Stakeholders require the application to transition from the Lab 2 "Development Requester" mock authentication to a robust, secure authentication system. They need distinct roles for Requesters, IT Staff, and Administrators to facilitate proper ticket lifecycle management. Requesters must be securely isolated to their own tickets. IT Staff need a centralized queue to claim, assign, prioritize, and process tickets. Administrators need a minimalist interface to manage user accounts, while retaining read-only visibility into ticket workflows.

## 3. Scope

### Included
*   **Authentication:** Email/password login, logout with true session invalidation, mandatory first-login password change, stateful server-side session management, and safe generic error handling.
*   **Roles:** Exact one role per user (Requester, IT Staff, Administrator).
*   **Authorization:** Server-side enforcement of role-based access, ticket ownership boundaries, and safe error behavior.
*   **Requester Regression:** Preservation of Lab 2 functionality (Create Ticket, My Tickets, Ticket Detail, Attachments) but tied to the authenticated user. Removal of Development Requester UI in implementation later.
*   **Requester Additions:** Post Public Comments, indicate that a problem "appears resolved".
*   **IT Staff:** Shared Ticket Queue (search, filter, sort, paginate), Ticket Detail access, claim/assign tickets, update IT Priority, change ticket status, post Public Comments, and manage Internal Notes.
*   **Administrator:** Minimalist User Management (list users, search, create user, edit user details/role, activate/deactivate, set initial password). Read-only access to Staff Queue, Ticket Detail, Public Comments, and Internal Notes.
*   **Ticket Data Updates:** Support for ownership (primary owner), IT Priority, Public Comments, Internal Notes, and extended statuses.

### Explicitly Excluded
*   User deletion (use deactivation instead).
*   Multiple roles per user or role history.
*   Bulk operations for user management or tickets.
*   Self-registration, social login, SSO, MFA, email invitations, password-reset emails.
*   "Actions Taken" tracking (deferred to Lab 4).
*   Import/export of users or tickets.
*   Department management or advanced identity management.

## 4. Functional Requirements

*   **FR-01 [Authentication - Login]:** The system shall allow users to authenticate using an email and password via stateful server-backed sessions.
*   **FR-02 [Authentication - First Login]:** The system shall force users to change their password upon their first login (or when an Admin resets their initial password).
*   **FR-03 [Authentication - Logout]:** The system shall allow authenticated users to securely log out, instantly invalidating their session record on the server.
*   **FR-04 [Requester - Ticket Management]:** The system shall preserve Lab 2 Requester capabilities, ensuring users can only create, view, and manage attachments for tickets they own.
*   **FR-05 [Requester - Comments & Resolution]:** Requesters shall be able to post Public Comments. They shall also be able to indicate that a problem "appears resolved," which will automatically append a standardized Public Comment but will NOT change the ticket status to Resolved or Closed.
*   **FR-06 [Staff - Queue]:** The system shall provide IT Staff with a paginated, sortable, searchable, and filterable Ticket Queue.
*   **FR-07 [Staff - Ticket Operations]:** The system shall allow IT Staff to view any ticket, claim a ticket, assign/reassign it, update IT Priority, and change its status according to the transition matrix.
*   **FR-08 [Staff - Communication]:** The system shall allow IT Staff to post Public Comments (visible to Requester) and Internal Notes (hidden from Requester).
*   **FR-09 [Admin - User Management]:** The system shall allow Administrators to list, search, create, edit, activate/deactivate users, and set initial passwords.
*   **FR-10 [Admin - Ticket Read Visibility]:** Administrators shall have read-only visibility into the Staff Queue, Ticket Details, Public Comments, and Internal Notes.

## 5. Business Rules

### 5.1 General Rules
*   **BR-01 [Single Role]:** A user account must have exactly one role at any given time (Requester, IT Staff, Administrator).
*   **BR-02 [Data Isolation]:** Requesters can only retrieve or modify data associated with tickets they created.
*   **BR-03 [Role Separation & Admin Read-Only]:** Administrator and IT Staff responsibilities are conceptually separate. Administrators handle User Management and have read-only access to tickets, comments, and notes. Administrators do NOT inherit IT Staff ticket-operation permissions (cannot claim, assign, change status, or post comments/notes).

### 5.2 Authorization Matrix
*Enforced strictly on the server-side. Hidden UI is not security.*

| Feature / Action                     | Unauthenticated | Requester     | IT Staff | Administrator |
|--------------------------------------|-----------------|---------------|----------|---------------|
| Login                                | Allow           | Deny (Redirect)| Deny     | Deny          |
| Logout                               | Deny            | Allow         | Allow    | Allow         |
| Change Password (First Login)        | Deny            | Allow         | Allow    | Allow         |
| Create Ticket                        | Deny            | Allow         | Deny     | Deny          |
| View My Tickets                      | Deny            | Allow         | Deny     | Deny          |
| View Ticket Detail                   | Deny            | Allow (Own)   | Allow    | Allow         |
| Manage Attachments                   | Deny            | Allow (Own)   | Allow    | Deny          |
| View Public Comments                 | Deny            | Allow (Own)   | Allow    | Allow         |
| Post Public Comment                  | Deny            | Allow (Own)   | Allow    | Deny          |
| Indicate "Appears Resolved"          | Deny            | Allow (Own)   | Deny     | Deny          |
| View Internal Notes                  | Deny            | Deny          | Allow    | Allow         |
| Post Internal Notes                  | Deny            | Deny          | Allow    | Deny          |
| View Staff Queue                     | Deny            | Deny          | Allow    | Allow         |
| Claim / Assign / Reassign            | Deny            | Deny          | Allow    | Deny          |
| Update IT Priority & Status          | Deny            | Deny          | Allow    | Deny          |
| User Management (List/Create/Edit)   | Deny            | Deny          | Deny     | Allow         |

### 5.3 Ticket Ownership & Priorities
*   **BR-04 [Ticket Owner]:** A Ticket may have zero or one primary owner. The owner must be an active IT Staff.
*   **BR-05 [IT Priority]:** Upon ticket creation, IT Priority is initially a copy of the Requested Priority. Later, only IT Staff can change it.

### 5.4 Comments and Notes
*   **BR-06 [Append-Only Communication]:** Public Comments and Internal Notes are append-only. They cannot be edited or deleted.
*   **BR-07 [Content Validation]:** Empty or whitespace-only content for comments and notes must be rejected. The system must enforce a 2000-character limit and render safely.
*   **BR-08 [Author Trust]:** The author ID and creation timestamp must be securely determined by the backend from the authenticated session.
*   **BR-09 [Problem Appears Resolved]:** When a Requester indicates a problem "appears resolved", the system records this solely by generating a standardized Public Comment authored by the Requester (e.g., "The Requester indicates that the problem appears resolved."). It does NOT change the ticket status. Formal resolution remains strictly an IT Staff responsibility.

### 5.5 Administrator Safety Rules
*   **BR-10 [Unique Email]:** User email addresses must be unique across the system.
*   **BR-11 [Self-Deactivation]:** An Administrator cannot deactivate their own account.
*   **BR-12 [Last Admin]:** The system must not allow the deactivation or role change of the last active Administrator.

### 5.6 Status Transition Matrix

| Source Status         | Target Status       | Permitted Role    | Required Conditions / Validation                          |
|-----------------------|---------------------|-------------------|-----------------------------------------------------------|
| New                   | Open                | IT Staff          | Ticket must be claimed/assigned                           |
| New                   | Cancelled           | IT Staff          | Must provide a cancellation reason (Internal Note)        |
| Open                  | In Progress         | IT Staff          | Owner is actively working on it                           |
| Open, In Progress     | Waiting for Requester| IT Staff         | Must add a Public Comment explaining what is needed       |
| Waiting for Requester | Open                  | Requester         | Automatically transitions when Requester adds a comment   |
| Waiting for Requester | Open, In Progress   | IT Staff          | Staff resumes work                                        |
| In Progress           | Resolved            | IT Staff          | Must provide resolution details (Public Comment)          |
| Resolved              | Closed              | IT Staff          | Final confirmation that issue is permanently fixed        |
| Resolved, Closed      | Reopened            | Requester         | Automatically transitions when Requester adds a comment indicating issue persists |
| Closed                | Reopened            | IT Staff          | Only in exceptional cases                                 |
| *Any (Invalid)*       | *Any*               | *Any*             | Invalid transitions must be rejected safely by the API    |

### 5.7 Explicit Error Policy
The API enforces a strict, consistent error reporting policy to prevent data leakage and ID enumeration:
*   **401 Unauthenticated:** Missing, invalid, or expired session. Login attempts with unknown email, invalid password, or inactive account return a generic 401 ("Invalid credentials or account inactive") without revealing if the email exists.
*   **403 Forbidden:** Authenticated, but lacks the role for the endpoint entirely (e.g., Requester calling `/api/staff/tickets`, or Admin calling `PATCH /api/staff/tickets/:id/assign`).
*   **404 Not Found:** The resource does not exist, OR the user is requesting an ownership-protected resource (Ticket, Attachment) they do not own or lack permission to see. (Non-enumeration policy).
*   **400 Bad Request:** Validation failure or invalid request shape.
*   **409 Conflict:** Resource state conflict (e.g., duplicate email address).
*   **500 Internal Server Error:** Unexpected server-side failure.

## 6. UI Specification Summary
The UI extends Lab 2's "Zen Green" design language. 
*   **Global Shell:** Role-based navigation is enforced. The "Development Requester" selector is removed. A user profile/logout menu is added.
*   **Login & Password Change:** Clean, centralized forms with safe, non-revealing error states for auth failures.
*   **Requester View:** Preserves Lab 2, dynamically driven by session. Ticket Detail adds Public Comments and an "Appears Resolved" button (which merely submits a predefined comment).
*   **IT Staff Queue:** Robust data table supporting search, filter, sort, and pagination. 
*   **IT Staff Ticket Detail:** Comprehensive view for Staff to claim, update status/priority, and toggle between Public Comments and Internal Notes.
*   **Administrator Views:** Read-only access to the Staff Queue and Ticket Details. A separate robust interface for User Management (List, Add, Edit users).

*(Detailed in ui-spec.md)*

## 7. Data Changes
The Prisma schema requires the following updates:
1.  **User Model:** Migrate `RequesterUser` to a universal `User` model, adding password hash, `requiresPasswordChange` flag, and enforcing role constraints.
2.  **Session Model:** A model to store stateful backend sessions (e.g., `Session` table with token hash, userId, and lastActiveAt).
3.  **Ticket Model:** Add `ownerId` (relation to `User`), `itPriority`, and expand the `status` enum.
4.  **Communication Models:** Create new models for `PublicComment` and `InternalNote`, linked to a `Ticket` and an author `User`.

## 8. API Contract Summary
The API will transition to enforce authentication via stateful session cookies. 
*   **Auth Endpoints:** `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/change-password`
*   **Ticket Endpoints:** Infer user identity from session. Protect data ownership boundaries with 404s.
*   **Queue Endpoints:** `/api/staff/tickets` (Staff, Admin).
*   **Comments/Notes Endpoints:** Append-only structure, enforcing Internal Notes isolation.
*   **Admin Endpoints:** `/api/admin/users` for List, Create, Edit, Activate/Deactivate, and Reset Initial Password (Admin only).

*(Detailed in api-spec.md)*

## 9. Acceptance Criteria

*   **AC-01 [Valid Login]:** Given correct credentials and active account, the user successfully logs in and receives a secure stateful session cookie.
*   **AC-02 [Invalid Login]:** Given incorrect credentials or inactive account, returns a generic 401 without revealing if email exists.
*   **AC-03 [First-Login Password Change]:** Given a user flagged for a password change, blocks access to normal routes until password is changed.
*   **AC-04 [Logout]:** Clicking logout destroys the session record in the database and clears the cookie.
*   **AC-05 [Requester Data Isolation]:** Given a Requester, attempting to access or modify a ticket belonging to someone else returns a 404 Not Found to prevent enumeration.
*   **AC-06 [Internal Note Protection]:** Given a Requester, attempting to read or create an Internal Note returns a 404 Not Found or 403 Forbidden.
*   **AC-07 [Staff Queue]:** Given an IT Staff member (or Admin), they can view the queue, search, filter, sort, and paginate.
*   **AC-08 [Ticket Assignment]:** Given an IT Staff member, they can claim an unassigned ticket or assign it to another active IT Staff. Administrator attempting this receives 403.
*   **AC-09 [Status Transitions]:** Any state change must strictly follow the defined Status Transition Matrix; invalid attempts return a 400 Bad Request.
*   **AC-10 [Requester Automatic Transitions]:** Given a ticket in `Waiting for Requester`, `Resolved`, or `Closed`, a Requester posting a Public Comment automatically transitions the status back to `Open` or `Reopened`.
*   **AC-11 [Append-Only Comments/Notes]:** Attempting to edit or delete a Public Comment or Internal Note returns 404 or 403. Administrator attempting to create a comment or note receives 403.
*   **AC-12 [Appears Resolved]:** Given a Requester triggering "Appears Resolved", the system successfully appends a standardized Public Comment without changing the ticket status.
*   **AC-13 [Admin - Unique Email]:** Administrator creating a user with an existing email returns a 409 Conflict.
*   **AC-14 [Admin - Self-Deactivation Protection]:** Administrator attempting to deactivate their own account receives a 400 Bad Request.
*   **AC-15 [Admin - Last Admin Protection]:** Attempting to change role/deactivate the last active Administrator receives a 400 Bad Request.
*   **AC-16 [Regression & Migration]:** Existing Lab 2 Tickets and Attachments remain intact and successfully migrate to the new schema structures.

## 10. Product Definition of Done
1.  The approved specification (this document, API spec, UI spec, Test plan) is complete and reviewed.
2.  All ACs, Functional Requirements, and Business Rules are traceable to the test plan.
3.  Database migration perfectly preserves Lab 2 Ticket and Attachment data.
4.  Authentication is secure (passwords hashed, stateful sessions, safe error feedback).
5.  Authorization is enforced strictly on the backend following the explicit error policy (401/403/404).
6.  Requester ownership boundaries are thoroughly protected using non-enumeration (404) practices.
7.  Staff workflow rules and Admin safety rules are implemented and validated.
8.  Responsive and accessibility expectations established in Lab 2 are maintained.
9.  All tests mapped in `tests.md` are passing locally and in CI.

## 11. Assumptions and Decisions
*   **Decision - Authentication Strategy:** A true stateful backend session (stored in DB/Memory) will be used to correctly support a sliding 24-hour inactivity expiration and immediate true invalidation on logout. The session ID will be stored in an `HttpOnly`, `Strict` cookie.
*   **Decision - Password Hashing:** bcrypt or Argon2 will be used.
*   **Decision - Administrator Scope:** Administrator handles User Management and has READ-ONLY access to tickets, comments, and notes. They do not possess IT Staff operational privileges (no claiming, status updates, or posting comments/notes).
*   **Decision - Safe Error Policy:** `401` covers all login failures generically. `404 Not Found` enforces non-enumeration for unowned specific resources. `403 Forbidden` enforces endpoint-level role denial.
*   **Decision - "Appears Resolved" Behavior:** The "Appears Resolved" action merely appends a standardized Public Comment. Formal status resolution remains firmly with IT Staff.
*   **Decision - Requester Automatic Status Transitions:** If a ticket is `Waiting for Requester`, a new comment from the Requester automatically transitions it to `Open`. If `Resolved` or `Closed`, it transitions to `Reopened`.
