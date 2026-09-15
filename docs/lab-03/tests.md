# Lab 3 Test Plan

## 1. Overview
This document outlines the test strategy and planned test cases for Lab 3, covering stateful authentication, strict role-based authorization, IT Staff workflows, and Administrator user management. All tests map back to the Acceptance Criteria defined in `specification.md`.

## 2. Traceability & Test Scenarios

| Test ID | Type | Requirement / AC | Scenario | Expected Result | Planned Test File | Status |
|---|---|---|---|---|---|---|
| **AUTH-01** | API | AC-01 | Login with valid credentials | 200 OK, Set-Cookie header present with stateful Session token, returns user data | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **AUTH-02** | API | AC-02 | Login with invalid password | 401 Unauthorized, generic error message | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **AUTH-03** | API | AC-02 | Login with inactive account | 401 Unauthorized, generic error message | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **AUTH-04** | API | AC-03, AC-04 | First-login password change & Logout | API blocks normal routes until password changed; logout destroys session DB record and clears cookie | `server/tests/lab-03/auth.api.test.ts` | Planned |
| **AUTHZ-01**| API | AC-05 | Direct API access to other's ticket (Requester) | 404 Not Found (Non-enumeration policy) | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| **AUTHZ-02**| API | AC-08 | Administrator attempts to assign a ticket | 403 Forbidden (Admin has READ-ONLY access to tickets) | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| **AUTHZ-03**| API | AC-05, AC-06 | Administrator attempts to access Staff Queue | 403 Forbidden (Admin has strict role separation) | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| **AUTHZ-04**| API | AC-05 | Direct API access to unowned Attachment (Requester) | 404 Not Found (Non-enumeration policy) | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| **STAFF-01**| API | AC-07 | Staff queue pagination and filtering | Queue returns exact page sizes; filters by status correctly | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| **STAFF-02**| API | AC-07 | Staff queue sorting | Validates default sort (date desc) and custom sort (priority asc) | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| **STAFF-03**| API | AC-08 | Claim and Reassign ticket to active IT Staff | Owner updates successfully to provided IT Staff ID | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **STAFF-04**| API | AC-08 | Assign ticket to inactive user or non-IT Staff | 400 Bad Request, assignment rejected | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **STAFF-05**| API | AC-09 | Status transition validation | Invalid transitions (e.g., New to Resolved directly) return 400 Bad Request | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| **COMM-01** | API | AC-11 | Public comment immutability | Attempting to PATCH or DELETE a comment returns 404/403 | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **COMM-02** | API | AC-11 | Internal note immutability | Attempting to PATCH or DELETE a note returns 404/403 | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **COMM-03** | API | AC-12 | Requester triggers "Appears Resolved" on In Progress ticket | 201 Created, standardized comment appended, ticket status remains unchanged | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **COMM-04** | API | AC-12 | Requester triggers "Appears Resolved" on non-In Progress ticket | 400 Bad Request | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **COMM-05** | API | AC-10 | Requester posts comment on "Waiting for Requester" ticket | 201 Created, Ticket status automatically transitions to "Open" | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **COMM-06** | API | AC-10 | Requester posts comment on "Resolved" or "Closed" ticket | 201 Created, Ticket status automatically transitions to "Reopened" | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **NOTE-01** | API | AC-06 | Requester attempts to GET Internal Notes | 404 Not Found (or 403 Forbidden) | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **NOTE-02** | API | AC-06 | Requester attempts to POST Internal Note | 404 Not Found (or 403 Forbidden) | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **NOTE-03** | API | BR-03 | Administrator attempts to GET Internal Notes | 200 OK | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **NOTE-04** | API | AC-11, BR-03 | Administrator attempts to POST Internal Note | 403 Forbidden | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| **ADMIN-01**| API | AC-13 | Admin creates user with duplicate email | 409 Conflict | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **ADMIN-02**| API | AC-14 | Admin attempts self-deactivation | 400 Bad Request, operation aborted | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **ADMIN-03**| API | AC-15 | Last active admin deactivation | 400 Bad Request, system refuses | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **ADMIN-04**| API | AC-15 | Last active admin role change | 400 Bad Request, system refuses | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| **MIG-01**  | API | AC-16 | Data migration and regression | Verify Lab 2 ticket/attachment endpoints work with session auth | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| **UI-01**   | UI Component | AC-01, AC-02 | Login form rendering and validation | Renders properly, validates empty fields, shows error state safely | `client/src/components/Login.test.tsx` | Planned |
| **UI-02**   | UI Component | AC-03 | Change password form boundaries | Validates matching passwords, loading state during save | `client/src/components/ChangePassword.test.tsx` | Planned |
| **UI-03**   | UI Component | AC-07 | Staff Ticket Queue table | Renders data, triggers search/sort callbacks | `client/src/components/StaffTicketQueue.test.tsx` | Planned |
| **UI-04**   | UI Component | AC-08, AC-09 | Staff Ticket Detail controls | Status dropdown disables invalid options based on matrix | `client/src/components/StaffTicketDetail.test.tsx` | Planned |
| **UI-05**   | UI Component | AC-13, AC-14 | Admin User Management | Modal renders, handles duplicate email 409 conflict state gracefully | `client/src/components/UserManagement.test.tsx` | Planned |
| **E2E-01**  | E2E | AC-01, AC-04, AC-05 | Full Authentication lifecycle | Logs in, navigates role-specific UI, blocks URL hopping (404), logs out | `client/e2e/lab-03/authentication.spec.ts` | Planned |
| **E2E-02**  | E2E | AC-07, AC-08, AC-09 | Staff workflow end-to-end | Staff logs in, searches queue, claims ticket, updates status, adds note | `client/e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| **E2E-03**  | E2E | AC-13, AC-15 | User Administration | Admin logs in, creates Staff user, safely fails self-deactivation | `client/e2e/lab-03/user-administration.spec.ts` | Planned |
| **VIS-01**  | Visual/A11y | AC-17 | Responsive tables & Accessibility | Verify layout on Desktop, Tablet, and Mobile viewports (no horizontal overflow, usable layouts) and ensure controls/content pass accessibility checks. | UI adapts gracefully without overflow across all viewports; accessibility audit passes. | `client/e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |

## 3. Test Coverage Goals
*   **Security/Authorization:** High priority. Explicit authorization and security testing is required for Attachment endpoints, Administrator endpoints, Ticket ownership (non-enumeration 404), Internal Notes boundaries, role-based access controls, and unauthenticated/invalid session access. The planned tests focus explicitly on these critical boundaries.
*   **Business Logic:** Status transitions (including auto-transitions) and ownership validations must be completely unit/API tested.
*   **UI Components:** Focus on state changes (loading, success, error) rather than deep DOM manipulation.
*   **E2E:** Focus on the critical path (Login -> Queue -> Triage -> Logout).
