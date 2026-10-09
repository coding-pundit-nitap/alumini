# Restore tests

Appended by `packages/scripts/drills/restore.ts --record`; read by `packages/scripts/launch-check.ts`. Never edit a past entry.

## 2026-10-08 16:31 UTC — drill (packages/scripts/drills/restore.mjs) — PASS

Production configuration (deploy/compose.yml, deploy/backup.sh) on the developer workstation (Arch Linux, Docker 29.8.2, 16 CPUs); stand-in repository: TLS MinIO on the same host. Cluster 323 MB, 10000 perf users; heartbeat soak 420 s.

| Step                                                     | Duration |
| -------------------------------------------------------- | -------- |
| build images (postgres, migrate)                         | 7.0 s    |
| seed (migrations N-1, base seed, accounts, perf volume)  | 32.3 s   |
| full backup (backup.sh init)                             | 8.7 s    |
| logical dump (backup.sh dump)                            | 0.8 s    |
| differential backup                                      | 1.3 s    |
| archive check (backup.sh check)                          | 0.2 s    |
| D restore latest (backup.sh restore)                     | 5.4 s    |
| D reconcile migrations + integrity (backup.sh integrity) | 3.2 s    |
| D app boot + smoke test                                  | 1.4 s    |
| C restore-test to the recorded moment                    | 8.4 s    |

**Measured RPO 109.1 s; RTO 10.4 s** (host loss to signed-in read on the restored database).

| Check                                            | Result | Detail                                                                                                                                                                                       |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| logical dump decrypts and lists                  | pass   | 41 tables                                                                                                                                                                                    |
| D data loss within RPO (15 min)                  | pass   | 109.1 s (last write 2026-10-08T16:40:27.817Z, restored to 2026-10-08T16:38:38.706Z)                                                                                                          |
| D newest migration applied on top of the restore | pass   | 20261001120000_donations                                                                                                                                                                     |
| D constraints valid, migration status up to date | pass   | backup.sh integrity                                                                                                                                                                          |
| D row counts equal before and after the loss     | pass   | 41 tables                                                                                                                                                                                    |
| app ready on the restored database               | pass   | 200                                                                                                                                                                                          |
| sign in with a restored account                  | pass   | 200                                                                                                                                                                                          |
| authenticated read (GET /api/v1/alumni)          | pass   | 200                                                                                                                                                                                          |
| D recovery within RTO (2 h)                      | pass   | 10.4 s                                                                                                                                                                                       |
| C rows deleted after the target are back         | pass   | 100 of 100                                                                                                                                                                                   |
| C nothing after the target                       | pass   | 0 later rows                                                                                                                                                                                 |
| success metrics exported for every job           | pass   | alumini_backup_check.prom alumini_backup_diff.prom alumini_backup_dump.prom alumini_backup_full.prom alumini_backup_restore.prom alumini_backup_restore_test.prom alumini_backup_verify.prom |

Reading this run: RPO 109 s is where the kill fell in the 300 s `archive_timeout` cycle; the bound is 300 s plus the push time. RTO 10.4 s is the mechanical path only, with the repository on the same host and the operator scripted. A real host loss adds detection, the decision, provisioning a new host and copying the repository over the network, and the first production `restore-test` against the real bucket replaces the local transfer time here.

## 2026-10-08 22:26 UTC — drill (packages/scripts/drills/restore.ts) — PASS

Production configuration (deploy/compose.yml, deploy/backup.sh) on a developer machine; stand-in repository: TLS MinIO on the same host. Cluster 323 MB, 10000 perf users; heartbeat soak 420 s.

| Step                                                     | Duration |
| -------------------------------------------------------- | -------- |
| build images (postgres, migrate)                         | 12.4 s   |
| seed (migrations N-1, base seed, accounts, perf volume)  | 30.3 s   |
| full backup (backup.sh init)                             | 6.7 s    |
| logical dump (backup.sh dump)                            | 0.7 s    |
| differential backup                                      | 1.4 s    |
| archive check (backup.sh check)                          | 0.2 s    |
| D restore latest (backup.sh restore)                     | 5.2 s    |
| D reconcile migrations + integrity (backup.sh integrity) | 3.3 s    |
| D app boot + smoke test                                  | 1.3 s    |
| C restore-test to the recorded moment                    | 8.5 s    |

**Measured RPO 115.9 s; RTO 10.3 s** (host loss to signed-in read on the restored database).

| Check                                            | Result | Detail                                                                                                                                                                                       |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| logical dump decrypts and lists                  | pass   | 41 tables                                                                                                                                                                                    |
| D data loss within RPO (15 min)                  | pass   | 115.9 s (last write 2026-10-08T22:34:04.117Z, restored to 2026-10-08T22:32:08.170Z)                                                                                                          |
| D newest migration applied on top of the restore | pass   | 20261001120000_donations                                                                                                                                                                     |
| D constraints valid, migration status up to date | pass   | backup.sh integrity                                                                                                                                                                          |
| D row counts equal before and after the loss     | pass   | 41 tables                                                                                                                                                                                    |
| app ready on the restored database               | pass   | 200                                                                                                                                                                                          |
| sign in with a restored account                  | pass   | 200                                                                                                                                                                                          |
| authenticated read (GET /api/v1/alumni)          | pass   | 200                                                                                                                                                                                          |
| D recovery within RTO (2 h)                      | pass   | 10.3 s                                                                                                                                                                                       |
| C rows deleted after the target are back         | pass   | 100 of 100                                                                                                                                                                                   |
| C nothing after the target                       | pass   | 0 later rows                                                                                                                                                                                 |
| success metrics exported for every job           | pass   | alumini_backup_check.prom alumini_backup_diff.prom alumini_backup_dump.prom alumini_backup_full.prom alumini_backup_restore.prom alumini_backup_restore_test.prom alumini_backup_verify.prom |
