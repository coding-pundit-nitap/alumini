# Load tests (Phase 15)

k6 scenarios for strategy §13, run from the `grafana/k6` container. Decisions, environment caveats and results:
[Phase 15 overview](../docs/superpowers/specs/2026-10-01-phase-15-performance-overview.md) ·
[results](../docs/operations/perf/).

```sh
pnpm docker:up && set -a && . ./.env && set +a
pnpm --filter @nitap/web build
pnpm perf:seed -- --users 10000        # builds alumini_perf + perf/.data/fixture.json (git-ignored); --reset rebuilds
pnpm perf:run directory --smoke        # 2 req/s for 30 s, writes nothing
pnpm perf:run directory --rate 50      # 30 s ramp + 3 min hold; result → docs/operations/perf/data/<date>/
pnpm perf:run events --reset-spike     # registration spike against the seeded spike event
pnpm perf:run mixed --rate 100 --worker
pnpm perf:run mixed --env STRESS=1 --env MAX=600   # raise the rate until a budget breaks
```

| Script             | Measures                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| `directory.js`     | `GET /api/v1/alumni` with filters and a next page                              |
| `search.js`        | `GET /api/v1/alumni?q=` — names, companies, skills, substrings, typos          |
| `feed.js`          | `GET /api/v1/posts` and a next page                                            |
| `auth.js`          | sign-in (scrypt; own budget) and the session read every request pays           |
| `events.js`        | 1 000 members registering for one event within ~10 s; capacity respected       |
| `messaging.js`     | inbox, a thread, sends                                                         |
| `notifications.js` | unread-count polling and the inbox list                                        |
| `pages.js`         | rendered pages, anonymous and signed in (`--env PAGE=/dashboard` for one page) |
| `mixed.js`         | the TDS §25.2 user model: ~100 req/s for 1 000 concurrent members              |

Thresholds are the SRS §47 budgets (`lib.js`), so a run that breaks one exits 99.
