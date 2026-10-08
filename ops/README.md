# Monitoring as code

Alerts, routing, dashboards and runbooks for the web and worker processes (Phase 13C, ADR-028). Everything
here is reviewed like code and checked in CI by `pnpm ops:check`.

| Path                            | What                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `prometheus/prometheus.yml`     | Local scrape config: web `:3000`, worker `:3001`, PostgreSQL and both Redis exporters                                    |
| `prometheus/rules/*.yml`        | Alert rules. Each has `severity` (`page`/`ticket`/`none`), `service`, `summary`, `description`, `runbook_url`            |
| `prometheus/tests/*.test.yml`   | promtool unit tests: every rule fires on injected series and stays quiet below its threshold                             |
| `alertmanager/alertmanager.yml` | Routing (page / ticket / dead-man's switch) and inhibition. Receiver URLs come from files in `/etc/alertmanager/secrets` |
| `grafana/`                      | Datasource and dashboard provisioning; dashboards in `grafana/dashboards/*.json`                                         |
| `runbooks/R-<n>.md`             | What to do when an alert fires. Every alert links one                                                                    |

## Run it locally

```sh
pnpm docker:observability          # Prometheus :9090, Alertmanager :9093, Grafana :3030 (admin/admin)
pnpm dev                           # web on :3000
pnpm --filter @nitap/worker dev    # worker, /metrics on :3001
pnpm docker:observability:down
```

Outside production `/metrics` is open; in production it needs `Authorization: Bearer $HEALTH_CHECK_TOKEN`
(add `authorization.credentials_file` to the web and worker scrape jobs there).

## Change an alert

1. Edit the rule, keeping the labels and annotations above.
2. Add or update its cases in `prometheus/tests/`: one where it fires (with the exact rendered annotations) and one where it must not.
3. Link a runbook in `runbooks/`; write one if the alert needs a new response.
4. `pnpm ops:check` (needs Docker).

Metrics the app labels `job` (`jobs_processed_total`, `jobs_dead_total`, `job_duration_seconds`) are scraped as
`exported_job`, because `job` is Prometheus's target label.

## Not shipped yet

Alerts only ship for series that something exports (overview OD-6). These wait for their owner:

| Alert (reliability §5.6)             | Runbook | Waits for                                         |
| ------------------------------------ | ------- | ------------------------------------------------- |
| Site down (external synthetic probe) | R-1     | External probe, hosting (Phase 18)                |
| Disk / host                          | R-7     | `node_exporter` with hosting (Phase 17/18)        |
| Certificate / domain expiry          | R-12    | Production proxy and blackbox exporter (Phase 18) |
| Donation reconciliation mismatch     | R-13    | A payment-provider integration                    |
| Upload scan backlog                  | R-14    | A `PENDING_SCAN` age gauge in the worker          |
| Login-failure spike                  | R-9     | A login-failure counter in auth                   |
| New error class after deploy         | R-2     | Configured in the error tracker, not Prometheus   |

The backup alerts (`rules/backups.yml`, R-8) ship: WAL archiving comes from postgres_exporter, and the job
timestamps from `deploy/backup.sh` through node_exporter's textfile collector
(`--collector.textfile.directory=/var/lib/prometheus/node-exporter`), which arrives with the host's
node_exporter (R-7). Until then `BackupMetricsMissing` is the only one of them that can fire.

Production placement of this stack waits for hosting (O-2). The dead-man's-switch receiver must point at a
service outside our infrastructure.
