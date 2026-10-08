# Monitoring as code

Alerts, routing, dashboards and runbooks for the web and worker processes (Phase 13C, ADR-028). Everything
here is reviewed like code and checked in CI by `pnpm ops:check`.

| Path                            | What                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `prometheus/prometheus.yml`     | Local scrape config: web `:3000`, worker `:3001`, PostgreSQL and both Redis exporters                                    |
| `prometheus/production.yml`     | Production scrape config, run by `deploy/monitoring.yml` (spec 18C): app, exporters, node_exporter, the public probe     |
| `blackbox/blackbox.yml`         | The public probe's module: `/health/ready` answers 200, certificate expiry (R-12)                                        |
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

## Production

`deploy/monitoring.yml` runs this stack on the application host (spec 18C), set up in
[deploy/README.md step 9](../deploy/README.md#9-monitoring). The receiver URLs come from `deploy/monitoring.env`;
web and worker are scraped with `HEALTH_CHECK_TOKEN`. Two drills prove it end to end
(`.github/workflows/release-drill.yml`, monthly):

- `packages/scripts/drills/alerts.ts`: these rules and this routing deliver a page, a ticket and the dead-man's-switch
  heartbeat to a sink, group and inhibit as configured, and the heartbeat stops within 2 minutes of Prometheus
  stopping ([alert drills](../docs/operations/alert-drills.md)).
- `packages/scripts/drills/release.ts` ends by starting the stack against a real release: every target up, the
  series the alerts need present, and nothing pending on a healthy system.

## Not shipped yet

Alerts only ship for series that something exports (overview OD-6). These wait for their owner:

| Alert (reliability §5.6)         | Runbook | Waits for                                                       |
| -------------------------------- | ------- | --------------------------------------------------------------- |
| Site down, from outside the host | R-1     | An external uptime check, set up by the owner (deploy step 9)   |
| Domain expiry                    | R-12    | Registrar auto-renew (owner checklist); not a Prometheus series |
| Container restarts               | R-1     | cAdvisor                                                        |
| Donation reconciliation mismatch | R-13    | A payment-provider integration                                  |
| New error class after deploy     | R-2     | Configured in the error tracker, not Prometheus                 |

The internal half of R-1 ships as `SiteProbeFailing` (the blackbox probe through Nginx and TLS); disk and
`pg_wal` (R-7), certificate expiry (R-12), login failures (R-9, `auth_sign_in_total`) and the upload scan
backlog (R-14, `upload_scan_oldest_pending_age_seconds`) ship with spec 18C. The backup alerts (R-8) get
their job timestamps from node_exporter's textfile collector, which `deploy/monitoring.yml` points at
`BACKUP_METRICS_DIR`.
