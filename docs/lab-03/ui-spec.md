# Lab 3 UI Specification

## 1. Application Shell & Navigation
*   **Visual Language:** Zen Green (inherited from Lab 2).
*   **Purpose:** Provide context, user identity, and role-based routing.
*   **Access:** All users (different links based on role).
*   **Changes from Lab 2:** The "Development Requester" selector dropdown is removed. Replaced by a user profile dropdown indicating the current authenticated user's name and role, and containing a "Logout" action.
*   **Navigation Links (Dynamic):**
    *   *Requester:* "My Tickets", "Create Ticket"
    *   *IT Staff:* "Ticket Queue"
    *   *Administrator:* "User Management", "Ticket Queue" (Read-only)
*   **Responsive:** On mobile, the top navbar collapses into a standard hamburger menu.

## 2. Login Screen
*   **Purpose:** Authenticate users into the system via stateful server sessions.
*   **Access:** Unauthenticated users.
*   **Main Fields:** Email (input type email), Password (input type password).
*   **Controls:** Login button.
*   **Validation:** HTML5 email format, required fields.
*   **States:**
    *   *Loading:* Button shows spinner, inputs disabled.
    *   *Failure Feedback:* A safe generic error alert ("Invalid credentials or account inactive") without indicating if the email exists.
*   **Responsive:** Centered card layout with appropriate padding on all devices.

## 3. Change Password Screen (First Login)
*   **Purpose:** Force users to securely set a new password on first login or after an admin reset.
*   **Access:** Authenticated users flagged with `requiresPasswordChange = true`.
*   **Main Fields:** Old Password, New Password, Confirm New Password.
*   **Controls:** Save Password, Logout (escape hatch).
*   **Validation:** New passwords must match. Should meet basic length requirements.
*   **States:**
    *   *Saving:* Button shows spinner.
    *   *Success:* Brief toast notification, followed by redirection to the role's default dashboard.
    *   *Failure:* Inline feedback if old password is wrong or new passwords do not match.
*   **Responsive:** Centered card, consistent with Login.

## 4. Requester Screens (Lab 2 Regression)
*   **Purpose:** Allow requesters to create tickets, view their tickets, and manage attachments.
*   **Access:** Requester role.
*   **Main Changes:** 
    *   The `X-Requester-Id` header is no longer explicitly set by the UI; the backend infers identity from the session.
    *   **Ticket Detail View:** Added a section for "Public Comments" at the bottom. Requesters can view the comment history and post new ones. Note: Posting a comment on a ticket that is `Waiting for Requester`, `Resolved`, or `Closed` will automatically update its status to `Open` or `Reopened` in the UI upon successful submission.
    *   **Appears Resolved:** A new action button "Appears Resolved" is visible if the ticket is `In Progress`. Clicking this button triggers the `/api/tickets/:id/appears-resolved` endpoint, generating a standardized comment without actually modifying the Ticket status in the UI or backend.
*   **States:** 
    *   *Not Found / Forbidden (404):* If a requester tries to directly navigate to a URL of a ticket they do not own, they see a generic "Ticket not found" error page (non-enumeration policy).
    *   *Empty:* Preserved from Lab 2.

## 5. Staff Ticket Queue
*   **Purpose:** A centralized hub to triage and view tickets.
*   **Access:** IT Staff, Administrator (Read-only).
*   **Main Fields:** Ticket ID, Summary, Category, Requester Name, IT Priority, Status, Owner, Created Date.
*   **Controls:** 
    *   Search bar (by ID or keyword).
    *   Filter dropdowns (Status, Category, Assigned To).
    *   Sortable column headers.
    *   Pagination controls (Previous/Next, Page numbers, Items per page).
*   **Read-only vs Editable:** The grid is read-only; clicking a row navigates to the Ticket Detail.
*   **States:**
    *   *Loading:* Skeleton rows or loading spinner over the table body.
    *   *Empty/No-results:* "No tickets found matching your criteria" with a button to clear filters.
*   **Responsive Behavior:** 
    *   *Desktop/Tablet:* Full data table.
    *   *Mobile:* The table collapses into a vertically stacked card list (e.g., each ticket is a card showing ID, Summary, Status badge, and Priority), avoiding an unreadable shrunken grid.

## 6. Staff Ticket Detail
*   **Purpose:** Comprehensive management and visibility of a single ticket.
*   **Access:** IT Staff, Administrator (Read-only).
*   **Main Layout:**
    *   **Header:** Ticket ID, Summary, Current Status badge.
    *   **Sidebar/Top Section (Meta):** Category, System, Requester info, Created date.
    *   **Controls (Editable for IT Staff ONLY. Hidden/Disabled for Administrators):** 
        *   Assignee dropdown (Claim to me, or assign to another active IT Staff).
        *   IT Priority dropdown.
        *   Status dropdown (only showing valid transitions from the current state based on the matrix).
    *   **Main Body:** Original Description and Attachments list (downloadable).
    *   **Communication Area:** A tabbed interface or split-pane for "Public Comments" and "Internal Notes".
        *   *Public Comments:* Appended history (visible to Staff/Admin), textarea for new comment and submit button (Hidden for Admins).
        *   *Internal Notes:* Appended history (visible to Staff/Admin, visually distinct background), textarea for new note and submit button (Hidden for Admins).
*   **Validation:** Action validations (e.g., cannot close without a resolution comment) trigger inline UI warnings.
*   **States:**
    *   *Saving:* Disables the specific control being updated and shows a micro-spinner.
    *   *Success:* Toast notification ("Ticket assigned to you").
    *   *Not Found (404):* "Ticket not found" empty state if navigating to an invalid ID.

## 7. Administrator User Management
*   **Purpose:** Minimalist interface to manage accounts.
*   **Access:** Administrator strictly.
*   **Main Layout:** Data table of users (Name, Email, Role, Status).
*   **Controls:** Search bar, Filter by Role, "Add User" button. Action buttons per row (Edit).
*   **Edit/Create Modal (or Slide-out):**
    *   Fields: Name, Email, Role (Dropdown: Requester, IT Staff, Administrator), Is Active (Toggle), Initial Password (only visible on creation or manual reset).
*   **States:**
    *   *Saving:* Modal submit button shows spinner.
    *   *Success:* Modal closes, table refreshes, toast notification.
    *   *Conflict (409):* If email already exists, an inline error appears below the email field ("Email is already in use").
    *   *Safe Failure (400):* If an Admin tries to deactivate themselves, the UI should ideally disable the toggle. If forced via API and a 400 Bad Request is returned, a toast shows the error ("Cannot deactivate your own account").
*   **Responsive Behavior:** Like the Ticket Queue, the desktop table transforms into a card layout on mobile devices.
