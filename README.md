# OAU Campus Lost & Found API

TypeScript/Express REST API backed by PostgreSQL. All API routes use the `/api/v1` prefix. Public item information requires a verified user's bearer JWT; reporter contact details are returned only to a claimant whose claim for that item has been approved.

## Requirements

- Node.js LTS
- PostgreSQL 14+

## Setup

1. Copy `.env.example` to `.env` and configure `DATABASE_URL`, a strong `JWT_SECRET`, and Supabase Storage credentials. Keep `SUPABASE_SERVICE_ROLE_KEY` on the server only.
2. Install packages with `npm install`.
3. Configure `DATABASE_URL` for your Supabase Postgres connection. For local PostgreSQL, set `DATABASE_SSL=false`.
4. Run `npm run db:migrate` and `npm run db:seed`.
5. Run `npm run dev` for local development or `npm run build && npm start` for production.

In development, if SMTP is not configured, verification links are printed to the server log. Production requires SMTP settings. Set `FRONTEND_VERIFICATION_URL` to a frontend page that accepts a `token` query parameter, or leave it empty to use the API verification URL.

## API routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | No | Register an OAU email account |
| GET | `/api/v1/auth/verify-email?token=...` | No | Verify email |
| POST | `/api/v1/auth/login` | No | Sign in and receive JWT |
| POST | `/api/v1/auth/logout` | Yes | Revoke the current bearer token and end the session |
| GET | `/api/v1/items` | Yes | Search and paginate item feed |
| POST | `/api/v1/items` | Yes | Report a lost or found item |
| GET | `/api/v1/items/:id` | Yes | Item detail; approved claimant contact reveal |
| PATCH | `/api/v1/items/:id/status` | Yes | Reporter marks an item resolved |
| POST | `/api/v1/items/:id/claim` | Yes | Submit ownership proof |
| GET | `/api/v1/items/:id/claims` | Yes | Reporter lists claims and proof notes |
| GET | `/api/v1/claims/:id` | Yes | Claimant/reporter gets claim status |
| PATCH | `/api/v1/claims/:id/status` | Yes | Item reporter approves or rejects a claim |
| GET | `/api/v1/locations` | Yes | Preset campus locations |
| POST | `/api/v1/uploads/sign` | Yes | Create a scoped Supabase Storage upload token |
| GET | `/health` | No | Health check |

All errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`. Request bodies use JSON. Phone and WhatsApp numbers are stored and returned in the local Nigerian format entered by the student.

## Notes

- Item images use the public `item-images` Supabase Storage bucket. Request a signed token from `/api/v1/uploads/sign`, upload directly with the Supabase SDK, then submit the returned `public_url` in `image_urls`.
- The location seed list is an editable starting set and can be extended through SQL/admin tooling.
- Approval reveals contact details only to the approved claimant through `GET /api/v1/items/:id`. The reporter marks the item `RESOLVED` after arranging the handoff.
