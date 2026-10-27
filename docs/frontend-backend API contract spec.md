# Frontend-Backend API Contract Specification

**Project:** OAU Campus Lost & Found Backend

**Base URL:** `[https://api.oaulostandfound.com/v1](https://api.oaulostandfound.com/v1)`

**Authentication:** HTTP Bearer Token (`Authorization: Bearer <JWT>`)

**Response Format:** Standard JSON wrapper `{"success": true|false, "data": ..., "error": ...}`

---

## 1. Authentication & Student Verification (`/auth`)

### 1.1 Register Student Account

* **Endpoint:** `POST /auth/register`
* **Auth Required:** No
* **Description:** Creates an unverified student account and dispatches an activation link to the provided `@student.oauife.edu.ng` or `@oauife.edu.ng` address.

#### Request Body

```json
{
  "full_name": "Francis Faniku",
  "email": "francisf@student.oauife.edu.ng",
  "phone_number": "08123456789",
  "whatsapp_number": "08123456789",
  "matric_number": "CSC/2021/001",
  "department": "Computer Science & Engineering",
  "password": "SecurePassword123!"
}

```

#### Responses

* `201 Created`: Account initialized; email verification sent.

```json
{
  "success": true,
  "message": "Registration successful. Please check your OAU email to verify your account.",
  "data": {
    "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "email": "francisf@student.oauife.edu.ng"
  }
}

```

* `400 Bad Request`: Invalid institutional email or phone number format.

```json
{
  "success": false,
  "error": {
    "code": "INVALID_EMAIL_DOMAIN",
    "message": "Registration is restricted to verified OAU student emails (@student.oauife.edu.ng or @oauife.edu.ng)."
  }
}

```

---

### 1.2 Verify Email Address

* **Endpoint:** `GET /auth/verify-email`
* **Query Parameters:** `token` (String, required)
* **Auth Required:** No
* **Description:** Activates the user account when the verification link from the email is accessed.

#### Responses

* `200 OK`: Account activated.

```json
{
  "success": true,
  "message": "Email successfully verified. You can now log in."
}

```

* `400 Bad Request`: Token expired or invalid.

---

### 1.3 Student Login

* **Endpoint:** `POST /auth/login`
* **Auth Required:** No
* **Description:** Authenticates active students and generates a bearer token.

#### Request Body

```json
{
  "email": "francisf@student.oauife.edu.ng",
  "password": "SecurePassword123!"
}

```

#### Responses

* `200 OK`: Authentication successful.

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "full_name": "Francis Faniku",
      "email": "francisf@student.oauife.edu.ng",
      "department": "Computer Science & Engineering"
    }
  }
}

```

* `401 Unauthorized`: Unverified account or incorrect password.

---

## 2. Item Reporting & Search (`/items`)

### 2.1 Fetch Items Feed

* **Endpoint:** `GET /items`
* **Auth Required:** Yes
* **Query Parameters:**
* `type` (Optional): `LOST` | `FOUND`
* `category` (Optional): `ELECTRONICS` | `ID_CARDS_DOCUMENTS` | `CLOTHING_ACCESSORIES` | `KEYS` | `BOOKS` | `OTHER`
* `location_id` (Optional): UUID of predefined zone
* `search` (Optional): Search term string
* `page` (Optional): Default `1`
* `limit` (Optional): Default `20`



#### Responses

* `200 OK`: Paginated list of item reports.

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "e3a2b1c0-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
        "type": "FOUND",
        "category": "ELECTRONICS",
        "title": "HP Laptop Charger (65W)",
        "description": "Black HP smart AC adapter left on row 3.",
        "location": {
          "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
          "name": "1000 LT",
          "zone": "LECTURE_THEATRE"
        },
        "custom_location": "Row 3 near the left exit door",
        "date_event_occurred": "2026-10-21T14:30:00Z",
        "image_urls": [
          "https://cdn.oaulostandfound.com/uploads/img_10293.jpg"
        ],
        "status": "OPEN",
        "created_at": "2026-10-21T15:00:00Z"
      }
    ],
    "pagination": {
      "total_items": 1,
      "current_page": 1,
      "total_pages": 1
    }
  }
}

```

---

### 2.2 Report a Lost or Found Item

* **Endpoint:** `POST /items`
* **Auth Required:** Yes
* **Description:** Posts a new lost or found item.

#### Request Body

```json
{
  "type": "FOUND",
  "category": "ELECTRONICS",
  "title": "HP Laptop Charger (65W)",
  "description": "Black HP smart AC adapter left on row 3.",
  "location_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "custom_location": "Row 3 near the left exit door",
  "date_event_occurred": "2026-10-21T14:30:00Z",
  "image_urls": [
    "https://cdn.oaulostandfound.com/uploads/img_10293.jpg"
  ]
}

```

#### Responses

* `201 Created`: Item successfully posted.

---

## 3. Claim Lifecycle & Contact Handshake (`/claims`)

### 3.1 Submit Claim Request

* **Endpoint:** `POST /items/:id/claim`
* **Auth Required:** Yes
* **Description:** A student submits proof of ownership for a reported item.

#### Request Body

```json
{
  "proof_of_ownership": "The charger has a blue electrical tape wrapped around the joint near the connector jack."
}

```

#### Responses

* `201 Created`: Claim submitted; finder notified.

```json
{
  "success": true,
  "message": "Claim request submitted successfully.",
  "data": {
    "claim_id": "f8e7d6c5-b4a3-2f1e-0d9c-8b7a6f5e4d3c",
    "status": "PENDING"
  }
}

```

---

### 3.2 Review Claim Status (Finder Action)

* **Endpoint:** `PATCH /claims/:id/status`
* **Auth Required:** Yes (Must be reporter of the associated item)
* **Description:** Approves or rejects a claimant's proof of ownership.

#### Request Body

```json
{
  "status": "APPROVED"
}

```

#### Responses

* `200 OK`: Status updated. When `APPROVED`, contact information is unlocked.

```json
{
  "success": true,
  "message": "Claim approved. Contact details unlocked for handshake.",
  "data": {
    "claim_id": "f8e7d6c5-b4a3-2f1e-0d9c-8b7a6f5e4d3c",
    "status": "APPROVED",
    "contact_details": {
      "phone_number": "08123456789",
      "whatsapp_number": "08123456789",
      "whatsapp_link": "https://wa.me/2348123456789?text=Hello%20I%20am%20contacting%20you%20regarding%20the%20lost%20item"
    }
  }
}

```

---

### 3.3 Get Item Details & Contact (For Approved Claimant)

* **Endpoint:** `GET /items/:id`
* **Auth Required:** Yes
* **Description:** Returns item metadata. Contact details are `null` unless the requesting user has an `APPROVED` claim for this item.

---

## 4. Campus Locations (`/locations`)

### 4.1 Get OAU Preset Locations

* **Endpoint:** `GET /locations`
* **Auth Required:** Yes
* **Description:** Lists all preset OAU zones for dropdown selection.

#### Responses

* `200 OK`:

```json
{
  "success": true,
  "data": [
    { "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d", "name": "1000 LT", "zone": "LECTURE_THEATRE" },
    { "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e", "name": "Fajuyi Hall", "zone": "HALL_OF_RESIDENCE" },
    { "id": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f", "name": "SUB", "zone": "COMMON_AREA" }
  ]
}

```