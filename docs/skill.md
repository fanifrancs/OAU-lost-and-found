## 1. Project Context & Persona

* **Project Name:** OAU Campus Lost & Found Backend
* **Context:** SIWES Project for Obafemi Awolowo University (OAU) campus.
* **Role:** Backend Engineer. You are building secure, scalable RESTful APIs consumed by an Android mobile application.
* **Core Philosophy:** Security-first (strict OAU student verification), privacy-first (masked contact details until claim approval), and clean modular architecture.

---

## 2. Tech Stack & Environment

* **Runtime:** Node.js (Latest LTS)
* **Language:** TypeScript (Strict mode enabled)
* **Framework:** Express.js
* **Database:** PostgreSQL (with `pg` connection pooling)
* **Authentication:** JSON Web Tokens (JWT) & bcrypt for password hashing
* **Environment Validation:** Use `dotenv` for configuration.

---

## 3. Directory Structure Standards

Enforce a clean, modular MVC or Service-Controller architecture:

```text
src/
├── config/         # Database and environment configurations
├── middleware/     # Auth verification, validation, error handling
├── modules/        # Request handlers, controllers, services, and business logic
├── utils/          # Helpers (Email dispatchers, token generators)
├── app.ts          # Express application setup
└── server.ts       # Server entry point

```

---

## 4. Strict Coding Rules & Constraints

### 4.1 Data Formatting Rules

* **Phone Numbers:** **Never** add country codes (e.g., do not add `+234`) to phone or WhatsApp numbers unless explicitly requested. Store and return local Nigerian formats as entered by the student (e.g., `08123456789`).

### 4.2 TypeScript & Error Handling

* Avoid using `any`. Define explicit TypeScript interfaces/types for all request bodies, query parameters, and database models.
* Implement a **centralized error-handling middleware** that catches unhandled errors and returns consistent JSON responses:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation"
  }
}

```



### 4.3 Database & Query Rules

* Use parameterized queries for all PostgreSQL database interactions to prevent SQL injection.
* Ensure foreign keys (`reporter_id`, `location_id`, `item_id`, `claimant_id`) are properly indexed for high-performance searching.

---

## 5. Security & Business Logic Guardrails

1. **Email Domain Enforcement:**
* The registration route (`POST /auth/register`) must validate that the email string ends with either `@student.oauife.edu.ng` or `@oauife.edu.ng`. Reject any other domains with a `400 Bad Request`.


2. **Contact Privacy Masking:**
* Public item feed endpoints (`GET /items` and `GET /items/:id`) **must never** expose the reporter's `phone_number` or `whatsapp_number`.
* Contact details are only revealed in the API response when an active user has an **`APPROVED`** claim linked to that specific item.


3. **Authorization Checks:**
* Ensure that only the verified owner of an item can access `PATCH /claims/:id/status` to approve or reject incoming claims.