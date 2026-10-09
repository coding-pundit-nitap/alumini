# Alert drills

Appended by `packages/scripts/drills/alerts.ts --record`. Never edit a past entry.

## 2026-10-08 21:56 UTC — drill (packages/scripts/drills/alerts.ts) — PASS

Prometheus and Alertmanager from deploy/monitoring.yml with the production rules and routing, on a developer machine; stand-in exporter and webhook sink.

| Measurement                                                 | Value |
| ----------------------------------------------------------- | ----- |
| Injection to first page (rules' `for: 2m`, group_wait 30 s) | 169 s |
| Watchdog heartbeat interval (mean)                          | 57 s  |
| Watchdog heartbeat interval (longest)                       | 60 s  |
| Last heartbeat after Prometheus stopped                     | none  |

| Check                                                                                | Result | Detail                                                       |
| ------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------ |
| WebDown paged once for both instances (grouping)                                     | pass   | 2 alerts in 1 notification(s), grouped by alertname, service |
| QueueRedisDown paged                                                                 | pass   |                                                              |
| CacheRedisDown went to the ticket receiver, not the pager                            | pass   |                                                              |
| OutboxStuck fired but was suppressed by QueueRedisDown (inhibition), never delivered | pass   | suppressed                                                   |
| every delivered alert has a runbook and the environment label                        | pass   | 7 alerts                                                     |
| Watchdog reaches the dead-man's switch about every minute                            | pass   | 3 heartbeats, mean gap 57 s, longest 60 s                    |
| a test alert from amtool (README step 9) reaches the ticket receiver                 | pass   |                                                              |
| heartbeats stop within 2 minutes of Prometheus stopping                              | pass   | none after the stop                                          |
