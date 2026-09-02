# Lab 2 Test Plan and Results

## 1. Test Strategy
The testing strategy for Lab 2 employs a layered approach to ensure robust ticket management functionality. We will use Unit tests for business logic validation (e.g., file validation), API tests for backend endpoint contracts and data access controls, UI component tests for form behaviors and state management, and End-to-End (E2E) tests to verify critical user journeys across the simulated Dev Requester context.

## 2. Planned Tests

| Test ID | Type | AC | What It Tests | Expected Result | Automated Test File | Final Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| T-01 | UI | AC-01 | Dev requester selection persistence | User context is saved in local state and applied to subsequent actions. | `client/tests/lab-02/DevContext.test.tsx` | Pending |
| T-02 | API | AC-02 | Create ticket endpoint payload validation | Ticket is created with status "New", system-generated ID, and returns 201. | `server/tests/lab-02/tickets.api.test.ts` | Pending |
| T-03 | Unit | AC-03 | Attachment file type validation logic | Reject `.exe`, `.sh`, etc. Allow `.jpg`, `.png`, `.webp`, `.pdf`. | `server/tests/lab-02/utils/file-validator.test.ts` | Pending |
| T-04 | API | AC-04 | Attachment file size limit enforcement | Reject files > 5MB with HTTP 400 or 413 error. | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| T-05 | UI | AC-05 | Create Ticket / Detail UI attachment limit | The UI disables the upload button and shows a warning when 5 files are present. | `client/tests/lab-02/TicketForm.test.tsx` | Pending |
| T-06 | API | AC-06 | Soft delete attachment endpoint | Endpoint flags attachment as `isDeleted: true`; subsequent GET excludes it. | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| T-07 | API | AC-07 | Fetch tickets scoped to current requester | List endpoint strictly returns tickets matching the provided requester context. | `server/tests/lab-02/tickets.api.test.ts` | Pending |
| T-08 | UI | AC-08 | My tickets search and filter interactions | Table filters data locally or calls API correctly based on search input. | `client/tests/lab-02/MyTicketsList.test.tsx` | Pending |
| T-09 | E2E | AC-09 | Navigation from My Tickets to Detail | Clicking a table row successfully routes the user to `/tickets/:id`. | `client/tests/e2e/lab-02/ticket-flow.spec.ts` | Pending |
| T-10 | E2E | AC-10 | View ticket detail read-only data & files | Page displays all ticket fields correctly and lists active attachments without edit inputs. | `client/tests/e2e/lab-02/ticket-detail.spec.ts` | Pending |
| T-11 | API | AC-07 | Security: Deny access to other user's ticket | Returns 403 Forbidden when requesting a ticket not owned by Requester | `server/tests/lab-02/tickets-security.api.test.ts` | Pending |
| T-12 | API | AC-08 | My Tickets API pagination, sorting, filtering | Returns correctly sorted and filtered subset of records | `server/tests/lab-02/tickets-list.api.test.ts` | Pending |
| T-13 | UI | AC-08 | My Tickets UI pagination and sort controls | UI correctly interacts with API and updates data view | `client/tests/lab-02/MyTicketsList.test.tsx` | Pending |

## 3. Acceptance-Criterion Traceability

| Acceptance Criterion | Corresponding Test IDs |
| :--- | :--- |
| **AC-01** (Dev context persistence) | T-01 |
| **AC-02** (Create ticket flow) | T-02 |
| **AC-03** (Attachment type restriction) | T-03 |
| **AC-04** (Attachment size limit) | T-04 |
| **AC-05** (Attachment max limit) | T-05 |
| **AC-06** (Attachment soft-remove) | T-06 |
| **AC-07** (My Tickets scoped to user) | T-07, T-11 |
| **AC-08** (My Tickets search/filter) | T-08, T-12, T-13 |
| **AC-09** (My Tickets navigation) | T-09 |
| **AC-10** (Detail read-only view) | T-10 |

## 4. Responsive and Visual Checklist
- [ ] **Desktop (≥ 992px):** Data tables use full width, forms are centered or multi-column.
- [ ] **Tablet (768px - 991px):** Menus adapt, form fields stack where necessary.
- [ ] **Mobile (< 768px):** My Tickets switches to card view or scrollable table, sticky action buttons.
- [ ] **Theme Application:** "Zen Green Theme" colors (`#006B3C`, `#0B7A46`, `#EAF6EF`) are applied to buttons, headers, and active states.

## 5. Test Commands
*   **Unit & API Tests (Server):** `npm run test` (in `/server`)
*   **UI Tests (Client):** `npm run test` (in `/client`)
*   **E2E Tests:** `npm run test:e2e` (in `/client` or project root)

## 6. Final Results
*(To be updated upon completion of sprint implementation and testing phase)*
*   **Total Tests:** 13
*   **Passed:** 0
*   **Failed:** 0
*   **Coverage:** Pending%
