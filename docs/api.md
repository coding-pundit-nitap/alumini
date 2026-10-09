# HTTP API

The web UI calls use cases directly through Server Components and Server Actions. `/api/v1` serves client-side
fetches (infinite lists, the bell, the message stream) and any future non-web client. Authentication lives at
`/api/auth/*` (Better Auth) and is not part of this contract.

The list of routes and who may call each one is
[`apps/web/tests/security/api-inventory.ts`](../apps/web/tests/security/api-inventory.ts); a test fails if a
route exists without an entry there.

## Conventions

- **JSON only.** A body with another `Content-Type` is `415`; a body over 64 KiB is `413`. Request bodies
  are validated strictly, so unknown fields are rejected.
- **Names:** `camelCase` fields, `UPPER_SNAKE_CASE` enum values, UUID ids, ISO 8601 UTC timestamps,
  `YYYY-MM-DD` dates.
- **Auth:** the Better Auth session cookie. Mutating requests must send an `Origin` from the app's own
  origin, otherwise `403 ORIGIN_NOT_ALLOWED`.
- **Server-owned fields** (owner ids, status, counters, timestamps) are never read from the request.
- **Request id:** every response carries `X-Request-Id`; a well-formed incoming one is reused.

### Responses

```json
{ "data": { } }
{ "data": [ ], "page": { "limit": 20, "nextCursor": "…", "hasMore": true } }
{ "error": { "code": "CONNECTION_EXISTS", "message": "…", "details": [ ] }, "requestId": "…" }
```

Clients branch on `error.code`, never on `message`. `400 VALIDATION_FAILED` has one `details` entry per field
(`{ field, code, message }`). The full catalogue, with each code's status and message, is `ERROR_CATALOG` in
[`apps/web/src/lib/errors.ts`](../apps/web/src/lib/errors.ts).

| Status    | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| 400       | Invalid input (`VALIDATION_FAILED`, `MALFORMED_REQUEST`, `INVALID_CURSOR`)      |
| 401       | No valid session                                                                |
| 403       | Signed in but not allowed (permission, account state, origin)                   |
| 404       | Not found **or not visible to you**; the two are deliberately indistinguishable |
| 409       | Conflicts with current state: duplicates, capacity, invalid transitions         |
| 413 / 415 | Body too large / not JSON                                                       |
| 429       | Rate limited, with `Retry-After`                                                |
| 503       | A dependency is down, with `Retry-After`                                        |

### Pagination

Keyset cursors: `?limit=` (1–50, default 20) and `?cursor=` from the previous `page.nextCursor`. Cursors are
opaque; no offsets and no totals. A tampered cursor is `400 INVALID_CURSOR`.

### Idempotency

`POST /connections`, `/events`, `/events/:id/registrations`, `/jobs` and `/mentorships` accept
`Idempotency-Key: <uuid>`, scoped to the user and kept 24 hours:

- the same key with the same request replays the stored response, marked with `Idempotent-Replay: true`;
- the same key with a different request is `409 IDEMPOTENCY_KEY_REUSED`;
- the same key while the first request is still running is `409 REQUEST_IN_PROGRESS`.

Without a key, the database constraint still answers with the natural conflict (`CONNECTION_EXISTS`,
`ALREADY_REGISTERED`). Sending a message is idempotent on `clientMessageId` instead.

## Endpoints

All under `/api/v1` unless noted.

| Area          | Routes                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory     | `GET /alumni`                                                                                                                                                                                                                                                                               |
| Connections   | `GET, POST /connections` · `PATCH, DELETE /connections/:id` · `POST /blocks`                                                                                                                                                                                                                |
| Mentorship    | `GET /mentors` · `GET, PUT /mentors/me` · `GET, POST /mentorships` · `PATCH /mentorships/:id`                                                                                                                                                                                               |
| Messaging     | `GET, POST /conversations` · `GET /conversations/:id` · `GET, POST /conversations/:id/messages` · `POST /conversations/:id/read` · `POST /conversations/:id/participants` · `DELETE /conversations/:id/participants/:userId` · `GET /messages/stream` (SSE)                                 |
| Feed          | `GET /posts` · `GET /posts/:id/comments`                                                                                                                                                                                                                                                    |
| Jobs          | `GET, POST /jobs` · `GET, PATCH /jobs/:id` · `POST /jobs/:id/approve`, `/reject`, `/close`                                                                                                                                                                                                  |
| Events        | `GET, POST /events` · `GET /events/:id` · `POST /events/:id/cancel` · `GET, POST /events/:id/registrations` · `DELETE /events/:id/registrations/me` · `PATCH /events/:id/registrations/:registrationId`                                                                                     |
| Notifications | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `GET, PATCH /notifications/preferences`                                                                                                                        |
| Moderation    | `GET, POST /reports` · `PATCH /reports/:id`                                                                                                                                                                                                                                                 |
| Admin         | `GET /admin/users` · `GET, PATCH /admin/users/:id` · `POST /admin/users/:id/roles` · `DELETE /admin/users/:id/roles/:role` · `POST /admin/users/:id/permission-grants` · `DELETE /admin/users/:id/permission-grants/:grantId` · `GET /admin/audit-log` · `POST /admin/notifications/replay` |

Outside `/api/v1`:

| Route                                              | Purpose                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `/api/auth/*`                                      | Better Auth: sign-up, sign-in, sign-out, email verification, password reset |
| `GET /api/photos/:userId`                          | Profile photo: checks visibility, redirects to a short-lived presigned URL  |
| `GET /api/uploads/:id`                             | Post image, same pattern                                                    |
| `/storage/*`                                       | Same-origin proxy to object storage when `S3_PUBLIC_PATH=/storage`          |
| `/health/live`, `/health/ready`, `/health/startup` | Probes                                                                      |
| `POST /health/drain`                               | Take the instance out of rotation before stopping it                        |
| `GET /metrics`                                     | Prometheus; needs `HEALTH_CHECK_TOKEN` in production                        |

Feed writes, achievements, profiles, uploads, donations and most admin actions are Server Actions in `src/app`,
not HTTP endpoints. Add an `/api/v1` route only when a client needs one.

## Adding a route

1. Wrap it in `routeHandler` (request id, error mapping, logging); read bodies with `readJson`.
2. Parse params with `uuidParam`, call the use case, return `{ data }`. No business logic in the route file.
3. Mutations call `assertSameOrigin`; creates that aren't naturally idempotent use `respondIdempotently`.
4. Add the route to `tests/security/api-inventory.ts` with its access rule.
