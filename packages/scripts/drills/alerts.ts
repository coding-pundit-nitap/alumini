#!/usr/bin/env node
// Alert drill (Phase 18C; reliability §5.1, §11 "test page received end-to-end incl. dead-man's switch"; spec 18
// PRD-8). Runs Prometheus and Alertmanager from deploy/monitoring.yml with the production flags, rules
// (ops/prometheus/rules), routing (ops/alertmanager/alertmanager.yml) and receiver mechanism (compose configs
// from monitoring.env). Two things are swapped: the scrape targets are a stand-in exporter served by this
// script, and the receiver URLs point at a webhook sink it also serves.
//
//   injected                                          expected
//   two web targets refusing connections              one pager notification with both WebDown alerts (grouping)
//   redis_up{job="redis-queue"} 0 + outbox age 600 s  QueueRedisDown paged; OutboxStuck suppressed (inhibition)
//   redis_up{job="redis-cache"} 0                     CacheRedisDown at the ticket receiver (routing)
//   nothing                                           Watchdog at the dead-man's switch about every minute
//   docker compose stop prometheus                    heartbeats stop within 2 minutes (spec 18C C-7)
//
//   node packages/scripts/drills/alerts.ts [--record] [--summary f] [--keep]
//
// --record appends the result to docs/operations/alert-drills.md, --summary <file> to another file (CI's step
// summary). Exit code 1 if any check fails. About 7 minutes, most of it waiting for the rules' `for:`.
import { execFileSync } from "node:child_process";
import type { ExecFileSyncOptions } from "node:child_process";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";

const root = path.resolve(import.meta.dirname, "../../..");
const work = path.join(root, ".drill-alerts");
const project = "alumini-drill-alerts";
const appNetwork = `${project}-app`;

const { values: args } = parseArgs({
  options: {
    "sink-port": { type: "string", default: "55100" },
    "exporter-port": { type: "string", default: "55101" },
    "prometheus-port": { type: "string", default: "55190" },
    "alertmanager-port": { type: "string", default: "55193" },
    record: { type: "boolean", default: false },
    summary: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});
const host = "host.docker.internal";
// Nothing listens on these: the two web "instances" refuse connections, so up{job="web"} is 0.
const deadPorts = [
  Number(args["exporter-port"]) + 10,
  Number(args["exporter-port"]) + 11,
];
const amUrl = `http://127.0.0.1:${args["alertmanager-port"]}`;

const results: { name: string; pass: boolean; detail?: string }[] = [];
const measurements: { what: string; value: string }[] = [];
const check = (name: string, pass: boolean, detail?: string) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${detail ?? ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secs = (ms: number) => `${(ms / 1000).toFixed(0)} s`;

function run(
  cmd: string,
  cmdArgs: string[],
  options: ExecFileSyncOptions = {}
) {
  execFileSync(cmd, cmdArgs, {
    cwd: work,
    stdio: ["ignore", "inherit", "inherit"],
    ...options,
  });
}
const compose = (...a: string[]) =>
  run(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      path.join(root, "deploy/monitoring.yml"),
      "-f",
      path.join(work, "override.yml"),
      "--env-file",
      path.join(work, "app.env"),
      "--env-file",
      path.join(work, "monitoring.env"),
      ...a,
    ],
    { cwd: path.join(root, "deploy") }
  );

// ---------------------------------------------------------------------------------------------- sink and exporter
type Alert = {
  status: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
};
type Notification = {
  receiver: string;
  at: number;
  status: string;
  groupLabels: Record<string, string>;
  alerts: Alert[];
};
const received: Notification[] = [];
const listen = (server: Server, port: string) =>
  new Promise<void>((resolve) =>
    server.listen(Number(port), "0.0.0.0", resolve)
  );

const sink = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk: Buffer) => (body += chunk.toString()));
  req.on("end", () => {
    try {
      const parsed = JSON.parse(body) as Omit<Notification, "receiver" | "at">;
      const receiver = (req.url ?? "").slice(1);
      received.push({ ...parsed, receiver, at: Date.now() });
      console.log(
        `sink  ${receiver.padEnd(16)} ${parsed.status.padEnd(8)} ${parsed.alerts.map((a) => a.labels.alertname).join(", ")}`
      );
    } catch {
      // not a webhook payload
    }
    res.writeHead(200).end();
  });
});

const series: Record<string, string> = {
  "/worker": "outbox_oldest_unpublished_age_seconds 600\n",
  "/redis-queue": "redis_up 0\n",
  "/redis-cache": "redis_up 0\n",
};
const exporter = createServer((req, res) => {
  const text = series[req.url ?? ""];
  if (text === undefined) res.writeHead(404).end();
  else
    res
      .writeHead(200, { "content-type": "text/plain; version=0.0.4" })
      .end(text);
});

const delivered = (alertname: string, receiver?: string) =>
  received.filter(
    (n) =>
      (!receiver || n.receiver === receiver) &&
      n.alerts.some((a) => a.labels.alertname === alertname)
  );

async function waitFor(what: string, done: () => boolean, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (done()) return true;
    await sleep(1000);
  }
  console.log(`timed out waiting for ${what}`);
  return false;
}

// ---------------------------------------------------------------------------------------------- setup
function writeFiles() {
  mkdirSync(work, { recursive: true });
  // monitoring.yml interpolates every service's variables, including those of services the drill does not start.
  writeFileSync(
    path.join(work, "app.env"),
    [
      "DEPLOY_ENV=drill",
      "APP_URL=http://web.invalid",
      "HEALTH_CHECK_TOKEN=drill",
      "POSTGRES_PASSWORD=unused",
      "",
    ].join("\n")
  );
  const sinkUrl = `http://${host}:${args["sink-port"]}`;
  writeFileSync(
    path.join(work, "monitoring.env"),
    [
      "MONITORING_DB_PASSWORD=unused",
      "GRAFANA_ADMIN_PASSWORD=unused",
      `ALERT_PAGER_URL=${sinkUrl}/pager`,
      `ALERT_TICKET_URL=${sinkUrl}/ticket`,
      `ALERT_DEADMANS_SWITCH_URL=${sinkUrl}/deadmans-switch`,
      `PROMETHEUS_PORT=${args["prometheus-port"]}`,
      `ALERTMANAGER_PORT=${args["alertmanager-port"]}`,
      "",
    ].join("\n")
  );
  // ops/prometheus/production.yml with the drill's targets: same intervals, rules, Alertmanager and labels.
  const target = (
    job: string,
    targets: string[],
    metricsPath = "/metrics"
  ) => ({
    job_name: job,
    metrics_path: metricsPath,
    scrape_interval: "5s",
    static_configs: [{ targets }],
  });
  const exporterAddress = `${host}:${args["exporter-port"]}`;
  writeFileSync(
    path.join(work, "prometheus.yml"),
    JSON.stringify(
      {
        global: {
          scrape_interval: "15s",
          evaluation_interval: "15s",
          external_labels: { environment: "${DEPLOY_ENV}" },
        },
        rule_files: ["/etc/prometheus/rules/*.yml"],
        alerting: {
          alertmanagers: [
            { static_configs: [{ targets: ["alertmanager:9093"] }] },
          ],
        },
        scrape_configs: [
          target(
            "web",
            deadPorts.map((p) => `${host}:${p}`)
          ),
          target("worker", [exporterAddress], "/worker"),
          target("redis-queue", [exporterAddress], "/redis-queue"),
          target("redis-cache", [exporterAddress], "/redis-cache"),
        ],
      },
      null,
      2
    )
  );
  const hostGateway = { extra_hosts: [`${host}:host-gateway`] };
  writeFileSync(
    path.join(work, "override.yml"),
    JSON.stringify(
      {
        services: {
          prometheus: {
            ...hostGateway,
            volumes: [
              `${path.join(work, "prometheus.yml")}:/etc/prometheus/prometheus.yml:ro`,
            ],
          },
          alertmanager: hostGateway,
        },
      },
      null,
      2
    )
  );
}

function teardown() {
  try {
    compose("down", "-v", "--remove-orphans");
  } catch {
    // never started
  }
  try {
    execFileSync("docker", ["network", "rm", appNetwork], { stdio: "ignore" });
  } catch {
    // not there
  }
  rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------- the drill
const started = new Date();
try {
  teardown();
  writeFiles();
  await listen(sink, args["sink-port"]);
  await listen(exporter, args["exporter-port"]);
  run("docker", ["network", "create", appNetwork], { stdio: "ignore" });
  process.env.APP_NETWORK = appNetwork;
  compose("up", "-d", "--wait", "prometheus", "alertmanager");
  const t0 = Date.now();

  // ------------------------------------------------------------------------------------ firing
  const allArrived = () =>
    delivered("WebDown", "pager").length > 0 &&
    delivered("QueueRedisDown", "pager").length > 0 &&
    delivered("CacheRedisDown", "ticket").length > 0 &&
    delivered("Watchdog", "deadmans-switch").length >= 3;
  await waitFor("the injected alerts", allArrived, 6 * 60_000);

  const firstPage = received.find((n) => n.receiver === "pager");
  if (firstPage)
    measurements.push({
      what: "Injection to first page (rules' `for: 2m`, group_wait 30 s)",
      value: secs(firstPage.at - t0),
    });

  const webDown = delivered("WebDown", "pager")[0];
  const webInstances = new Set(
    webDown?.alerts
      .filter((a) => a.labels.alertname === "WebDown")
      .map((a) => a.labels.instance)
  );
  check(
    "WebDown paged once for both instances (grouping)",
    webInstances.size === 2 && delivered("WebDown").length === 1,
    `${webInstances.size} alerts in ${delivered("WebDown").length} notification(s), grouped by ${Object.keys(webDown?.groupLabels ?? {}).join(", ")}`
  );
  check(
    "QueueRedisDown paged",
    delivered("QueueRedisDown", "pager").length > 0
  );
  check(
    "CacheRedisDown went to the ticket receiver, not the pager",
    delivered("CacheRedisDown", "ticket").length > 0 &&
      delivered("CacheRedisDown", "pager").length === 0
  );
  const outbox = (await fetch(
    `${amUrl}/api/v2/alerts?filter=${encodeURIComponent('alertname="OutboxStuck"')}`
  ).then((r) => r.json())) as {
    status: { state: string; inhibitedBy: string[] };
  }[];
  check(
    "OutboxStuck fired but was suppressed by QueueRedisDown (inhibition), never delivered",
    outbox.length === 1 &&
      outbox[0]?.status.state === "suppressed" &&
      (outbox[0]?.status.inhibitedBy.length ?? 0) > 0 &&
      delivered("OutboxStuck").length === 0,
    `${outbox[0]?.status.state ?? "not in Alertmanager"}`
  );
  const alerts = received.flatMap((n) => n.alerts);
  check(
    "every delivered alert has a runbook and the environment label",
    alerts.length > 0 &&
      alerts.every(
        (a) =>
          /\/ops\/runbooks\/R-\d+\.md$/.test(a.annotations.runbook_url ?? "") &&
          a.labels.environment === "drill"
      ),
    `${alerts.length} alerts`
  );
  const beats = delivered("Watchdog", "deadmans-switch").map((n) => n.at);
  const gaps = beats.slice(1).map((t, i) => t - (beats[i] ?? t));
  const gap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  measurements.push({
    what: "Watchdog heartbeat interval (mean)",
    value: secs(gap),
  });
  const widest = Math.max(0, ...gaps);
  measurements.push({
    what: "Watchdog heartbeat interval (longest)",
    value: secs(widest),
  });
  // The external switch pages after 3 silent minutes (deploy/README step 9): a heartbeat slower than 90 s
  // leaves too little margin.
  check(
    "Watchdog reaches the dead-man's switch about every minute",
    beats.length >= 3 && gap >= 45_000 && widest <= 90_000,
    `${beats.length} heartbeats, mean gap ${secs(gap)}, longest ${secs(widest)}`
  );

  // The README's test alert (deploy step 9), sent the way the owner will send it.
  compose(
    "exec",
    "-T",
    "alertmanager",
    "amtool",
    "alert",
    "add",
    "DrillTest",
    "severity=ticket",
    "service=monitoring",
    "--alertmanager.url=http://localhost:9093"
  );
  await waitFor(
    "the amtool test alert",
    () => delivered("DrillTest", "ticket").length > 0,
    90_000
  );
  check(
    "a test alert from amtool (README step 9) reaches the ticket receiver",
    delivered("DrillTest", "ticket").length > 0
  );

  // ------------------------------------------------------------------------------------ dead-man's switch
  compose("stop", "prometheus");
  const stopped = Date.now();
  const lastBeat = () =>
    Math.max(0, ...delivered("Watchdog", "deadmans-switch").map((n) => n.at));
  // Silent for 2.5 minutes (2.5 heartbeat intervals) means the heartbeat has stopped.
  await waitFor(
    "the heartbeat to stop",
    () => Date.now() - Math.max(lastBeat(), stopped) > 150_000,
    7 * 60_000
  );
  const outlived = lastBeat() - stopped;
  measurements.push({
    what: "Last heartbeat after Prometheus stopped",
    value: outlived > 0 ? secs(outlived) : "none",
  });
  check(
    "heartbeats stop within 2 minutes of Prometheus stopping (C-7)",
    Date.now() - lastBeat() > 150_000 && outlived <= 120_000,
    outlived > 0
      ? `last one ${secs(outlived)} after the stop`
      : "none after the stop"
  );
} catch (error) {
  check(
    "drill ran to completion",
    false,
    error instanceof Error ? error.message : String(error)
  );
} finally {
  sink.close();
  exporter.close();
  if (args.keep) console.log(`kept: ${work} and compose project ${project}`);
  else teardown();
}

const failed = results.filter((r) => !r.pass);
const report = [
  "",
  `## ${started.toISOString().slice(0, 16).replace("T", " ")} UTC — drill (packages/scripts/drills/alerts.ts) — ${failed.length ? "FAIL" : "PASS"}`,
  "",
  `Prometheus and Alertmanager from deploy/monitoring.yml with the production rules and routing, on ${process.env.DRILL_HOST ?? "a developer machine"}; stand-in exporter and webhook sink.`,
  "",
  "| Measurement | Value |",
  "| --- | --- |",
  ...measurements.map((m) => `| ${m.what} | ${m.value} |`),
  "",
  "| Check | Result | Detail |",
  "| --- | --- | --- |",
  ...results.map(
    (r) =>
      `| ${r.name} | ${r.pass ? "pass" : "**FAIL**"} | ${String(r.detail ?? "").replaceAll("|", "\\|")} |`
  ),
  "",
].join("\n");
if (args.record)
  appendFileSync(path.join(root, "docs/operations/alert-drills.md"), report);
if (args.summary) appendFileSync(args.summary, report);
process.exit(failed.length === 0 ? 0 : 1);
