# OAU Campus Lost & Found API

TypeScript/Express REST API backed by PostgreSQL. All API routes use the `/v1` prefix. Public item information requires a verified user's bearer JWT; reporter contact details are returned only to a claimant whose claim for that item has been approved.

## Requirements

- Node.js LTS
- PostgreSQL 14+

## Setup

1. Copy `.env.example` to `.env` and configure `DATABASE_URL` and a strong `JWT_SECRET`.
2. Install packages with `npm install`.
3. Create the PostgreSQL database named in `DATABASE_URL`.
4. Run `npm run db:migrate` and `npm run db:seed`.
5. Run `npm run dev` for local development or `npm run build && npm start` for production.

In development, if SMTP is not configured, verification links are printed to the server log. Production requires SMTP settings. Set `FRONTEND_VERIFICATION_URL` to a frontend page that accepts a `token` query parameter, or leave it empty to use the API verification URL.

## API routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/v1/auth/register` | No | Register an OAU email account |
| GET | `/v1/auth/verify-email?token=...` | No | Verify email |
| POST | `/v1/auth/login` | No | Sign in and receive JWT |
| GET | `/v1/items` | Yes | Search and paginate item feed |
| POST | `/v1/items` | Yes | Report a lost or found item |
| GET | `/v1/items/:id` | Yes | Item detail; approved claimant contact reveal |
| POST | `/v1/items/:id/claim` | Yes | Submit ownership proof |
| PATCH | `/v1/claims/:id/status` | Yes | Item reporter approves or rejects a claim |
| GET | `/v1/locations` | Yes | Preset campus locations |
| GET | `/health` | No | Health check |

All errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`. Request bodies use JSON. Phone and WhatsApp numbers are stored and returned in the local Nigerian format entered by the student.

## Notes

- Item images are accepted as externally hosted HTTP(S) URLs; upload/storage is outside this API contract.
- The location seed list is an editable starting set and can be extended through SQL/admin tooling.
- Approval marks the item `RESOLVED`; the approved claimant obtains contact details through `GET /v1/items/:id`.
