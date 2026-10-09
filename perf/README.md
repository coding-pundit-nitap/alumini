# Load tests

k6 scenarios, run from the `grafana/k6` container. Results and environment caveats:
[results](../packages/scripts/perf/results/).

```sh
pnpm docker:up && set -a && . ./.env && set +a
pnpm --filter @nitap/web build
pnpm perf:seed -- --users 10000        # builds alumini_perf + perf/.data/fixture.json (git-ignored); --reset rebuilds
pnpm perf:run directory --smoke        # 2 req/s for 30 s, writes nothing
pnpm perf:run directory --rate 50      # 30 s ramp + 3 min hold; result → packages/scripts/perf/results/data/<date>/
pnpm perf:run events --reset-spike     # registration spike against the seeded spike event
pnpm perf:run mixed --rate 100 --worker
pnpm perf:run mixed --env STRESS=1 --env MAX=600   # raise the rate until a budget breaks
```

| Script             | Measures                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| `directory.ts`     | `GET /api/v1/alumni` with filters and a next page                              |
| `search.ts`        | `GET /api/v1/alumni?q=` — names, companies, skills, substrings, typos          |
| `feed.ts`          | `GET /api/v1/posts` and a next page                                            |
| `auth.ts`          | sign-in (scrypt; own budget) and the session read every request pays           |
| `events.ts`        | 1 000 members registering for one event within ~10 s; capacity respected       |
| `messaging.ts`     | inbox, a thread, sends                                                         |
| `notifications.ts` | unread-count polling and the inbox list                                        |
| `pages.ts`         | rendered pages, anonymous and signed in (`--env PAGE=/dashboard` for one page) |
| `mixed.ts`         | the target user model: ~100 req/s for 1 000 concurrent members                 |

Thresholds are the budgets (`lib.ts`), so a run that breaks one exits 99.
