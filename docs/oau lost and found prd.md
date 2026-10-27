# Product Requirements Document (PRD)

**Project Name:** OAU Campus Lost & Found Backend

**Context:** SIWES Project (Obafemi Awolowo University Campus)

**Target Platform:** Android Mobile App (Backend API)

---

## 1. Overview & Objectives

### 1.1 Executive Summary

The OAU Campus Lost & Found System is a localized, student-to-student platform designed to streamline reporting, searching, and recovering lost or found items across Obafemi Awolowo University. By restricting access to verified OAU institutional emails and enforcing a secure, privacy-first claim workflow, the app eliminates spam while protecting student contact information.

### 1.2 Core Goals

* **OAU Student Verification:** Restrict network participation strictly to verified OAU email addresses (`@student.oauife.edu.ng` / `@oauife.edu.ng`).
* **Privacy & Security:** Keep personal contact info hidden until proof of ownership is validated by the item finder.
* **Campus Contextualization:** Provide intuitive spatial filtering tailored to OAU halls, lecture theatres, common areas, and custom location tags.
* **Seamless API Integration:** Expose lightweight RESTful endpoints for the mobile frontend developer.

---

## 2. Target Audience & Personas

* **The Finder:** An OAU student who discovers an item (e.g., at 1000 LT or Fajuyi Hall) and wants to return it safely without being spammed by false claims.
* **The Loser/Owner:** An OAU student who misplaced an item and wants to search campus reports and submit proof of ownership to recover it.

---

## 3. System Architecture & Workflows

### 3.1 Account & Authentication Flow

```
[ User Registers with OAU Email ]
↓
[ Backend Generates Signed Verification Token ]
↓
[ Verification Email Sent to @student.oauife.edu.ng ]
↓
[ User Clicks Verification Link ] → [ Account Marked ACTIVE ]

```

### 3.2 Secure Claim & Contact Handshake Lifecycle

```
[ Finder Posts Item ]
↓ (Contact Details Hidden)
[ Claimant Submits Claim + Proof Note ]
↓
[ Finder Reviews Claim ]
├── (Rejected) ──> [ Claim Marked REJECTED ]
└── (Approved) ──> [ Contact Unlocked ] ──> [ Direct Call / WhatsApp Link ]
↓
[ Item Marked RESOLVED ]

```

---

## 4. Detailed Feature Requirements

### 4.1 Authentication & User Management

* **OAU Domain Validation:** Backend enforces regex validation on email domain (`@student.oauife.edu.ng` or `@oauife.edu.ng`). Personal emails (e.g., Gmail, Yahoo) are strictly rejected.
* **Account Verification:** Registration sets account status to `UNVERIFIED` and dispatches an activation link containing a time-limited token.
* **JWT Authentication:** Authenticated requests require a Bearer token in HTTP headers.

### 4.2 Item Reporting & Feed Management

* **Item Types:** Categorized as `LOST` or `FOUND`.
* **Item Categories:** `ELECTRONICS`, `ID_CARDS_DOCUMENTS`, `CLOTHING_ACCESSORIES`, `KEYS`, `BOOKS`, `OTHER`.
* **Hybrid Location Tagging:**
* Select from preset OAU zones (Halls of Residence, Lecture Theatres, Faculties, Common Areas, Transit Routes).
* Optional `custom_location` string for specific details or unlisted spots.


* **Media Uploads:** Support array of uploaded image URLs.
* **Filtering & Search:** Search feeds by keywords, item type, category, and location preset.

### 4.3 Claim Request & Contact Reveal

* **Contact Privacy:** Reporter contact details (`phone_number`, `whatsapp_number`) are concealed by default in public endpoints.
* **Proof of Ownership Submission:** Claimants submit a detailed private claim note.
* **Approval Trigger:** Upon claim approval, the backend reveals the reporter's callable phone number and WhatsApp deep link to the approved claimant.

---

## 5. Data Model & Schema Design

### 5.1 `Users`

```
| Field Name           | Type          | Constraints / Description       |
| -------------------- | ------------- | ------------------------------- |
| `id`                 | UUID          | Primary Key                     |
| `full_name`          | String        | Required                        |
| `email`              | String        | Unique, domain restricted       |
| `phone_number`       | String        | Standard phone format           |
| `whatsapp_number`    | String        | WhatsApp enabled contact        |
| `matric_number`      | String        | Unique OAU Matriculation Number |
| `department`         | String        | Academic department             |
| `password_hash`      | String        | Encrypted password hash         |
| `is_verified`        | Boolean       | Default: `false`                |
| `verification_token` | String / Null | Signed activation token         |
| `created_at`         | Timestamp     | Record creation date            |
```

### 5.2 `Locations`

```
| Field Name | Type   | Constraints / Description                                                         |
| ---------- | ------ | --------------------------------------------------------------------------------- |
| `id`       | UUID   | Primary Key                                                                       |
| `name`     | String | Preset name (e.g., "1000 LT", "Fajuyi Hall", "SUB")                               |
| `zone`     | Enum   | `HALL_OF_RESIDENCE`, `LECTURE_THEATRE`, `FACULTY`, `COMMON_AREA`, `TRANSIT_ROUTE` |
```

### 5.3 `Items`

```
| Field Name            | Type               | Constraints / Description                                                             |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `id`                  | UUID               | Primary Key                                                                           |
| `reporter_id`         | Foreign Key        | References `Users.id`                                                                 |
| `type`                | Enum               | `LOST`, `FOUND`                                                                       |
| `category`            | Enum               | `ELECTRONICS`, `ID_CARDS_DOCUMENTS`, `CLOTHING_ACCESSORIES`, `KEYS`, `BOOKS`, `OTHER` |
| `title`               | String             | Short descriptive title                                                               |
| `description`         | Text               | Detailed description                                                                  |
| `location_id`         | Foreign Key / Null | References `Locations.id`                                                             |
| `custom_location`     | String / Null      | Free-form location note                                                               |
| `date_event_occurred` | Timestamp          | Date item was lost/found                                                              |
| `image_urls`          | Array[String]      | Attached photo links                                                                  |
| `status`              | Enum               | `OPEN`, `CLAIM_PENDING`, `RESOLVED`                                                   |
| `created_at`          | Timestamp          | Record creation date                                                                  |
```

### 5.4 `Claims`

```
| Field Name           | Type        | Constraints / Description           |
| -------------------- | ----------- | ----------------------------------- |
| `id`                 | UUID        | Primary Key                         |
| `item_id`            | Foreign Key | References `Items.id`               |
| `claimant_id`        | Foreign Key | References `Users.id`               |
| `proof_of_ownership` | Text        | Private proof submitted by claimant |
| `status`             | Enum        | `PENDING`, `APPROVED`, `REJECTED`   |
| `created_at`         | Timestamp   | Record creation date                |
```

---

## 6. Non-Functional Requirements

* **Performance:** Sub-200ms latency on core feed queries.
* **Security:** Password hashing with bcrypt/argon2, strict email validation, and token-based state authorization.
* **Scalability:** Indexed foreign keys (`location_id`, `reporter_id`, `claimant_id`) and status fields for fast database execution.

---