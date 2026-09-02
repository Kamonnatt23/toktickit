# TokTickIT - UI Specification (Lab 2)

## 1. Design System & Theme (Zen Green)

To ensure a calm, professional, and accessible user experience, the TokTickIT platform utilizes the "Zen Green" theme.

**Color Palette:**
*   **Primary Green:** `#006B3C` (Used for App Header, Primary Actions, Call-to-Action buttons)
*   **Secondary Green:** `#0B7A46` (Used for Active Tabs, Hover states on buttons and links)
*   **Pale Green:** `#EAF6EF` (Used for Selected table rows, Success banners, Subtle visual emphasis, Input field focus backgrounds)
*   **Page Background:** `#F5F7F6` (A quiet, near-white background to reduce eye strain)
*   **Text (Primary):** Dark charcoal-green (Used for standard body text and labels to maintain high readability and contrast)
*   **Error / Danger:** Dark red text and border (Used for validation errors, destructive actions, warning banners)

## 2. General Component Rules

All UI components across the application must strictly adhere to the following interaction and visual rules:

*   **Labels:** Form labels must always appear directly *above* their associated input controls.
*   **Required Fields:** Any mandatory form field must display a visible red asterisk (`*`) next to its label.
*   **Validation Messages:** Error or validation messages must appear immediately below or adjacent to the associated field (never just clustered at the top of the page).
*   **Buttons:** All buttons must include clear, visible text describing the action (e.g., "Submit Ticket", "Upload File"). Icon-only primary buttons are not permitted.
*   **Disabled States:** Disabled form controls and buttons must be visually distinct (e.g., lowered opacity, greyed out, `cursor-not-allowed`) and clearly un-clickable.
*   **Processing States:** The primary "Submit" button must show a distinct busy/loading state (e.g., a spinner icon, changed text like "Submitting...") when a request is processing to prevent double-clicks.

## 3. Responsive Layout Strategy

The application must be fully responsive, avoiding horizontal page scrolling at all times.

*   **Desktop (≥ 992px):** Interfaces utilize multi-column layouts. Data tables display all columns. Forms can sit side-by-side or in structured grids.
*   **Tablet (768px - 991px):** Layouts transition to two columns where practical. Sidebars may collapse. Less critical table columns may be hidden or consolidated.
*   **Mobile (< 768px):** All form fields and layout blocks stack vertically (single column). Complex data tables switch to a card-based list view or a scrollable inner container to prevent page-level horizontal scrolling. Action buttons become sticky or span full width.

## 4. Screen Specifications

### 4.1 Development Requester Selection Screen
*   **Purpose:** A temporary bridging screen to mock user login and set the session's active Requester context.
*   **Layout:** Centered modal card on a dark overlay or a simple, vertically centered page layout.
*   **Elements:**
    *   **Header:** "Select Development Context"
    *   **Control:** A clear Dropdown (`<select>`) or a radio list of mocked Users fetched from the backend.
    *   **Action:** A Primary Green "Continue as User" button.
*   **Behavior:** Selecting a user and clicking continue persists the user ID to local storage/state and redirects the user to the "My Tickets" screen.

### 4.2 Create Ticket Screen
*   **Purpose:** The primary form for Requesters to submit a new IT issue.
*   **Layout:** A structured, single-page form inside a clean white container (card) placed over the `#F5F7F6` background.
*   **Elements:**
    *   **Header:** "Create New Ticket" (H1).
    *   **Category:** Dropdown (Required).
    *   **Related System:** Dropdown fetched from DB (Required).
    *   **Summary:** Text Input (Required, single line).
    *   **Requested Priority:** Dropdown (Required).
    *   **Description:** Text Area (Required, multi-line, allows vertical resizing).
    *   **Attachment Zone:** A defined area below the description allowing file selection via drag-and-drop or click. Must clearly show the max size (5 MB), allowed types (JPG, PNG, WEBP, PDF), and current count (max 5).
        *   Uploaded files appear as a list inside this zone with a soft-remove (Trash icon) button next to each.
    *   **Actions (Bottom aligned):** "Cancel" (Secondary/Ghost button) and "Submit Ticket" (Primary Green button).

### 4.3 My Tickets Screen
*   **Purpose:** A dashboard for the Requester to view, search, and manage their submitted tickets.
*   **Layout:** Full-width container (respecting outer margins) with a top action bar and a data grid below.
*   **Elements:**
    *   **Header:** "My Tickets" (H1) and a "Create Ticket" Primary button in the top right.
    *   **Filters & Search Bar:** Positioned above the table. Includes a text input for Summary/Ticket Number search, and dropdowns for Category and Priority filtering.
    *   **Data Table:**
        *   **Columns:** Ticket Number, Summary, Date, Priority, Status.
        *   **Interactivity:** Headers must be clickable to toggle sorting (visualized with up/down arrows). Rows must have a hover state (Secondary green tint or Pale green background) indicating they are clickable.
    *   **Pagination:** Controls at the bottom center of the table (Previous, Page Numbers, Next).

### 4.4 Requester Ticket Detail Screen
*   **Purpose:** A detailed, read-only view of a specific ticket, plus the ability to manage attachments.
*   **Layout:** A card-based layout split into two main sections: Ticket Information (top/left) and Attachments (bottom/right).
*   **Elements:**
    *   **Header Bar:** Displays the Ticket Number, Status badge (e.g., "New"), and a "Back to List" navigation button.
    *   **Ticket Information (Read-only):**
        *   Fields (Category, System, Summary, Priority, Description, Date) are presented clearly as Label and Value pairs. Inputs are *not* used here; values are styled as standard text.
    *   **Attachments Section:**
        *   Displays a list of currently active (non-deleted) attachments as downloadable links or preview thumbnails.
        *   Includes a "Remove" action (Trash icon / red text) next to each file.
        *   Includes an "Add File" button/zone (must enforce the 5-file maximum limit, 5MB size limit, and file type restrictions).
*   **Behavior:** Removing or adding an attachment on this screen triggers an API call to update the database immediately, followed by a UI refresh of the attachment list.
