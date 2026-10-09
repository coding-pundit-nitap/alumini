# Release drills

Appended by `packages/scripts/drills/release.ts --record`; read by `packages/scripts/launch-check.ts`. Never edit a past entry.

## 2026-10-08 18:21 UTC — drill (packages/scripts/drills/release.ts) — PASS

Production release tooling (deploy/compose.yml, deploy/deploy.sh) on a developer machine; staging and production clones of a local origin, local registry. N+1 adds two expand migrations (nullable column, CONCURRENTLY index).

| Step                                                                                  | Duration |
| ------------------------------------------------------------------------------------- | -------- |
| build images                                                                          | 33.9 s   |
| staging: deploy.sh pull                                                               | 18.4 s   |
| staging: deploy.sh pull                                                               | 8.3 s    |
| production: deploy.sh pull                                                            | 0.0 s    |
| production: deploy.sh promote 0000000 drill                                           | 0.0 s    |
| production: deploy.sh promote 13e7e95082 Drill Approver                               | 18.0 s   |
| production: deploy.sh promote ba25ecf848efff2199c6c0a27390acd8f38fef80 Drill Approver | 7.5 s    |
| production: deploy.sh rollback 13e7e95082                                             | 5.1 s    |
| production: deploy.sh promote 13e7e95082826d8051ac035a5e47b84512a828d4 drill          | 0.0 s    |
| production: deploy.sh promote ba25ecf848efff2199c6c0a27390acd8f38fef80 Drill Approver | 7.4 s    |

| Production release                | Longest /health/live interruption |
| --------------------------------- | --------------------------------- |
| promote N → N+1 (with migrations) | 2.6 s                             |
| rollback N+1 → N                  | 2.7 s                             |
| promote N → N+1 again             | 2.6 s                             |

Expand migrations took 12 ms (the release's migrate step, from `_prisma_migrations`).

| Check                                                               | Result | Detail                                                                                            |
| ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| staging pull N: released, digests pinned, smoke passed              | pass   | 2026-10-08T18:22:06Z sha=13e7e95082826d8051ac035a5e47b84512a828d4 env=staging so                  |
| staging pull N+1: migrations applied, smoke passed                  | pass   | ba25ecf848ef smoke=pass                                                                           |
| production refuses pull                                             | pass   | exit 1                                                                                            |
| production refuses a SHA staging never passed                       | pass   | exit 1                                                                                            |
| promote N: staging's digests, approver recorded, smoke passed       | pass   | web sha256:f02f805ad396                                                                           |
| live web image is N's digest                                        | pass   | localhost:55000/nitap-web@sha256:f02f805ad396ba50fef1c64362ff8574ee232c80164aeb70320dac6a8af2abbe |
| promote N+1: staging's digests, smoke passed                        | pass   | smoke=pass                                                                                        |
| expand migrations applied by the release                            | pass   | 12 ms                                                                                             |
| rollback N: old release passes smoke on the new schema              | pass   | smoke=pass, schema kept                                                                           |
| live web image is N's digest again                                  | pass   |                                                                                                   |
| promote of an older SHA is refused (rollback's job)                 | pass   | exit 1                                                                                            |
| release N+1 again after the rollback                                | pass   | smoke=pass                                                                                        |
| worker running on N+1                                               | pass   |                                                                                                   |
| longest interruption within 30 s (else blue/green is a launch gate) | pass   | 2.7 s                                                                                             |

## 2026-10-08 22:20 UTC — drill (packages/scripts/drills/release.ts) — PASS

Production release tooling (deploy/compose.yml, deploy/deploy.sh) on a developer machine; staging and production clones of a local origin, local registry. N+1 adds two expand migrations (nullable column, CONCURRENTLY index).

| Step                                                                                  | Duration |
| ------------------------------------------------------------------------------------- | -------- |
| build images                                                                          | 131.7 s  |
| staging: deploy.sh pull                                                               | 18.2 s   |
| staging: deploy.sh pull                                                               | 7.9 s    |
| production: deploy.sh pull                                                            | 0.0 s    |
| production: deploy.sh promote 0000000 drill                                           | 0.0 s    |
| production: deploy.sh promote 3b64785329 Drill Approver                               | 18.3 s   |
| production: deploy.sh promote 20ec2867cc44c27be176cc9a8b7a7b29632006c7 Drill Approver | 7.8 s    |
| production: deploy.sh rollback 3b64785329                                             | 5.1 s    |
| production: deploy.sh promote 3b64785329fc8c43fff77ec48d419b361f629529 drill          | 0.0 s    |
| production: deploy.sh promote 20ec2867cc44c27be176cc9a8b7a7b29632006c7 Drill Approver | 7.8 s    |
| production: monitoring.sh up -d (all targets up)                                      | 22.4 s   |

| Production release                | Longest /health/live interruption |
| --------------------------------- | --------------------------------- |
| promote N → N+1 (with migrations) | 2.6 s                             |
| rollback N+1 → N                  | 2.5 s                             |
| promote N → N+1 again             | 2.6 s                             |

Expand migrations took 12 ms (the release's migrate step, from `_prisma_migrations`).

| Check                                                                                        | Result | Detail                                                                                                    |
| -------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| staging pull N: released, digests pinned, smoke passed                                       | pass   | 2026-10-08T22:22:51Z sha=3b64785329fc8c43fff77ec48d419b361f629529 env=staging so                          |
| staging pull N+1: migrations applied, smoke passed                                           | pass   | 20ec2867cc44 smoke=pass                                                                                   |
| production refuses pull                                                                      | pass   | exit 1                                                                                                    |
| production refuses a SHA staging never passed                                                | pass   | exit 1                                                                                                    |
| promote N: staging's digests, approver recorded, smoke passed                                | pass   | web sha256:ff8a6d8598eb                                                                                   |
| live web image is N's digest                                                                 | pass   | localhost:55000/nitap-web@sha256:ff8a6d8598ebe0e0f2f1f481b06254e099aadc7c64f2111d994361cf8913a067         |
| promote N+1: staging's digests, smoke passed                                                 | pass   | smoke=pass                                                                                                |
| expand migrations applied by the release                                                     | pass   | 12 ms                                                                                                     |
| rollback N: old release passes smoke on the new schema                                       | pass   | smoke=pass, schema kept                                                                                   |
| live web image is N's digest again                                                           | pass   |                                                                                                           |
| promote of an older SHA is refused (rollback's job)                                          | pass   | exit 1                                                                                                    |
| release N+1 again after the rollback                                                         | pass   | smoke=pass                                                                                                |
| worker running on N+1                                                                        | pass   |                                                                                                           |
| monitoring: every scrape target up (web and worker with the token, postgres as `monitoring`) | pass   | 9 targets                                                                                                 |
| monitoring: the series the alerts need exist                                                 | pass   | public probe succeeds, smoke sign-in counted, scan backlog gauge, pg_wal size, host disk, backup textfile |
| monitoring: no alert pending or firing on a healthy release                                  | pass   | only Watchdog                                                                                             |
| longest interruption within 30 s (else blue/green is a launch gate)                          | pass   | 2.6 s                                                                                                     |
