# OAU Campus Lost & Found API: Reference

A REST API for reporting, searching and claiming lost and found items on the OAU campus. Built with TypeScript, Express and PostgreSQL, with Supabase Storage for item images.

> Items marked **TODO: verify** are inferred from the README and `test.http` and should be checked against the source in `src/`.

## Contents

1. [Overview](#overview)
2. [Quick start](#quick-start)
3. [Authentication](#authentication)
4. [Response and error format](#response-and-error-format)
5. [Endpoints](#endpoints)
   - [Health](#health)
   - [Auth](#auth)
   - [Locations](#locations)
   - [Uploads](#uploads)
   - [Items](#items)
   - [Claims](#claims)
6. [Typical workflow](#typical-workflow)
7. [Data reference](#data-reference)

---

## Overview

| | |
|---|---|
| Base URL (production) | `https://oau-lost-and-found.onrender.com/api/v1` |
| Base URL (local) | `http://localhost:3000/api/v1` |
| Health check | `https://oau-lost-and-found.onrender.com/health` (no `/api/v1` prefix) |
| Format | JSON request and response bodies |
| Auth | Bearer JWT (all routes except register, verify, login, health) |

> **Note on the hosted instance:** if it is on Render's free tier, it spins down after a period of inactivity, so the first request can take 30-60 seconds to respond. Call `/health` first to wake it up.

**Privacy model:** Item details are visible to any logged-in user, but the reporter's contact details are returned only to a claimant whose claim on that item has been **approved** by the reporter.

---

## Quick start

The examples use the production URL. Replace it with `http://localhost:3000` when running locally.

```bash
# 0. Check the server is up (wakes it if idle)
curl https://oau-lost-and-found.onrender.com/health

# 1. Register
curl -X POST https://oau-lost-and-found.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Ada Student",
    "email": "ada@student.oauife.edu.ng",
    "phone_number": "08000000000",
    "whatsapp_number": "08000000000",
    "matric_number": "CSC/2022/001",
    "department": "Computer Science & Engineering",
    "password": "a-strong-password"
  }'

# 2. Log in and copy data.token from the response
curl -X POST https://oau-lost-and-found.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "ada@student.oauife.edu.ng", "password": "a-strong-password"}'

# 3. Call a protected route
curl https://oau-lost-and-found.onrender.com/api/v1/items \
  -H "Authorization: Bearer <token>"
```

If `EMAIL_VERIFICATION_ENABLED=true`, verify your email (see [Verify email](#get-authverify-email)) before logging in. In development without SMTP, the verification link is printed in the server log.

---

## Authentication

Log in to receive a JWT, then send it on every protected request:

```
Authorization: Bearer <token>
```

- The token is returned at `data.token` in the login response.
- `POST /auth/logout` revokes the current token, so it cannot be reused afterwards.
- Registration requires an OAU email address (`@student.oauife.edu.ng` in the examples). **TODO: verify** the exact domain rule.
- Token lifetime: **TODO: verify** (check the JWT expiry setting in `src/`).

---

## Response and error format

**Success** responses wrap the payload in `data`:

```json
{
  "success": true,
  "data": { }
}
```

**Errors** always use this shape:

```json
{
  "success": false,
  "error": {
    "code": "SOME_ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

| Status | Meaning |
|---|---|
| `400` | Validation error or malformed request |
| `401` | Missing, invalid, expired or revoked token |
| `403` | Authenticated but not allowed (e.g. not the item's reporter) |
| `404` | Resource not found |
| `409` | Conflict (e.g. email already registered) |
| `500` | Server error |

**TODO: verify** the status codes and `error.code` values the API actually returns, and list them here.

---

## Endpoints

### Health

#### `GET /health`

Auth: none. Returns the server status. Note this route is at the root, not under `/api/v1`.

```bash
curl https://oau-lost-and-found.onrender.com/health
```

---

### Auth

#### `POST /auth/register`

Auth: none. Creates an account.

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `full_name` | string | yes | Student's full name |
| `email` | string | yes | OAU email address |
| `phone_number` | string | yes | Nigerian local format, e.g. `08012345678` |
| `whatsapp_number` | string | yes | Nigerian local format |
| `matric_number` | string | yes | e.g. `CSC/2022/001` |
| `department` | string | yes | e.g. `Computer Science & Engineering` |
| `password` | string | yes | Account password |

Required/optional status and password rules: **TODO: verify** against the validation schema.

#### `GET /auth/verify-email`

Auth: none. Verifies an email address using the token that was sent (or logged).

**Query:** `token` (string, required)

```
GET /api/v1/auth/verify-email?token=<verification-token>
```

Only needed when `EMAIL_VERIFICATION_ENABLED=true`.

#### `POST /auth/login`

Auth: none. Returns a JWT.

**Body**

| Field | Type | Required |
|---|---|---|
| `email` | string | yes |
| `password` | string | yes |

**Response** (the token is at `data.token`)

```json
{
  "success": true,
  "data": {
    "token": "<jwt>"
  }
}
```

Additional fields (e.g. user profile): **TODO: verify**.

#### `POST /auth/logout`

Auth: required. Revokes the current bearer token. No body.

---

### Locations

#### `GET /locations`

Auth: required. Returns the preset campus locations. Use an `id` from this list as `location_id` when creating an item.

The list is seeded with `npm run db:seed` and can be extended through SQL.

---

### Uploads

Images are uploaded directly to Supabase Storage (bucket `item-images`), not through this API. The flow:

1. Request a signed upload token from this API.
2. Upload the file with the Supabase SDK using the returned bucket, path and token.
3. Pass the resulting `public_url` in `image_urls` when creating the item.

#### `POST /uploads/sign`

Auth: required. Creates a scoped Supabase Storage upload token. Make one request per image.

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `file_name` | string | yes | e.g. `charger.jpg` |
| `content_type` | string | yes | e.g. `image/jpeg` |

**Response** includes the storage `bucket`, `path`, upload `token` and the final `public_url`. Exact field names: **TODO: verify**.

---

### Items

#### `GET /items`

Auth: required. Search and paginate the active item feed.

**Query parameters** (all optional)

| Param | Type | Description |
|---|---|---|
| `type` | `LOST` \| `FOUND` | Filter by report type |
| `category` | string | e.g. `ELECTRONICS`, `BOOKS`, `KEYS` (see [Categories](#categories)) |
| `location_id` | UUID | Filter by preset location |
| `search` | string | Keyword search (title/description) |
| `page` | integer | Page number, starting at 1 |
| `limit` | integer | Items per page (the examples use 20) |

```bash
curl "https://oau-lost-and-found.onrender.com/api/v1/items?type=FOUND&category=ELECTRONICS&search=charger&page=1&limit=20" \
  -H "Authorization: Bearer <token>"
```

Pagination metadata shape (total, pages, etc.) and the maximum `limit`: **TODO: verify**.

#### `POST /items`

Auth: required. Reports a lost or found item.

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `LOST` \| `FOUND` | yes | Whether the item was lost or found |
| `category` | string | yes | Item category |
| `title` | string | yes | Short title |
| `description` | string | yes | Details that help identify the item |
| `location_id` | UUID | yes | A preset location from `GET /locations` |
| `custom_location` | string | no | Extra detail, e.g. "Row 3 near the left exit door" |
| `date_event_occurred` | ISO 8601 datetime | yes | When it was lost or found |
| `image_urls` | string[] | no | `public_url` values from the upload flow; `[]` for none |

```json
{
  "type": "FOUND",
  "category": "ELECTRONICS",
  "title": "HP Laptop Charger",
  "description": "Black HP adapter with blue tape near the connector.",
  "location_id": "<location-uuid>",
  "custom_location": "Row 3 near the left exit door",
  "date_event_occurred": "2026-10-27T14:30:00Z",
  "image_urls": []
}
```

The created item (including its `id`) is returned at `data`.

#### `GET /items/:id`

Auth: required. Returns the item detail.

`contact_details` is `null` until the caller has an **approved** claim on this item. After approval, the approved claimant receives the reporter's contact details.

#### `PATCH /items/:id/status`

Auth: required (reporter only). Marks the item resolved after the handoff.

**Body**

```json
{ "status": "RESOLVED" }
```

---

### Claims

#### `POST /items/:id/claim`

Auth: required. Submits a claim with proof of ownership.

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `proof_of_ownership` | string | yes | Details only the real owner would know |

The claim's ID is returned at `data.claim_id`.

#### `GET /items/:id/claims`

Auth: required (reporter only). Lists all claims and proof notes for an item.

**Query:** `page`, `limit` (optional, as for `/items`)

#### `GET /claims/:id`

Auth: required (the claimant or the item's reporter). Returns a claim and its status.

#### `PATCH /claims/:id/status`

Auth: required (item reporter only). Approves or rejects a claim.

**Body**

```json
{ "status": "APPROVED" }
```

`status` is `APPROVED` or `REJECTED`.

---

## Typical workflow

1. **Reporter** registers, verifies (if enabled) and logs in.
2. Reporter calls `GET /locations`, optionally uploads images via `POST /uploads/sign`, then `POST /items`.
3. **Claimant** logs in, finds the item with `GET /items`, and sees `contact_details: null` on `GET /items/:id`.
4. Claimant submits `POST /items/:id/claim` with proof of ownership.
5. Reporter reviews `GET /items/:id/claims` and approves or rejects with `PATCH /claims/:id/status`.
6. If approved, the claimant's `GET /items/:id` now returns the reporter's contact details.
7. After the handoff, the reporter calls `PATCH /items/:id/status` with `RESOLVED`.

---

## Data reference

### Item types
`LOST`, `FOUND`

### Item statuses
`RESOLVED` is confirmed; other values (e.g. `ACTIVE`/`OPEN`): **TODO: verify**.

### Claim statuses
`APPROVED`, `REJECTED`, plus an initial pending state (**TODO: verify** name).

### Categories
Seen in examples: `ELECTRONICS`, `BOOKS`, `KEYS`. **TODO: verify** the full list from the schema or migrations.

### Phone numbers
Stored and returned in the local Nigerian format the student entered (e.g. `08012345678`).

---

## Running locally

See the [README](./README.md#setup) for environment variables (`DATABASE_URL`, `JWT_SECRET`, Supabase keys, SMTP settings) and the commands `npm run db:migrate`, `npm run db:seed` and `npm run dev`. The `test.http` file in the repo root contains a runnable request collection for the REST Client extension in VS Code.
