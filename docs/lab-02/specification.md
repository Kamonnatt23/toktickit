# TokTickIT - Lab 2 Engineering Specification

## 1. Sprint Goal
The goal of this sprint (Lab 2) is to implement the core user-facing functionality for ticket creation and basic management in the TokTickIT system. This enables end-users (Requesters) to simulate logging in via a temporary development context, submit new IT support tickets with file attachments, view their personal list of tickets, and inspect the details of a submitted ticket.

## 2. Stakeholder Request Interpretation
Stakeholders need the foundational ticket submission flow built out. Since the authentication system is not yet ready, they require a temporary mechanism to simulate user context (the "Development Requester Selection" screen). The primary value delivered is allowing users to report issues with all necessary metadata and file attachments, and to keep track of their reported issues through a searchable, sortable, and paginated list.

## 3. Scope
**Included:**
*   A temporary "Development Requester Selection" screen to simulate user context without real authentication.
*   Create Ticket screen with form validation.
*   My Tickets list showing only the active user's tickets, supporting search, filtering, sorting, and pagination.
*   Ticket Detail screen in read-only mode for viewing submitted information (except for attachments).
*   Attachment management (uploading, viewing, and soft-removing attachments both during ticket creation and on existing tickets from the Ticket Detail screen).

**Excluded:**
*   Real authentication systems and password management.
*   IT Staff workflows, agent dashboards, or ticket assignments.
*   Ticket lifecycle management (no status changes beyond the initial "New" state).
*   Comments, internal notes, or communication threads on tickets.

## 4. Functional Requirements
*   **FR-01 [Dev Context]:** The system shall provide a screen to select a mock user to act as the "Requester" for the session.
*   **FR-02 [Create Ticket]:** The system shall allow the Requester to submit a new ticket specifying Category, Related System (from dropdown), Summary, Requested Priority, and Description.
*   **FR-03 [Ticket Generation]:** Upon successful submission, the system shall automatically generate a unique Ticket Number and record the Ticket Date.
*   **FR-04 [Upload Attachment]:** The system shall allow the Requester to upload file attachments during ticket creation and on existing tickets via the Ticket Detail screen.
*   **FR-05 [Remove Attachment]:** The system shall allow the Requester to remove uploaded attachments before finalizing the ticket submission (orphaned files should be immediately removed or marked as soft-deleted), and soft-remove attachments from existing tickets on the Ticket Detail screen.
*   **FR-06 [View My Tickets]:** The system shall display a paginated list of tickets created by the currently active Requester.
*   **FR-07 [Search & Filter Tickets]:** The system shall allow the Requester to search tickets by Summary or Ticket Number, and filter them by Category or Requested Priority.
*   **FR-08 [Sort Tickets]:** The system shall allow sorting the ticket list by Ticket Date and Requested Priority.
*   **FR-09 [View Ticket Details]:** The system shall provide a read-only view displaying all ticket fields and a list of active attachments for a specific ticket.

## 5. Business Rules
*   **BR-01 [Initial Status]:** All newly created tickets must be assigned the status "New".
*   **BR-02 [Required Fields]:** Category, Related System, Summary, Requested Priority, and Description are mandatory fields for ticket creation.
*   **BR-03 [Dev Requester Context]:** Actions performed (creating, viewing tickets) must be strictly scoped to the Requester selected in the Development Requester Selection screen. A user cannot view or access tickets belonging to other Requesters.
*   **BR-04 [Attachment Types]:** Only files of type JPG, PNG, WEBP, and PDF are permitted for upload.
*   **BR-05 [Attachment Size]:** A single attachment file must not exceed 5 MB in size.
*   **BR-06 [Attachment Limit]:** A single ticket can have a maximum of 5 active attachments at any given time.
*   **BR-07 [Soft Removal]:** Removing an attachment is a soft delete operation. The file record remains in the database marked as deleted (`isDeleted: true`), but the actual file cannot be downloaded, previewed, or seen by users.
*   **BR-08 [Ticket Number Format]:** The system-generated Ticket Number must follow a consistent format (e.g., TICK-YYYYMMDD-XXXX or similar sequence).

## 6. UI Specification Summary
*   **Design Language (Zen Green Theme):**
    *   Primary green: `#006B3C`
    *   Secondary green: `#0B7A46`
    *   Pale green: `#EAF6EF`
*   **Responsive Layout:**
    *   Desktop: `≥ 992px`
    *   Tablet: `768px - 991px`
    *   Mobile: `< 768px`
*   **Dev Requester Selection:** A simple UI (dropdown or list) of mocked users to select the active context for the session.
*   **Create Ticket Form:** A form with inputs for Category (dropdown), Related System (dropdown fetched from DB), Summary (text input), Requested Priority (dropdown), Description (textarea), and an Attachment upload zone. Includes "Submit" and "Cancel" actions.
*   **My Tickets List:** A data table or list view displaying summary info (Ticket Number, Summary, Date, Priority, Status). Includes a search bar, filter controls, sortable column headers, and pagination controls.
*   **Ticket Detail View:** A structured layout presenting all ticket fields (read-only) and a section for managing attachments (viewing, adding, soft-removing).

## 7. Data Changes
**Models:**
*   **User (Mock):** `id`, `name`, `email`, `role`
*   **Category:** `id`, `name`, `isActive`
*   **RelatedSystem:** `id`, `name`, `isActive`
*   **Ticket:** `id`, `ticketNumber`, `ticketDate`, `requesterId`, `categoryId`, `relatedSystemId`, `summary`, `requestedPriority`, `description`, `status` (default: "New")
*   **Attachment:** `id`, `ticketId`, `fileName`, `fileType`, `fileSize`, `filePath`, `isDeleted` (boolean, default: false)

**Relationships:**
*   A User has many Tickets (as Requester).
*   A Ticket belongs to a User (Requester).
*   A Category has many Tickets.
*   A RelatedSystem has many Tickets.
*   A Ticket has many Attachments.
*   An Attachment belongs to a Ticket.

**Soft-remove Representation:**
*   The `Attachment` model utilizes an `isDeleted` boolean flag. When an attachment is removed, `isDeleted` is updated to `true`. Queries fetching attachments for UI display and download logic must explicitly filter for `isDeleted == false`.

## 8. API Contract
*   `GET /api/dev/users` - Fetch mock users for the Dev Requester Selection context.
*   `GET /api/categories` - Fetch active categories for the Create Ticket form dropdown.
*   `GET /api/related-systems` - Fetch active related systems for the Create Ticket form dropdown.
*   `POST /api/tickets` - Create a new ticket (handles associated attachment metadata).
*   `GET /api/tickets` - Fetch paginated list of tickets scoped to the current requester. Supports `search`, `category`, `priority`, `sortBy`, `sortOrder`, `page`, and `limit` query parameters.
*   `GET /api/tickets/:id` - Fetch details of a specific ticket, including active attachments.
*   `POST /api/attachments` - Endpoint to handle file upload (both pre-ticket creation and appending to existing tickets).
*   `GET /api/attachments/:id/download` - Download the binary file of an active attachment.
*   `DELETE /api/attachments/:id` - Soft-remove a specific attachment.

## 9. Acceptance Criteria
*   **AC-01:** Given I am on the Dev Requester screen, When I select a user, Then the system remembers my selection and treats me as that Requester for all subsequent actions.
*   **AC-02:** Given I am filling out the Create Ticket form, When I submit with all required fields filled and a Related System selected from the dropdown, Then a new ticket is created with a system-generated Ticket Number and status "New", and I am navigated to the My Tickets list.
*   **AC-03:** Given I am uploading an attachment (either on creation or on the Detail screen), When I attempt to upload an executable file (.exe), Then the upload is rejected with a message stating allowed file types (JPG, PNG, WEBP, PDF).
*   **AC-04:** Given I am uploading an attachment, When I upload a file larger than 5 MB, Then the upload is rejected with a file size limit error message.
*   **AC-05:** Given I am on the Ticket Detail screen or Create Ticket form, When I try to upload a file that would exceed the 5 active attachments limit, Then the upload is blocked and I am warned about the maximum 5 files limit.
*   **AC-06:** Given I have uploaded an attachment (either on a draft ticket or an existing ticket), When I click remove, Then the attachment is no longer visible on the UI, and it is immediately marked as soft-deleted in the database to avoid orphaned files.
*   **AC-07:** Given I am on the My Tickets list, When the page loads, Then I only see tickets created by my currently selected Requester.
*   **AC-08:** Given I am on the My Tickets list, When I enter a search term matching a ticket summary, Then the list updates to display only matching tickets.
*   **AC-09:** Given I am on the My Tickets list, When I click a specific ticket row, Then I am navigated to the Ticket Detail screen for that ticket.
*   **AC-10:** Given I am on the Ticket Detail screen, When I view the page, Then all ticket fields are displayed in a read-only format, and all active (non-deleted) attachments are listed with options to add new ones or remove existing ones.

## 10. Definition of Done
*   [ ] All Functional Requirements (FR-01 to FR-09) are implemented.
*   [ ] All Business Rules (BR-01 to BR-08) are enforced by the system.
*   [ ] All Acceptance Criteria (AC-01 to AC-10) are met and manually tested.
*   [ ] **Automated Tests:** Unit, API, UI, and E2E tests are written and passing.
*   [ ] **GitHub Workflow:** Code must be reviewed via Pull Request before merging to `lab2-staging`.
*   [ ] Code is committed and pushed to the `lab2-staging` branch.
*   [ ] The application builds and runs locally without console errors or warnings.
*   [ ] API endpoints are documented or self-describing.

## 11. Assumptions and Decisions
*   **Assumption:** File storage for attachments will be handled locally on the server file system (e.g., an `uploads/` directory) for this lab environment, rather than a cloud bucket (e.g., AWS S3).
*   **Decision:** The "Dev Requester Context" will be stored in `localStorage` or HTTP-only cookies for the duration of the session to simulate an authentication context.
*   **Assumption:** Ticket categories and related systems are pre-seeded in the database and will be fetched dynamically to populate the Create Ticket form dropdowns.
