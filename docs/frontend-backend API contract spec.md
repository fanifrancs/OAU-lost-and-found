# Frontend–Backend API Contract Specification

**Project:** OAU Campus Lost & Found Backend
**Base URL:** `https://api.oaulostandfound.com/v1`
**Authentication:** Send `Authorization: Bearer <JWT>` for authenticated endpoints.
**Content type:** JSON requests use `Content-Type: application/json`.
**Response envelope:** Successful responses use `{"success":true,"data":...}` and failures use `{"success":false,"error":{"code":"...","message":"..."}}`. A `message` may also accompany successful responses.

All timestamps are ISO 8601 UTC. UUIDs are represented as strings. The server derives the acting user from the bearer token; clients must not send `reporter_id` or `claimant_id` as authority.

## 1. Authentication and student verification (`/auth`)

### 1.1 Register student account

`POST /auth/register` — No authentication required.

Creates an `UNVERIFIED` account and sends an activation link to an email whose domain is exactly `student.oauife.edu.ng` or `oauife.edu.ng`. Personal email domains are rejected. The activation token is signed, single-use, and time-limited; its lifetime is configured by the service.

Request body:

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

`201 Created` returns `user_id` and `email`; it never returns the password or password hash. `400 INVALID_EMAIL_DOMAIN` indicates a disallowed domain. Other expected errors include `400 VALIDATION_ERROR` and `409 EMAIL_ALREADY_REGISTERED` / `409 MATRIC_NUMBER_ALREADY_REGISTERED`.

### 1.2 Verify email

`GET /auth/verify-email?token=<verification-token>` — No authentication required.

Activates the account when the token is valid, unexpired, and unused. `200 OK` confirms activation. `400 INVALID_OR_EXPIRED_TOKEN` is returned for an invalid, expired, or already-used token. The token is consumed on success.

### 1.3 Student login

`POST /auth/login` — No authentication required.

Request body:

```json
{ "email": "francisf@student.oauife.edu.ng", "password": "SecurePassword123!" }
```

`200 OK` returns a JWT and a safe user summary (`id`, `full_name`, `email`, `department`). `401 INVALID_CREDENTIALS` covers an incorrect email/password. `403 ACCOUNT_UNVERIFIED` means the account must be activated before login. JWT expiry and renewal behavior are determined by the service configuration.

## 2. Supabase Storage image uploads (`/uploads`)

Item images are stored in a Supabase Storage bucket configured for public read access. The bucket name and allowed image MIME types / maximum file size are deployment configuration. The backend uses server-side Supabase credentials to mint upload permissions; the mobile app must never receive a Supabase service-role key.

### 2.1 Create a signed upload

`POST /uploads/sign` — Authentication required.

Creates a unique object path scoped to the authenticated user and returns short-lived signed upload credentials. Request one upload per image.

Request body:

```json
{ "file_name": "charger.jpg", "content_type": "image/jpeg" }
```

`201 Created`:

```json
{
  "success": true,
  "data": {
    "bucket": "item-images",
    "path": "users/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/7f18f3a0-charger.jpg",
    "token": "<short-lived-upload-token>",
    "expires_in": 7200,
    "public_url": "https://<project>.supabase.co/storage/v1/object/public/item-images/users/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/7f18f3a0-charger.jpg"
  }
}
```

The Android client uploads the file bytes directly to Supabase Storage using the Supabase Kotlin Storage SDK's `uploadToSignedUrl(path, token, data/file)` operation, with the returned bucket and path. Supabase signed upload tokens are valid for two hours and scoped to that object; they are not general storage credentials. On successful upload, pass `public_url` in `image_urls` when creating the item. If upload fails or the token expires, request a new signed upload. The bucket enforces a 5 MiB size limit and accepts JPEG, PNG, and WebP by default; the item API validates that supplied image URLs belong to the authenticated user's path in the configured bucket.

`400 INVALID_FILE_TYPE` and `413 FILE_TOO_LARGE` are returned when configured upload constraints are violated. Supabase Storage may also reject the upload; the client should surface the upload failure and must not submit an item with URLs for files that did not upload.

## 3. Campus locations (`/locations`)

### 3.1 List preset locations

`GET /locations` — Authentication required.

Returns all selectable campus presets. Each location has `id`, `name`, and `zone`; zones are `HALL_OF_RESIDENCE`, `LECTURE_THEATRE`, `FACULTY`, `COMMON_AREA`, or `TRANSIT_ROUTE`. `200 OK` returns an array. These IDs are used as `location_id` on items and as the feed filter.

## 4. Item reporting and search (`/items`)

Item types are `LOST` and `FOUND`. Categories are `ELECTRONICS`, `ID_CARDS_DOCUMENTS`, `CLOTHING_ACCESSORIES`, `KEYS`, `BOOKS`, and `OTHER`. Item statuses are `OPEN`, `CLAIM_PENDING`, and `RESOLVED`.

### 4.1 Fetch item feed

`GET /items` — Authentication required.

Optional query parameters:

| Parameter | Meaning |
| --- | --- |
| `type` | Filter by `LOST` or `FOUND`. |
| `category` | Filter by one category enum. |
| `location_id` | Filter by a preset location UUID. |
| `search` | Case-insensitive keyword search over title and description. |
| `page` | 1-based page number; default `1`. |
| `limit` | Page size; default `20`; maximum `100`. |

Results are ordered newest first. Public item fields include item metadata, preset location (or `null`), `custom_location`, `image_urls`, status, and timestamps. Reporter phone and WhatsApp fields, claimant proof notes, and other users' private claim data are never included in feed results. `200 OK` returns `{ "items": [...], "pagination": {"total_items": 1, "current_page": 1, "total_pages": 1} }` in `data`.

### 4.2 Report a lost or found item

`POST /items` — Authentication required; the authenticated user becomes the reporter.

Request body:

```json
{
  "type": "FOUND",
  "category": "ELECTRONICS",
  "title": "HP Laptop Charger (65W)",
  "description": "Black HP smart AC adapter left on row 3.",
  "location_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "custom_location": "Row 3 near the left exit door",
  "date_event_occurred": "2026-10-21T14:30:00Z",
  "image_urls": ["https://<project>.supabase.co/storage/v1/object/public/item-images/users/<user-id>/7f18f3a0-charger.jpg"]
}
```

`location_id` may be omitted or `null` when the user only provides a custom location. `custom_location` is optional. `image_urls` may be an empty array and each URL must reference an uploaded object in the configured bucket. New items start as `OPEN`. `201 Created` returns the created item, including its `id` and `status`.

### 4.3 Get item details

`GET /items/:id` — Authentication required.

Returns the item metadata. `contact_details` is `null` unless the requesting user is the claimant with an `APPROVED` claim for this item. For that claimant, it contains the reporter's `phone_number`, `whatsapp_number`, and a `whatsapp_link`. Contact data is never returned to feed callers or to the finder as part of reviewing their own claim. Other users' claim proofs are never included. Returns `404 ITEM_NOT_FOUND` when the ID does not exist.

### 4.4 Mark an item resolved

`PATCH /items/:id/status` — Authentication required; only the item reporter may perform this action.

Request body:

```json
{ "status": "RESOLVED" }
```

This records that the item has been returned/recovered and removes it from active results (unless a future API option explicitly requests resolved items). Only `RESOLVED` is accepted through this endpoint; clients cannot reopen an item or set `CLAIM_PENDING` directly. `200 OK` returns the updated status. The reporter may resolve an item after arranging the handoff. `403 NOT_ITEM_REPORTER` is returned when the requester is not the reporter; `409 ITEM_ALREADY_RESOLVED` when already resolved.

## 5. Claim lifecycle and contact handshake (`/claims`)

Claim status values are `PENDING`, `APPROVED`, and `REJECTED`. Proof notes are private: visible only to their claimant and the reporter of the related item.

### 5.1 Submit a claim

`POST /items/:id/claim` — Authentication required.

The authenticated user submits proof of ownership for an active item. A user cannot claim their own item, submit another pending claim for the same item, or claim an item that is already resolved. Request body:

```json
{ "proof_of_ownership": "The charger has blue electrical tape around the joint near the connector jack." }
```

`201 Created` returns `claim_id` and `status: "PENDING"`; the reporter is notified. The item moves from `OPEN` to `CLAIM_PENDING` while it has one or more pending claims. `404 ITEM_NOT_FOUND`, `403 CANNOT_CLAIM_OWN_ITEM`, `409 ITEM_NOT_OPEN`, and `409 PENDING_CLAIM_EXISTS` describe common failures.

### 5.2 List claims for an item (finder review queue)

`GET /items/:id/claims` — Authentication required; only the item reporter may call this endpoint.

Returns claims for the item, newest first, including each claim's `id`, `claimant_id`, `proof_of_ownership`, `status`, and `created_at`. The reporter may see the proof so they can evaluate it; contact details are not included. Supports `page` and `limit` pagination with the same defaults and maximum as `GET /items`. Returns `403 NOT_ITEM_REPORTER` for anyone else.

### 5.3 Get a claim and its status

`GET /claims/:id` — Authentication required; accessible only to the claimant or the reporter of the associated item.

Returns `claim_id`, `item_id`, `status`, and `created_at`. `proof_of_ownership` is returned only to the claimant and the reporter. This endpoint lets a claimant check whether their claim was approved or rejected. It does not reveal contact details; an approved claimant obtains those through `GET /items/:id`. Returns `404 CLAIM_NOT_FOUND` or `403 FORBIDDEN` as appropriate.

### 5.4 Approve or reject a claim

`PATCH /claims/:id/status` — Authentication required; only the reporter of the associated item may call this endpoint.

Request body:

```json
{ "status": "APPROVED" }
```

`status` must be `APPROVED` or `REJECTED`. A claim can be decided only while `PENDING`; decisions are final. `200 OK` returns the claim ID and updated status. **This response never includes reporter contact details.** On approval, the approved claimant can retrieve contact details from `GET /items/:id`. On rejection, no contact is revealed. If no pending claims remain after a rejection, the item returns to `OPEN`; if any other pending claim remains, it stays `CLAIM_PENDING`. Approval leaves the item available for the reporter to mark `RESOLVED` after handoff. Returns `403 NOT_ITEM_REPORTER`, `404 CLAIM_NOT_FOUND`, or `409 CLAIM_ALREADY_DECIDED` when applicable.

## 6. Common errors and access rules

| HTTP status | Example error code | Meaning |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Missing, malformed, or unsupported request value. |
| `401` | `UNAUTHENTICATED` | Missing, invalid, or expired JWT. |
| `403` | `FORBIDDEN` | Authenticated user lacks permission for the requested resource/action. |
| `404` | `ITEM_NOT_FOUND`, `CLAIM_NOT_FOUND` | Requested resource does not exist or is not visible to the requester. |
| `409` | `CONFLICT` | Request conflicts with the current resource state, such as duplicate registration or a decided claim. |
| `413` | `FILE_TOO_LARGE` | Image exceeds the configured maximum. |
| `500` | `INTERNAL_ERROR` | Unexpected server error; response must not expose secrets or stack traces. |

Every authenticated endpoint requires a verified account. API responses must not expose `password_hash`, verification tokens, Supabase service credentials, or private claim notes to anyone except the claimant and the item's reporter.
