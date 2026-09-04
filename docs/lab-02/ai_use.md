# AI Usage Report (Lab 2)

## AI Tool Used
- **Primary AI Agent:** Gemini 3.1 Pro (via Antigravity / Blackbox IDE)
- **Role:** Full-stack coding assistant, spec-driven development partner, and testing generator.

## Selected key prompts (6–10)

| # | Prompt (summarised) | What I did with the result |
|---|---|---|
| 1 | "Context & Scope for Issue 4 (My Tickets List and Search)... Do NOT implement the detailed ticket view page... Maintain the exact same minimalist Zen Green UI theme." | Reviewed the generated paginated list, search, and filters. Verified that ownership isolation (`X-Requester-Id`) was correctly implemented in the backend. |
| 2 | "The current UI functionality is perfect, but I want to improve the layout by creating a unified Navigation Bar (Head bar)... Place Check System, Create Ticket, and My Tickets inside this new navigation bar." | Accepted the refactored `App.tsx` layout but noticed some vertical spacing and z-index issues which required a follow-up prompt to fix UI overlapping. |
| 3 | "My peer reviewer provided excellent feedback for Issue 4... Fix Duplicate Render of `<CreateTicket/>`... Add Pagination Tests... Add API Error Test." | Verified that the duplicate form render was removed and that the client-side tests reached 100% coverage (22/22 passing) including the new edge cases. |
| 4 | "Context & Scope for Issue 5 (Requester Ticket Detail View)... Ownership Check (Crucial): You MUST validate the `X-Requester-Id` header... The view must be STRICTLY read-only." | Manually tested the ticket detail view to ensure it successfully blocked cross-requester access (403 Forbidden) and correctly displayed the read-only fields. |
| 5 | "Context & Scope for Issue 6 (Attachment Management)... Implement soft-remove attachments (must include a removal reason)... Validate file type, max file size, and max attachment count." | Reviewed the Prisma schema migrations for soft deletes and tested the `multer` file upload constraints to ensure unsupported files were rejected. |
| 6 | "Task 1: Resolve Text Mismatch & UI Polish... STRICTLY USE: 'Create New Ticket' for the page header and 'Submit Ticket' for the submit button to fix Issue 1 test failures." | Confirmed that standardizing the copy across `ui-spec.md`, the React components, and the test files successfully resolved the regression test failures from Lab 1. |
| 7 | "Task 2: Playwright E2E Tests... Create `e2e/lab-02/requester-ticket-flow.spec.ts`... simulate a real user journey: Select Requester -> Create Ticket -> View in My Tickets -> View Detail -> Upload/Remove Attachment." | Ran the Playwright E2E tests to validate the complete user journey and ensured the automated grader would pass the full integration flow. |

## Reflection

Using the AI agent for Lab 2 was highly effective for accelerating boilerplate generation and implementing complex backend logic like file uploads (Multer) and pagination. However, this lab highlighted a crucial lesson in Spec-Driven Development: the AI is only as good as the strictness of its boundaries and the consistency of its context. 

For instance, an earlier mismatch between the UI text ("Create New IT Request") and the original test specification ("Create New Ticket") caused test failures that were difficult to trace initially. This taught me the importance of keeping the UI Code, Test Code, and the UI Spec Document perfectly aligned. Additionally, while the AI generated functional UI components quickly, visual QA remained a highly manual process. I had to issue specific follow-up prompts to fix z-index overlapping (the Check System popup) and margin issues caused by refactoring the Navbar. Ultimately, I learned that while the AI can write the code and tests, I must act as the strict orchestrator and reviewer to maintain architectural integrity and specification compliance.
