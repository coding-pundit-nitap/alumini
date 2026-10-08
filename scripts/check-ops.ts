import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Checks the monitoring code under ops/ (spec 13C C-8), in the same pinned images the local stack runs:
 * Prometheus config and rules parse, every alert rule's promtool unit tests pass, Alertmanager's config is
 * valid, every alert links a runbook that exists, and every dashboard is valid JSON on the provisioned
 * datasource. Needs Docker; CI runs it in the `observability` job.
 */
const root = path.resolve(import.meta.dirname, "..");
const ops = path.join(root, "ops");
const PROMETHEUS = "prom/prometheus:v3.5.0";
const ALERTMANAGER = "prom/alertmanager:v0.28.1";
const RUNBOOK_URL =
  /runbook_url: https:\/\/github\.com\/krotrn\/alumini\/blob\/main\/ops\/runbooks\/(R-\d+)\.md/;

const problems: string[] = [];
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

if (problems.length > 0) {
  console.error(`\nops check failed:\n- ${problems.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("\nops check OK");
}
