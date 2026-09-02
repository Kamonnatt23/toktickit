# TokTickIT - API Specification (Lab 2)

## Overview
This document outlines the RESTful API endpoints required for TokTickIT Lab 2. The API is designed to support the ticket creation flow, ticket retrieval, and attachment management while simulating a requester context via a custom header (since real authentication is excluded).

**Context Simulation:**
For Lab 2, all requests that require user context MUST include the `X-Requester-Id` header to simulate the authenticated user making the request.

---

## 1. Reference Data Endpoints

### 1.1 Retrieve Active Categories
*   **Endpoint:** `GET /api/categories`
*   **Description:** Fetches a list of all active ticket categories for use in dropdowns.
*   **Request Parameters:** None.
*   **Response (200 OK):**
    ```json
    [
      { "id": 1, "name": "Hardware", "isActive": true },
      { "id": 2, "name": "Software", "isActive": true }
    ]
    ```

### 1.2 Retrieve Active Related Systems
*   **Endpoint:** `GET /api/related-systems`
*   **Description:** Fetches a list of all active related systems for use in dropdowns.
*   **Request Parameters:** None.
*   **Response (200 OK):**
    ```json
    [
      { "id": 1, "name": "ERP System", "isActive": true },
      { "id": 2, "name": "Email Server", "isActive": true }
    ]
    ```

### 1.3 Retrieve Active Development Requesters
*   **Endpoint:** `GET /api/dev/users`
*   **Description:** Fetches a list of mock users for the Development Requester Selection screen.
*   **Request Parameters:** None.
*   **Response (200 OK):**
    ```json
    [
      { "id": 101, "name": "Alice Smith", "email": "alice@example.com" },
      { "id": 102, "name": "Bob Jones", "email": "bob@example.com" }
    ]
    ```

---

## 2. Ticket Management Endpoints

### 2.1 Create a Ticket
*   **Endpoint:** `POST /api/tickets`
*   **Description:** Creates a new ticket. Associates the ticket with the user ID provided in the `X-Requester-Id` header. If attachment IDs are provided, they are linked to the newly created ticket.
*   **Request Headers:**
    *   `X-Requester-Id` (Required)
*   **Request Body (JSON):**
    ```json
    {
      "categoryId": 1,
      "relatedSystemId": 2,
      "summary": "Cannot access ERP",
      "requestedPriority": "High",
      "description": "I receive a 500 error when logging in.",
      "attachmentIds": [991, 992] 
    }
    ```
*   **Response (201 Created):**
    ```json
    {
      "id": 50,
      "ticketNumber": "TICK-20260902-0001",
      "ticketDate": "2026-09-02T09:00:00Z",
      "status": "New"
    }
    ```
*   **Validation & Status Codes:**
    *   `201 Created`: Successful creation.
    *   `400 Bad Request`: Missing required fields (Category, Related System, Summary, Priority, Description) or if linking more than 5 attachments.
    *   `401 Unauthorized`: Missing `X-Requester-Id`.

### 2.2 Retrieve My Tickets (List)
*   **Endpoint:** `GET /api/tickets`
*   **Description:** Retrieves a paginated list of tickets owned by the requester.
*   **Request Headers:**
    *   `X-Requester-Id` (Required)
*   **Query Parameters:**
    *   `page` (number, default: 1)
    *   `limit` (number, default: 10)
    *   `search` (string, optional) - Searches Summary or Ticket Number.
    *   `categoryId` (number, optional)
    *   `priority` (string, optional)
    *   `sortBy` (string, default: "ticketDate")
    *   `sortDir` (string, default: "desc")
*   **Response (200 OK):**
    ```json
    {
      "data": [
        {
          "id": 50,
          "ticketNumber": "TICK-20260902-0001",
          "summary": "Cannot access ERP",
          "ticketDate": "2026-09-02T09:00:00Z",
          "requestedPriority": "High",
          "status": "New"
        }
      ],
      "meta": {
        "total": 1,
        "page": 1,
        "lastPage": 1
      }
    }
    ```
*   **Security Behavior:** The API MUST filter tickets strictly by `requesterId == X-Requester-Id`. It is impossible to view other users' tickets via this endpoint.

### 2.3 Retrieve Ticket Detail
*   **Endpoint:** `GET /api/tickets/:id`
*   **Description:** Retrieves full details of a specific ticket, including its active (non-deleted) attachments.
*   **Request Headers:**
    *   `X-Requester-Id` (Required)
*   **Path Parameters:**
    *   `id` (number) - The Ticket ID.
*   **Response (200 OK):**
    ```json
    {
      "id": 50,
      "ticketNumber": "TICK-20260902-0001",
      "ticketDate": "2026-09-02T09:00:00Z",
      "categoryId": 1,
      "relatedSystemId": 2,
      "summary": "Cannot access ERP",
      "requestedPriority": "High",
      "description": "I receive a 500 error when logging in.",
      "status": "New",
      "attachments": [
        { "id": 991, "fileName": "error.png", "fileSize": 102400 }
      ]
    }
    ```
*   **Validation & Status Codes:**
    *   `404 Not Found`: Ticket does not exist.
    *   `403 Forbidden`: Ticket exists but belongs to a different Requester ID.

---

## 3. Attachment Endpoints

### 3.1 Upload an Attachment
*   **Endpoint:** `POST /api/attachments`
*   **Description:** Uploads a file. Can be done before creating a ticket (returns an ID to be submitted with the ticket) or directly attached to an existing ticket.
*   **Request Headers:**
    *   `X-Requester-Id` (Required)
*   **Request Body (multipart/form-data):**
    *   `file` (binary) - The file to upload.
    *   `ticketId` (number, optional) - Provided if appending the file directly to an existing ticket.
*   **Response (201 Created):**
    ```json
    {
      "id": 991,
      "fileName": "error.png",
      "fileType": "image/png",
      "fileSize": 102400,
      "ticketId": null
    }
    ```
*   **Validation & Status Codes:**
    *   `400 Bad Request`: File is missing, exceeds the 5 MB limit, or is an invalid type (only JPG, PNG, WEBP, PDF allowed). If `ticketId` is provided, fails if the ticket already has 5 active attachments.
    *   `403 Forbidden`: If `ticketId` is provided, but the ticket belongs to another user.

### 3.2 Retrieve Attachment Metadata
*   **Endpoint:** `GET /api/attachments/:id`
*   **Description:** Retrieves metadata for a specific attachment.
*   **Request Headers:**
    *   `X-Requester-Id` (Required)
*   **Response (200 OK):**
    ```json
    {
      "id": 991,
      "ticketId": 50,
      "fileName": "error.png",
      "fileType": "image/png",
      "fileSize": 102400,
      "isDeleted": false
    }
    ```
*   **Validation & Status Codes:**
    *   `404 Not Found`: Attachment does not exist.
    *   `403 Forbidden`: Attachment is linked to a ticket owned by another user.

### 3.3 Download an Active Attachment
*   **Endpoint:** `GET /api/attachments/:id/download`
*   **Description:** Downloads the actual binary file of the attachment.
*   **Request Headers:**
    *   `X-Requester-Id` (Required)
*   **Response (200 OK):**
    *   Returns the binary file stream with appropriate `Content-Type` and `Content-Disposition` headers.
*   **Validation & Status Codes:**
    *   `404 Not Found`: Attachment does not exist or has been soft-deleted (`isDeleted: true`).
    *   `403 Forbidden`: Attachment is linked to a ticket owned by another user.

### 3.4 Soft-Remove an Attachment
*   **Endpoint:** `DELETE /api/attachments/:id`
*   **Description:** Marks an attachment as deleted (`isDeleted: true`). The file remains on the server filesystem/database but is hidden from the UI and blocked from download.
*   **Request Headers:**
    *   `X-Requester-Id` (Required)
*   **Response (204 No Content):**
    *   (Empty Body)
*   **Validation & Status Codes:**
    *   `404 Not Found`: Attachment does not exist or is already marked as deleted.
    *   `403 Forbidden`: Attachment belongs to a ticket owned by another user.
    *   `204 No Content`: Successful soft-deletion.
