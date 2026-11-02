# Lab 4 UI Specification

## 1. Design Language & Visual Tokens
The application continues to adhere strictly to the **Zen Green** design language established in Lab 2 and refined in Lab 3:
*   **Primary Brand Color:** `#006B3C` (Forest Zen Green).
*   **Background Tone:** Off-white / Cream `#fdfaf6` for cards, `#ffffff` for elevated containers and modal surfaces, `#f8f9fa` for secondary backgrounds.
*   **Typography:** System sans-serif (`Inter`, `-apple-system`, `BlinkMacSystemFont`), font weights 400 (regular), 600 (semibold), 700/800 (bold).
*   **Corner Radii:** `50rem` (pill radius) for primary buttons, tags, and badges; `15px` to `20px` for card containers; `12px` for inputs and modals.
*   **Status Color Tokens:**
    *   `New`: `bg-primary text-white` (Blue)
    *   `Open`: `bg-primary text-white` (Blue)
    *   `In Progress`: `bg-info text-dark` (Cyan/Teal)
    *   `Waiting for Requester`: `bg-warning text-dark` (Amber/Yellow - Action Required)
    *   `Resolved`: `bg-success text-white` (Green)
    *   `Closed`: `bg-secondary text-white` (Slate Grey)
    *   `Reopened`: `bg-danger text-white` (Crimson)
    *   `Cancelled`: `bg-dark text-white` (Dark Charcoal)
*   **Priority Color Tokens:**
    *   `Low`: `bg-secondary text-white`
    *   `Medium`: `bg-primary text-white`
    *   `High`: `bg-warning text-dark`
    *   `Critical`: `bg-danger text-white`

---

## 2. Global Shell & Role-Based Navigation
The top navigation bar retains the brand logo (`TokTickIT IT Service Desk`) and displays dynamic, role-appropriate navigation buttons with clear active states (`btn-success fw-bold` for active tab, `btn-outline-success` for inactive tabs).

### 2.1 Navigation Structure by Role
*   **Requester Navigation:**
    *   `Dashboard` (Active tab: `'dashboard'`) -> Navigates to Requester Dashboard.
    *   `My Tickets` (Active tab: `'list'` or `'detail'`) -> Navigates to My Tickets list.
    *   `Create Ticket` (Active tab: `'create'`) -> Navigates to Ticket Creation form.
*   **IT Staff Navigation:**
    *   `Dashboard` (Active tab: `'dashboard'`) -> Navigates to IT Staff Dashboard.
    *   `Ticket Queue` (Active tab: `'queue'` or `'detail'`) -> Navigates to Staff Queue.
    *   *(Note: Ticket Creation is omitted from Staff navigation per RBAC).*
*   **Administrator Navigation:**
    *   `Dashboard` (Active tab: `'dashboard'`) -> Navigates to Admin Dashboard (`/api/dashboard/admin`).
    *   `User Management` (Active tab: `'users'`) -> Navigates to User Administration.
    *   `Ticket Queue` (Active tab: `'queue'` or `'detail'`) -> Navigates to Staff Queue.

### 2.2 User Profile & Session Controls
*   Right-aligned container displaying user name in bold (`#212529`), role subtitle (`Requester`, `IT Staff`, `Administrator`), and an accessible circular outline button (`40px` diameter, `aria-label="Log out"`) triggering `logout` with a confirmation icon (`bi-box-arrow-right`).

---

## 3. Requester Dashboard Screen

### 3.1 Layout Structure
1.  **Welcome Header:**
    *   Heading: `"Welcome, {user.name}!"`
    *   Subtext: `"Here's the latest on your IT service requests."`
2.  **Operational Metric Cards (5 Cards across responsive grid):**
    *   **Card 1 - My Open Tickets:** Total active open tickets (`New`, `Open`, `In Progress`, `Waiting for Requester`, `Reopened`). **Direct drill-down navigates to `/tickets?view=open`, strictly excluding Closed and Cancelled tickets.**
    *   **Card 2 - Action Required (Waiting on You):** High-salience card highlighted with amber accent border displaying count of tickets in `Waiting for Requester`. Direct drill-down to `/tickets?status=Waiting for Requester`.
    *   **Card 3 - In Progress:** Active work count. Direct drill-down to `/tickets?status=In Progress`.
    *   **Card 4 - Recently Resolved:** Count of tickets where `status == 'Resolved'` and `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - 30 days`. Direct drill-down to `/tickets?status=Resolved&withinDays=30`. Legacy tickets with `resolvedAt = NULL` are excluded.
    *   **Card 5 - Closed:** Total archived tickets. Direct drill-down to `/tickets?status=Closed`.
    *   *Card Anatomy:* Number displayed in extra-large bold font (`fs-1 fw-bolder text-success`), descriptive label, and `"View all →"` drill-down link.
3.  **Two Structured Activity Lists & Quick Actions:**
    *   **List 1 - Recently Updated Tickets:**
        *   Card displaying up to 5 tickets owned by requester sorted strictly by `updatedAt DESC`.
        *   Each row shows Ticket # (e.g. `TKT-014`), summary, status badge, priority badge, and relative update date/time rendered in client local timezone (e.g. `"Updated May 12, 09:14 AM"`).
        *   Row click navigates directly to Ticket Detail (`activeTab = 'detail'`, `selectedTicketId = id`).
    *   **List 2 - Recently Resolved Tickets (30-Day Boundary via `resolvedAt`):**
        *   Card displaying up to 5 tickets owned by requester with `status == 'Resolved'` and `resolvedAt IS NOT NULL AND resolvedAt >= NOW() - 30 days`, sorted strictly by **`resolvedAt DESC`**.
        *   Each row shows Ticket #, summary, resolution date formatted from `resolvedAt`, and a prompt: `"Issue resolved? If problem persists, open ticket and reply to reopen."`
    *   **Quick Actions Panel:**
        *   `+ Create Ticket`: Large Zen Green button navigating to `activeTab = 'create'`.
        *   `View My Tickets`: Secondary outline button navigating to `activeTab = 'list'`.

### 3.2 Requester Dashboard States
1.  **Loading State:** Metric cards render pulsing skeleton placeholders (`.placeholder-glow`) and list rows render skeleton bars while initial `GET /api/dashboard/requester` request is in flight.
2.  **Empty State (0 Tickets):** When the user has 0 tickets:
    *   All metric cards render `0`.
    *   Lists render a Zen Green empty container: `"No tickets submitted yet. Need help? Create your first ticket!"` with a prominent `+ Create Ticket` button.
3.  **Forbidden State:** If a non-requester attempts to access this view, UI displays an access-denied card: `"Access Denied: Requester dashboard is available only to Requesters. [Go to Staff Dashboard]"`.
4.  **Safe Failure State:** If the dashboard API returns 500 or a network error occurs, UI displays a graceful error alert: `"Unable to load dashboard data. [Retry]"` without unhandled crash or broken React state.

---

## 4. IT Staff Dashboard Screen

### 4.1 Layout Structure
1.  **Welcome Header:**
    *   Heading: `"Welcome back, {user.name}!"`
    *   Subtext: `"Here's what's happening with your queue today."`
    *   Refresh Button: Circular icon button on the right (`aria-label="Refresh dashboard data"`) to manually reload live dashboard counts.
2.  **Operational Metric Cards (6 Cards across responsive grid):**
    *   *Active Triage Definition:* Tickets in `Resolved`, `Closed`, and `Cancelled` represent completed work and are strictly excluded from active staff triage counts. Tickets in `Reopened` represent active work and are included.
    *   **Card 1 - Unassigned:** **Visible, high-salience metric card** displaying total unassigned active tickets (`ownerId IS NULL AND status NOT IN ('Resolved', 'Closed', 'Cancelled')`). Includes unassigned Reopened tickets. Purple/amber border accent. Drill-down link: `"Assign queue →"` navigating to `StaffQueue` filtered by `ownerId=Unassigned`.
    *   **Card 2 - My Assigned:** Total active tickets assigned to the logged-in staff member (`ownerId == user.id AND status NOT IN ('Resolved', 'Closed', 'Cancelled')`). Includes assigned Reopened tickets. Drill-down link: `"My tickets →"` navigating to `StaffQueue` filtered by `ownerId={user.id}`.
    *   **Card 3 - New:** Newly reported tickets requiring initial review (`status == 'New'`). Drill-down link to `StaffQueue` filtered by `status=New`.
    *   **Card 4 - Open:** Acknowledged tickets ready for work (`status == 'Open'`). Drill-down link to `StaffQueue` filtered by `status=Open`.
    *   **Card 5 - In Progress:** Tickets actively being serviced (`status == 'In Progress'`). Drill-down link to `StaffQueue` filtered by `status=In Progress`.
    *   **Card 6 - Waiting for Requester:** Tickets awaiting customer response (`status == 'Waiting for Requester'`). Drill-down link to `StaffQueue` filtered by `status=Waiting for Requester`.
3.  **Active Priority Distribution Component:**
    *   Compact visual bar / pill badges summarizing active unresolved tickets (`status NOT IN ('Resolved', 'Closed', 'Cancelled')`) by IT Priority:
        *   `Critical`: Red pill badge with count (drill-down: `/staff/tickets?itPriority=Critical&scope=active`)
        *   `High`: Amber pill badge with count (drill-down: `/staff/tickets?itPriority=High&scope=active`)
        *   `Medium`: Blue pill badge with count (drill-down: `/staff/tickets?itPriority=Medium&scope=active`)
        *   `Low`: Grey pill badge with count (drill-down: `/staff/tickets?itPriority=Low&scope=active`)
4.  **Recently Updated Queue & Quick Actions:**
    *   **Recently Updated Queue Table:**
        *   Card displaying top 5 recently modified tickets across the service desk, sorted by `updatedAt DESC`.
        *   Columns: Ticket #, Summary, Status badge, IT Priority badge, Assigned Owner, Last Updated timestamp (client local timezone).
        *   Row click navigates directly to Staff Ticket Detail (`activeTab = 'detail'`, `selectedTicketId = id`).
    *   **Quick Actions Panel (Authorized Staff Actions Only):**
        *   `Search Tickets`: Button focusing queue search bar.
        *   `My Queue`: Direct shortcut to `StaffQueue` filtered by `ownerId = user.id`.
        *   `Unassigned Queue`: Direct shortcut to `StaffQueue` filtered by `ownerId = Unassigned`.
        *   *(Note: `+ Create Ticket` is strictly omitted from Staff Dashboard per TokTickIT RBAC rules).*
5.  **Administrator Dashboard Integration:**
    *   When an Administrator logs in, the dashboard accesses `/api/dashboard/admin` and renders the IT Staff operational metrics plus an auxiliary **User Administration Summary** card showing all five user counts:
        *   **Total Users count**, Active Requesters count, Active IT Staff count, Active Admins count, and Inactive Accounts count.
        *   A `"Manage Users →"` button directly opening the User Management console (`activeTab = 'users'`).

### 4.2 IT Staff & Administrator Dashboard States
1.  **Loading State:** Metric cards render pulsing skeletons while fetching `/api/dashboard/staff` (or `/api/dashboard/admin` for Administrators). For Administrators, the User Administration summary card also renders skeleton bars while user statistics are in flight.
2.  **Empty State:** If the service desk queue has 0 active tickets:
    *   Metric cards render `0`.
    *   Queue table displays: `"No active tickets in queue. Great job! All issues are currently resolved."`
3.  **Forbidden State:** If a Requester accesses `/api/dashboard/staff`, UI renders access-denied banner.
4.  **Safe Failure State:** Network/API failure renders an alert with a `"Retry Loading Dashboard"` button.

---

## 5. Actions Taken on Ticket Detail

### 5.1 Placement & Deterministic Ordering
*   On **Staff Ticket Detail** ([`StaffTicketDetail.tsx`](../../client/src/components/StaffTicketDetail.tsx)): Positioned in the main left column directly below the ticket description and attachments card, and **above** the `CommunicationArea`.
*   On **Requester Ticket Detail** ([`TicketDetail.tsx`](../../client/src/components/TicketDetail.tsx)): Positioned below attachments and **above** the restored `CommunicationArea`.
*   **Timeline Ordering:** Rendered in strictly deterministic chronological order: **`actionDateTime ASC, id ASC`**.

### 5.2 Actions Taken Timeline / Table View
*   **Header:** Section title `"Actions Taken"`, with an item count badge (e.g. `Actions Taken (3)`).
*   **Staff Controls:** Prominent `+ Add Action Taken` button in the section header (visible only to `IT Staff` and `Administrator`).
*   **Item Card Components:**
    *   **Top Bar:** Action Date/Time formatted in client local timezone (e.g. `Nov 1, 2026, 09:30 AM`), Performed By badge (`"Recorded by: {performedBy.name}"` in `#006B3C` pill).
    *   **Action Description:** Formatted text block with pre-wrap whitespace preservation.
    *   **Result:** Result text block highlighted with subtle green tint (`bg-success bg-opacity-10 p-2 rounded`).
    *   **Follow-Up Indicator:**
        *   If `followUpRequired === true`: Amber pill badge `Follow-Up Required` accompanied by the `followUpNote` text block.
        *   If `followUpRequired === false`: Subdued grey pill `No follow-up needed`.
    *   **Attachment Notes:** If present, a paperclip note badge: `📎 File Reference: {attachmentNotes}`.
    *   **Action Controls (IT Staff and Admin only):**
        *   `Edit Action` button (`btn-sm btn-outline-secondary`, `aria-label="Edit Action Taken"`) opening the Edit modal.
        *   `View History` button (`btn-sm btn-outline-info`, `aria-label="View Action Taken Revision History"`) opening the read-only Revision History modal.
*   **Empty State:** When 0 actions exist:
    *   For Staff: Light grey bordered box: `"No actions recorded yet. Click '+ Add Action Taken' to log initial technical work."`
    *   For Requesters: `"No actions recorded yet. IT Staff will log updates here as work progresses."`

### 5.3 Add / Edit Action Taken Form (Modal with Focus Trapping)
*   **Modal Title:** `"Log Action Taken"` (create mode) or `"Edit Action Taken"` (edit mode).
*   **Form Fields & Edit Capabilities:**
    1.  **Action Date/Time:** Datetime-local input. Defaults to current local time in create mode. On submit, converted to UTC ISO 8601 string (`new Date(localVal).toISOString()`). Validated: cannot be in the future.
    2.  **Performed By (Read-Only):**
        *   In create mode: displays `"Will be recorded as: {currentUser.name} ({currentUser.role})"`.
        *   In edit mode: displays the **original actor** `"Originally recorded by: {action.performedBy.name} ({action.performedBy.role})"`. The actor remains permanently immutable.
    3.  **Action Description (Required):** Textarea, 3 rows, placeholder `"Describe the technical action performed..."`, character counter (`0/2000`).
    4.  **Result (Required):** Textarea, 3 rows, placeholder `"Describe the observed result or outcome..."`, character counter (`0/2000`).
    5.  **Follow-Up Required Toggle:** Bootstrap switch (`form-check form-switch`) with label `"Follow-up required?"`.
    6.  **Follow-Up Note (Conditionally Mandatory):** Expands smoothly when the switch is ON. Mandatory when switch is ON; submit is disabled if blank. When switch is OFF, value is sent as `null`.
    7.  **Attachment Notes (Optional):** Text input, placeholder `"Specify attachment filenames to reference..."`, character counter (`0/500`). Shows validation error if > 500 characters.
*   **Idempotency & Duplicate Click Prevention:**
    *   *Create Mode (`POST /api/tickets/:id/actions`):* Client generates a unique **mandatory** `Idempotency-Key: uuidv4()` on form mount. Clicking `Save Action Taken` immediately sets `disabled={true}` on the submit button and displays a spinner (`isSubmitting = true`). If a network retry occurs, the client reuses the exact same key. Upon successful submission, the form closes, state resets, and any subsequent creation generates a fresh UUIDv4 key.
    *   *Edit Mode (`PATCH /api/tickets/:id/actions/:actionId`):* Concurrency is controlled via the atomic CAS `actionLastUpdatedAt` token; `Idempotency-Key` is not required. Clicking `Save Changes` immediately disables the button and displays a spinner.
*   **Concurrency Stale Update Handling (CAS 409):**
    *   Edit form includes `actionLastUpdatedAt` in PATCH payload.
    *   If the server conditional update affects 0 rows and returns `409 Conflict`, the UI displays an alert:
        `"This Action Taken was modified by another user. Your draft inputs have been preserved. [Reload Latest Data]"`
        The user's unsaved form inputs are **not silently discarded**, allowing the user to review before overwriting.

### 5.4 Action Taken Revision History View (Modal with Focus Trapping)
*   **Access & Authorization (Requester Isolation):** Visible strictly to `IT Staff` and `Administrator`. Requesters never see the `"View History"` button, cannot open the Revision History modal or internal UI, and view only the normal read-only Actions Taken timeline. Any direct attempt by a Requester to fetch revisions returns HTTP 403 Forbidden on own tickets (HTTP 404 Not Found on unowned tickets under non-enumeration rules).
*   **Strictly Read-Only Interface:** The Revision History modal contains zero edit, update, or delete controls; it functions exclusively as an immutable, read-only audit inspection view.
*   **Modal Title:** `"Revision History - Action Taken #{actionId}"`
*   **Ordering:** Revisions rendered in strictly deterministic chronological order: **`editedAt ASC, id ASC`**.
*   **Entry Layout & Diff Presentation:**
    *   Each revision displays an elevated card showing:
        *   **Revision Header:** Sequential revision index (`"Revision #{index}"`), editor info (`"Edited by: {editedBy.name} ({editedBy.role})"`), and formatted timestamp in client local timezone (e.g. `"Nov 1, 2026, 10:15 AM"`).
        *   **Side-by-Side / Diff Block:** Compares `beforeSnapshot` vs `afterSnapshot` across all 6 editable fields (`actionDateTime`, `actionDescription`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes`).
        *   Unchanged fields are collapsed or styled neutrally; changed fields are highlighted with green/red diff badges (`before`: red strike-through, `after`: green highlight).
*   **Five UI States:**
    1.  **Loading State:** Modal renders pulsing placeholder skeletons while `GET /api/tickets/:id/actions/:actionId/revisions` is in flight.
    2.  **No Revisions State:** If `revisions.length === 0`, renders a clean informational card: `"No revisions recorded. This Action Taken has not been modified since creation."` (complies with non-fabrication policy for legacy actions).
    3.  **Populated State:** Renders the chronological timeline of revision diff cards.
    4.  **Safe Failure State:** If the API returns an error, displays an error alert with a `"Retry Loading Revisions"` button.
    5.  **Accessible Dismiss:** Accessible Close button (`aria-label="Close revision history"`), keyboard focus trapped inside modal, and `Escape` key dismisses modal.

---

## 6. Ticket Status Controls & Resolution Gate

### 6.1 Staff Status Transition Interface
*   Located in the right sidebar of `StaffTicketDetail.tsx`.
*   Dropdown displays **only valid transitions** permitted from the ticket's current status based on the 13-row transition matrix:
    *   From `New`: `Open`, `Cancelled`
    *   From `Open`: `In Progress`, `Waiting for Requester`
    *   From `Waiting for Requester`: `In Progress`, `Open`
    *   From `In Progress`: `Resolved`, `Waiting for Requester`
    *   From `Resolved`: `Closed`
    *   From `Closed`: `Reopened`
    *   From `Reopened`: `In Progress`, `Open`, `Waiting for Requester`
    *   From `Cancelled`: (no outgoing transitions)
*   **Exact Source-Target Owner Validation Feedback:**
    *   If an unassigned ticket (`ownerId = null`) is selected for `New -> Open`, `Open -> In Progress`, or `Reopened -> In Progress`, the UI displays an inline validation warning:
        `"Ticket must be assigned to an owner before transitioning from '{source}' to '{target}'."`
        The `"Confirm Status Change"` button remains disabled until an owner is assigned. Transitions from `Waiting for Requester` to `Open`/`In Progress` or `Reopened` to `Open`/`Waiting for Requester` succeed with unassigned tickets (`ownerId = null`).
*   **Dynamic Resolution Gate Validation (Action Count Only):**
    *   When the user selects `Resolved`:
        *   If the ticket has **0 recorded Actions Taken**:
            *   An alert banner appears in `#fff3cd` (warning):
                `⚠️ Resolution Gate: At least one Action Taken must be recorded before resolving this ticket.`
            *   A link `[+ Log Action Taken]` is displayed inside the banner.
            *   The `"Confirm Status Change"` button is **disabled**.
        *   If the ticket has **>= 1 recorded Actions Taken**:
            *   The `"Confirm Status Change"` button is **immediately enabled** (`actionCount >= 1` is the sole mandatory condition).
            *   A textarea appears: `"Resolution Details (optional Public Comment explaining fix to requester)"`.
            *   Subtext: `"Optional: Explain the fix to the requester. If left blank, the ticket will be resolved without creating an empty comment."`
            *   If non-empty text is entered, a Public Comment is created atomically with the status change. If left blank, status change succeeds without comment creation.
*   **Duplicate Click Prevention:**
    *   Clicking `"Confirm Status Change"` immediately sets `disabled={true}` on the submit button with a spinner.
*   **Concurrency Stale Update Handling (CAS 409):**
    *   Payload includes `lastUpdatedAt`. If the database conditional update returns `409 Conflict`, the UI catches the error and displays:
        `"Ticket state was modified in another session. Your draft comment / reason has been preserved. [Reload Latest Data]"`
        The user's unsaved form inputs (such as resolution comments or cancellation reasons) are **not silently cleared**, allowing the user to review latest ticket changes before re-submitting.

---

## 7. Restoration of Requester Ticket Detail Communication Area
To resolve the Lab 3 baseline audit defect:
*   [`client/src/components/TicketDetail.tsx`](../../client/src/components/TicketDetail.tsx) is updated to render `<CommunicationArea ticketId={ticket.id} ticketStatus={ticket.status} lastUpdatedAt={ticket.updatedAt} onUpdate={fetchTicket} />` directly below the new read-only Actions Taken section.
*   This restores:
    1.  Public Comment history viewing for Requesters.
    2.  Public Comment posting for Requesters: with auto-transitioning `Waiting for Requester` -> `Open` and `Resolved`/`Closed` -> `Reopened` (resetting `resolvedAt = null`). Transmits the Ticket's expected `lastUpdatedAt` concurrency token from loaded state (`props.lastUpdatedAt`) and generates an optional client `Idempotency-Key: uuidv4()`, immediately disabling submit with a spinner. Catches HTTP 409 Conflict if staff concurrently updated ticket status, owner, or priority (preserving user draft comment in the textarea and alerting the user to reload latest ticket data).
    3.  The advisory `"Problem Appears Resolved"` button: visible and active strictly when `ticket.status === 'In Progress'`. Transmits the Ticket's expected `lastUpdatedAt` concurrency token from loaded state (`props.lastUpdatedAt`) and generates an optional client `Idempotency-Key: uuidv4()`, immediately disabling the button with a spinner to prevent duplicate clicks. Catches HTTP 409 Conflict if staff concurrently updated status away from `In Progress` or altered ticket fields, alerting the user to reload latest data.

---

## 8. Responsive Design & Viewport Breakpoints
*   **No Blanket `overflow-x: hidden`:** The application uses flexbox wrapping (`flex-wrap: wrap`), responsive CSS Grid, table wrappers (`.table-responsive`), and responsive typography without cutting off horizontal content.
*   **Desktop (>= 1200px):**
    *   Dashboards: Metric cards displayed in an expansive 5–6 column grid. Two-column split for Recent Lists (left 65%) and Quick Actions (right 35%).
    *   Ticket Detail: Two-column split (left 66% for Description, Attachments, Actions Taken, Comments; right 33% for Meta, Assignee, Status controls).
*   **Tablet (768px – 1199px):**
    *   Dashboards: Metric cards wrap into a 2 or 3-column grid. Recent Lists and Quick Actions stack vertically.
    *   Ticket Detail: Two-column split with compact padding; sidebar inputs scale to 100% width.
*   **Mobile (< 768px):**
    *   Navigation bar collapses into a clean dropdown / hamburger menu.
    *   Dashboards: Metric cards stack into full-width cards with large touch-friendly targets.
    *   Ticket Queue & Lists: Collapse into full-width card lists rather than wide tables to prevent horizontal clipping.

---

## 9. Accessibility Checklist
*   **Semantic Structure:** Proper HTML5 landmark tags (`<nav>`, `<main>`, `<section>`, `<article>`).
*   **Color Independence:** Every status badge combines color with an explicit text label (e.g. `In Progress`, `Resolved`).
*   **Accessible Button Labels:** All icon-only buttons (such as refresh, logout, edit) include explicit `aria-label` attributes.
*   **Keyboard Navigation:** All buttons, dropdowns, form fields, and modal controls are navigable via `Tab`, `Enter`, `Space`, and `Escape`.
*   **Modal Focus Trapping & Dismiss:** Modals trap keyboard focus while open; pressing `Escape` dismisses the modal without submitting.
*   **Form Field Associations & Errors:** All inputs and textareas feature explicit `<label htmlFor="...">` bindings. Error messages use `aria-describedby` linked to the input with `aria-invalid="true"`.
*   **Live Regions:** Loading and error states use `role="status"` and `aria-live="polite"` to alert screen-reader users to dynamic content updates.
