# AI Usage Report (Lab 3)

## AI Tool Used
- **Primary AI Agent:** Gemini 3.1 Pro (via Antigravity / Blackbox IDE)
- **Role:** Full-stack coding assistant, spec-driven development partner, testing/debugging assistant, and documentation helper.

## Selected key prompts

| # | Prompt / workflow summary | What I did with the result |
|---|---|---|
| 1 | Prompt focused on generating the Lab 3 API/UI specification, test plan, and traceability matrix based on Issue 1 requirements. | Reviewed the generated markdown documents to ensure they met the lab requirements and covered all Acceptance Criteria before peer review. |
| 2 | Prompt focused on implementing database schema changes, seeding new roles (IT Staff, Admin), and writing migration tests while preserving existing Lab 2 data (Issue 2). | Verified that the Prisma schema properly mapped to the physical `RequesterUser` table. Ran the migration and confirmed existing attachment and ticket data was safely retained. |
| 3 | Prompt focused on implementing the authentication backend, session management, and the password-change API (Issue 3). | Reviewed the backend logic to ensure session tokens were securely generated and password changes updated the `requiresPasswordChange` flag correctly. |
| 4 | Prompt focused on building the React authentication UI, AuthContext session integration, and role-based navigation logic (Issue 4). | Validated the UI behavior, ensuring users were redirected to their respective dashboards based on their roles and unauthenticated users were prompted to log in. |
| 5 | Prompt focused on enforcing role-based authorization rules across existing APIs and fixing the ticket access regression to comply with the non-enumeration policy (Issue 5). | Verified that unauthorized access returned `404 Not Found` instead of `403` for ownership-protected resources, strictly adhering to the specification. |
| 6 | Prompt focused on implementing the Staff Queue UI, sorting, pagination, Assigned To filtering, and corresponding backend logic (Issue 6). | Requested the AI to fix missing pagination numbers and assignee dropdowns based on reviewer feedback. Ensured the sorting mechanism was verified in tests. |
| 7 | Prompt focused on creating the Staff Ticket Detail view, ticket assignment, IT Priority updates, status transitions, and Admin read-only behavior (Issue 7). | Verified the AI's implementation of Admin read-only access and fixed the frontend relation-loss bug by ensuring the ticket was fully refetched after mutations. |
| 8 | Prompt focused on adding Public Comments, Internal Notes, and append-only database testing (Issue 8). | Kept the AI's implementation aligned with the strict specification by rejecting a peer review suggestion to allow Admin posting. Directed the AI to write true append-only tests. |
| 9 | Prompt focused on building the Admin User Management UI/API, handling duplicate emails, and implementing last-active-Administrator safeguards (Issue 9). | Guided the AI to add missing database-level tests for the last-active-Admin safeguards to pass peer review, and fixed race conditions in tests. |
| 10 | Prompt focused on final E2E coverage, responsive viewports, URL-hopping isolation, and release verification (Issue 10). | Worked with the AI to fix parallel test isolation issues by carefully scoping teardowns. Ensured screenshot evidence was accurately captured across 3 viewports, and corrected a real production bug in StaffTicketDetail.tsx (/api/admin/users -> /api/staff/users) discovered during Staff tests. |

## Reflection

- **Accelerated Implementation:** AI significantly accelerated the implementation of both the frontend UI components and the backend API, as well as the generation of the comprehensive Vitest and Playwright test suites.
- **Spec-driven Boundaries:** Establishing spec-driven boundaries early on was important. The AI was able to adhere to these boundaries when instructed, which helped maintain a stable architecture.
- **Peer Review Value:** Peer review repeatedly exposed mismatches in authorization rules, missing cleanup routines in tests, incomplete responsive coverage, and traceability gaps. AI output is not perfect out of the box and requires manual checking against the approved specification.
- **Handling Conflicting Requirements:** Review comments sometimes conflicted with the approved contract, so the specification had to be checked before changing behavior. A concrete example of this is PR #50 (Issue 8), where the reviewer suggested allowing Admins to post Public Comments, but I chose to keep the AI's original implementation because the spec explicitly defined Admin access as read-only.
- **Integration Challenges:** Final integration testing (Issue 10) exposed real cross-issue and runtime issues (such as `require('bcrypt')` dynamic loading errors in an ESM environment and race conditions from shared mock users).
- **Final Result Orchestration:** The final result required careful orchestration, thorough regression testing, and precise evidence collection rather than assuming each Issue worked independently. The AI was a powerful tool for fixing these integration bugs once they were identified through systematic testing.
