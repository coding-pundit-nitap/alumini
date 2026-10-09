# Operations

How the service is expected to behave in production, and what to do when it doesn't. The procedures live
next to the tooling:

- [`deploy/README.md`](../deploy/README.md): server setup, releases, rollback, backups, restore, monitoring setup
- [`deploy/docs/reliability-operations.md`](../deploy/docs/reliability-operations.md): restore runbook, deploy procedure, expand → migrate → contract
- [`ops/README.md`](../ops/README.md): alert rules, dashboards, and how to change an alert
- [`ops/runbooks/`](../ops/runbooks): one runbook per alert; [`ops/comms-templates.md`](../ops/comms-templates.md) for user notices

## Targets

| Target             | Value                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Availability       | 99.5% per month (about 3.6 hours of downtime budget)                                               |
| API latency        | p50 < 200 ms, p95 < 500 ms, p99 < 1 s; error rate < 0.1%. The k6 suite in `perf/k6` enforces these |
| Async freshness    | Oldest unpublished outbox event under 5 minutes                                                    |
| Database RPO / RTO | At most 15 minutes of data lost (5 in practice); restored within 2 hours                           |
| Restore proven     | A successful restore test within the last 35 days                                                  |

Only PostgreSQL needs this recovery objective. The queue Redis is rebuilt from the outbox, the cache Redis
restarts empty, uploads are mirrored daily, and monitoring data isn't backed up (its config is in git).

## Releases

- Every release is an image built by CI from a green `main` commit, pinned by digest. Staging releases it
  first; production promotes exactly the digests that passed staging's smoke test.
- Migrations run before the new app starts and must be expand-only, so the previous release still works on
  the new schema. That's what makes `deploy.sh rollback` safe without a down-migration.
- The worker is backwards compatible with older job payloads; a payload with a newer version waits instead
  of failing.
- The release and restore drills (`.github/workflows/release-drill.yml`, `restore-drill.yml`) run monthly
  and append results to `packages/scripts/drills/reports/`.

## Logging

JSON lines on stdout. Each has `timestamp`, `level`, `service`, `version`, `request_id`, `user_id`, `event`
(`domain.subject.outcome`, e.g. `auth.login.failed`) and `metadata`.

- `error`: something failed that wasn't the caller's fault. `warn`: handled but abnormal (fallbacks,
  retries, denials). `info`: business and lifecycle events. Client mistakes are never `error`, so the error
  rate stays meaningful.
- **Never log** passwords, tokens, verification or reset links, message bodies, request bodies, cookies,
  `Authorization` headers, or email addresses. Log ids and outcomes. Redaction is enforced centrally, in
  the logger and in the error tracker's `beforeSend`.
- The `request_id` follows a request into its outbox row and the worker's job, so one id finds everything.

## Incidents

| Severity | Example                                                       | Response                                      |
| -------- | ------------------------------------------------------------- | --------------------------------------------- |
| SEV-1    | Site down, database lost, confirmed data exposure             | Immediately; status message within 30 minutes |
| SEV-2    | Sign-in or registration broken, outbox stuck, backups failing | Within 15 minutes in coverage hours           |
| SEV-3    | Email delayed, one job type failing, search degraded          | Same or next business day                     |
| SEV-4    | No user impact                                                | Ticket                                        |

1. Acknowledge, then check what changed last. If a recent deploy is plausible, roll back first and
   investigate after.
2. Check the dependencies: PostgreSQL, both Redis instances, the worker, Nginx, disk.
3. Mitigate before diagnosing. Change one thing at a time and write it down.
4. Never run an unreviewed manual change against the production database; use the runbook's reviewed
   transaction.
5. For SEV-1 and SEV-2, write a blameless postmortem within 5 working days.

Security incidents follow runbook R-10: preserve evidence, rotate secrets, and agree the user notice with the
institute.
