import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Validates the monitoring config under ops/ in the same images the stacks run: Prometheus configs and
 * rules, promtool tests, Alertmanager and blackbox configs, runbook links and dashboards. Needs Docker.
 */
const root = path.resolve(import.meta.dirname, "../..");
const ops = path.join(root, "ops");
const PROMETHEUS = "prom/prometheus:v3.5.0";
const ALERTMANAGER = "prom/alertmanager:v0.28.1";
const BLACKBOX = "prom/blackbox-exporter:v0.27.0";
const RUNBOOK_URL =
  /runbook_url: https:\/\/github\.com\/krotrn\/alumini\/blob\/main\/ops\/runbooks\/(R-\d+)\.md/;

const problems: string[] = [];
const scratch = mkdtempSync(path.join(tmpdir(), "ops-check-"));
const docker = (args: string[]) =>
  execFileSync("docker", ["run", "--rm", ...args], { stdio: "inherit" });

function step(name: string, run: () => unknown) {
  console.log(`\n▶ ${name}`);
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    problems.push(`${name}: ${message.split("\n")[0]}`);
  }
}

type Dashboard = {
  uid: string;
  panels?: {
    title: string;
    datasource?: { uid?: string };
    targets?: { expr?: string }[];
  }[];
};

const prometheusDir = path.join(ops, "prometheus");
const rulesDir = path.join(prometheusDir, "rules");
const testsDir = path.join(prometheusDir, "tests");

step("promtool check config (and the rules it loads)", () =>
  docker([
    "-v",
    `${path.join(prometheusDir, "prometheus.yml")}:/etc/prometheus/prometheus.yml:ro`,
    "-v",
    `${rulesDir}:/etc/prometheus/rules:ro`,
    "--entrypoint",
    "promtool",
    PROMETHEUS,
    "check",
    "config",
    "/etc/prometheus/prometheus.yml",
  ])
);

// deploy/monitoring.yml writes these two from the env files; promtool wants every referenced file to exist.
writeFileSync(path.join(scratch, "health_check_token"), "token");
writeFileSync(
  path.join(scratch, "probe-targets.json"),
  '[{"targets": ["https://alumni.example.org/health/ready"]}]'
);
step("promtool check config ops/prometheus/production.yml", () =>
  docker([
    "-e",
    "DEPLOY_ENV=production",
    "-v",
    `${path.join(prometheusDir, "production.yml")}:/etc/prometheus/prometheus.yml:ro`,
    "-v",
    `${rulesDir}:/etc/prometheus/rules:ro`,
    "-v",
    `${path.join(scratch, "health_check_token")}:/etc/prometheus/health_check_token:ro`,
    "-v",
    `${path.join(scratch, "probe-targets.json")}:/etc/prometheus/probe-targets.json:ro`,
    "--entrypoint",
    "promtool",
    PROMETHEUS,
    "check",
    "config",
    "/etc/prometheus/prometheus.yml",
  ])
);

step("blackbox exporter --config.check", () =>
  docker([
    "-v",
    `${path.join(ops, "blackbox", "blackbox.yml")}:/etc/blackbox/blackbox.yml:ro`,
    BLACKBOX,
    "--config.file=/etc/blackbox/blackbox.yml",
    "--config.check",
  ])
);

step("promtool test rules", () =>
  docker([
    "-v",
    `${prometheusDir}:/etc/prometheus:ro`,
    "-w",
    "/etc/prometheus/tests",
    "--entrypoint",
    "promtool",
    PROMETHEUS,
    "test",
    "rules",
    ...readdirSync(testsDir).filter((file) => file.endsWith(".test.yml")),
  ])
);

step("amtool check-config", () =>
  docker([
    "-v",
    `${path.join(ops, "alertmanager", "alertmanager.yml")}:/etc/alertmanager/alertmanager.yml:ro`,
    "-v",
    `${path.join(ops, "alertmanager", "secrets.example")}:/etc/alertmanager/secrets:ro`,
    "--entrypoint",
    "amtool",
    ALERTMANAGER,
    "check-config",
    "/etc/alertmanager/alertmanager.yml",
  ])
);

step(
  "every alert has severity, summary, description and an existing runbook",
  () => {
    const tested = readdirSync(testsDir)
      .map((file) => readFileSync(path.join(testsDir, file), "utf8"))
      .join("\n");
    for (const file of readdirSync(rulesDir).filter((f) =>
      f.endsWith(".yml")
    )) {
      const text = readFileSync(path.join(rulesDir, file), "utf8");
      for (const block of text.split(/\n\s+- alert: /).slice(1)) {
        const name = (block.split("\n")[0] ?? "").trim();
        const where = `${file} ${name}`;
        if (!/severity: (page|ticket|none)/.test(block))
          problems.push(`${where}: no severity page|ticket|none`);
        if (!/summary: /.test(block)) problems.push(`${where}: no summary`);
        if (!/description: /.test(block))
          problems.push(`${where}: no description`);
        const runbook = block.match(RUNBOOK_URL)?.[1];
        if (!runbook)
          problems.push(`${where}: no runbook_url into ops/runbooks`);
        else if (!existsSync(path.join(ops, "runbooks", `${runbook}.md`)))
          problems.push(
            `${where}: runbook ops/runbooks/${runbook}.md does not exist`
          );
        if (!new RegExp(`alertname: ${name}\\b`).test(tested))
          problems.push(`${where}: no promtool test`);
      }
    }
  }
);

step("dashboards are valid JSON on the provisioned datasource", () => {
  const dir = path.join(ops, "grafana", "dashboards");
  const uids = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const dashboard = JSON.parse(
      readFileSync(path.join(dir, file), "utf8")
    ) as Dashboard;
    if (uids.has(dashboard.uid))
      problems.push(`${file}: duplicate uid ${dashboard.uid}`);
    uids.add(dashboard.uid);
    for (const panel of dashboard.panels ?? []) {
      if (panel.datasource?.uid !== "prometheus")
        problems.push(
          `${file} "${panel.title}": datasource is not "prometheus"`
        );
      if (!panel.targets?.length || panel.targets.some((t) => !t.expr))
        problems.push(`${file} "${panel.title}": a target has no expression`);
    }
  }
});

rmSync(scratch, { recursive: true, force: true });
if (problems.length > 0) {
  console.error(`\nops check failed:\n- ${problems.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("\nops check OK");
}
