import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

/**
 * Checks the launch report, docs/operations/launch-readiness.md (spec 18D). Every evidence reference on a row
 * must resolve:
 *
 *   test:<path>[#<name>]   a test file that a suite CI runs collects; with a name, that test is in it, not skipped
 *   drill:<file>[#<check>] the newest entry of docs/operations/<file> passed within 35 days, and lists the check
 *   doc:<path>[#<text>]    a repository file exists and contains the text
 *   ci:<workflow>          the newest completed run of that workflow on main succeeded (needs gh; else open)
 *   owner:<OW-n>           an owner checklist row (§4 of the report); open until ticked
 *
 * Also: every SRS §50 box has a row, and the documentation audit (runbooks R-1 … R-15, the deploy README's
 * sections). Broken evidence exits 1. Open items are listed and exit 0, or 2 with --strict: the launch gate.
 * docs/ is not tracked, so this runs locally, not in CI (spec 18D D-1).
 *
 *   node packages/scripts/launch-check.ts [--strict] [--report path]
 */
const root = path.resolve(import.meta.dirname, "../..");
const { values: args } = parseArgs({
  options: {
    strict: { type: "boolean", default: false },
    report: {
      type: "string",
      default: "docs/operations/launch-readiness.md",
    },
  },
});

const DRILL_MAX_AGE_DAYS = 35;
// R-13 is donation reconciliation: there is no payment provider to reconcile against (ops/README).
const RUNBOOKS_NOT_SHIPPED = new Set(["R-13"]);
const README_SECTIONS = [
  ...Array.from({ length: 9 }, (_, i) => `### ${i + 1}. `),
  "## Staging",
  "## Releasing",
  "## Rollback",
  "## Operating",
  "## Before launch",
];

type Status = "proven" | "open" | "broken";
type Result = { status: Status; detail: string };
const ok = (detail = ""): Result => ({ status: "proven", detail });
const open = (detail: string): Result => ({ status: "open", detail });
const broken = (detail: string): Result => ({ status: "broken", detail });

const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const exists = (file: string) => existsSync(path.join(root, file));

// ---------------------------------------------------------------- test:

type Project = {
  name: string | undefined;
  include: string[];
  exclude: string[];
};
type Suite = { dir: string; projects: Project[]; scripts: string[] };

const ciWorkflow = read(".github/workflows/pr.yml");
const ciRuns = {
  test: /pnpm test\b|turbo run test(?!:)/.test(ciWorkflow),
  "test:integration": ciWorkflow.includes("test:integration"),
  "test:e2e": ciWorkflow.includes("test:e2e"),
};

/** The projects a package's script runs: every `--project` it names, or all of them. */
function projectsRun(script: string | undefined, projects: Project[]) {
  if (!script?.includes("vitest run")) return [];
  const named = [...script.matchAll(/--project[= ](\S+)/g)].map((m) => m[1]);
  return named.length > 0
    ? projects.filter((p) => p.name && named.includes(p.name))
    : projects;
}

async function loadSuites(): Promise<Suite[]> {
  const suites: Suite[] = [];
  for (const parent of ["apps", "packages"]) {
    for (const name of readdirSync(path.join(root, parent))) {
      const dir = path.join(parent, name);
      const config = path.join(root, dir, "vitest.config.mts");
      if (!existsSync(config)) continue;
      const { default: loaded } = (await import(config)) as {
        default: {
          test?: Partial<Project> & { projects?: { test: Partial<Project> }[] };
        };
      };
      const test = loaded.test ?? {};
      const projects: Project[] = (
        test.projects?.map((p) => p.test) ?? [test]
      ).map((p) => ({
        name: p.name,
        include: p.include ?? ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
        exclude: p.exclude ?? ["node_modules"],
      }));
      const pkg = JSON.parse(read(path.join(dir, "package.json"))) as {
        scripts?: Record<string, string>;
      };
      const scripts = (["test", "test:integration"] as const).filter(
        (s) => ciRuns[s] && projectsRun(pkg.scripts?.[s], projects).length > 0
      );
      suites.push({
        dir,
        projects: projects.filter((p) =>
          scripts.some((s) =>
            projectsRun(pkg.scripts?.[s], projects).includes(p)
          )
        ),
        scripts,
      });
    }
  }
  return suites;
}

const matches = (file: string, pattern: string) =>
  path.matchesGlob(file, pattern) ||
  path.matchesGlob(file, `${pattern}/**`) ||
  file.split(path.sep).includes(pattern);

function collectedBy(file: string, suites: Suite[]) {
  for (const suite of suites) {
    const relative = path.relative(suite.dir, file);
    const project = suite.projects.find(
      (p) =>
        p.include.some((g) => path.matchesGlob(relative, g)) &&
        !p.exclude.some((g) => matches(relative, g))
    );
    if (project) return `${suite.dir} ${project.name ?? "vitest"}`;
  }
  const playwright = "apps/web/tests/e2e/";
  if (
    file.startsWith(playwright) &&
    file.endsWith(".spec.ts") &&
    ciRuns["test:e2e"]
  )
    return "apps/web e2e";
  return undefined;
}

function checkTest(ref: string, suites: Suite[]): Result {
  const [file, name] = splitRef(ref);
  if (!exists(file)) return broken(`${file}: no such file`);
  const suite = collectedBy(file, suites);
  if (!suite) return broken(`${file}: no suite CI runs collects it`);
  if (!name) return ok(suite);
  const lines = read(file).split("\n");
  const at = lines.findIndex((line) => line.includes(name));
  if (at < 0) return broken(`${file}: no test named "${name}"`);
  const call = lines.slice(Math.max(0, at - 2), at + 1).join(" ");
  if (/\.(skip|todo|fixme)\(/.test(call))
    return broken(`${file}: "${name}" is skipped`);
  return ok(suite);
}

// ---------------------------------------------------------------- drill:

const ENTRY =
  /^## (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC — drill \(([^)]*)\) — (PASS|FAIL)\s*$/gm;

function checkDrill(ref: string): Result {
  const [name, check] = splitRef(ref);
  const file = path.join("docs/operations", name);
  if (!exists(file)) return broken(`${file}: no such file`);
  const text = read(file);
  const entries = [...text.matchAll(ENTRY)].map((m) => ({
    at: new Date(`${m[1]}T${m[2]}:00Z`),
    result: m[4],
    start: m.index,
  }));
  const [newest] = entries.toSorted((a, b) => b.at.getTime() - a.at.getTime());
  if (!newest) return broken(`${file}: no drill entries`);
  const end = entries.find((e) => e.start > newest.start)?.start ?? text.length;
  const body = text.slice(newest.start, end);
  const day = newest.at.toISOString().slice(0, 10);
  const age = (Date.now() - newest.at.getTime()) / 86_400_000;
  if (newest.result !== "PASS")
    return broken(`${name}: newest entry ${day} failed`);
  if (age > DRILL_MAX_AGE_DAYS)
    return broken(
      `${name}: newest entry ${day} is ${Math.floor(age)} days old`
    );
  if (check && !body.includes(check))
    return broken(`${name}: entry ${day} has no "${check}"`);
  return ok(`${name} ${day}`);
}

// ---------------------------------------------------------------- doc:, ci:

function checkDoc(ref: string): Result {
  const [file, text] = splitRef(ref);
  if (!exists(file)) return broken(`${file}: no such file`);
  if (text && !read(file).includes(text))
    return broken(`${file}: does not contain "${text}"`);
  return ok();
}

function checkCi(workflow: string): Result {
  try {
    const out = execFileSync(
      "gh",
      [
        "run",
        "list",
        "--workflow",
        workflow,
        "--branch",
        "main",
        "--status",
        "completed",
        "--limit",
        "1",
        "--json",
        "conclusion,headSha,createdAt",
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const [run] = JSON.parse(out) as {
      conclusion: string;
      headSha: string;
      createdAt: string;
    }[];
    if (!run) return open(`${workflow}: no completed run on main`);
    const detail = `${workflow} ${run.headSha.slice(0, 7)} ${run.createdAt.slice(0, 10)}`;
    return run.conclusion === "success"
      ? ok(detail)
      : broken(`${detail}: ${run.conclusion}`);
  } catch {
    return open(`${workflow}: gh unavailable, not verified`);
  }
}

// ---------------------------------------------------------------- the report

function splitRef(ref: string): [string, string | undefined] {
  const at = ref.indexOf("#");
  return at < 0 ? [ref, undefined] : [ref.slice(0, at), ref.slice(at + 1)];
}

const cells = (line: string) =>
  line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());

const REF = /`(test|drill|doc|ci|owner):([^`]+)`/g;
const OWNER_ROW = /^\|\s*(OW-\d+)\s*\|/;

const report = read(args.report);
const owners = new Map<string, { item: string; done: string | undefined }>();
for (const line of report.split("\n")) {
  const id = OWNER_ROW.exec(line)?.[1];
  if (!id) continue;
  const row = cells(line);
  const status = row.at(-1) ?? "";
  owners.set(id, {
    item: row[1] ?? "",
    done: /^\[x\]/i.test(status) ? status.slice(3).trim() : undefined,
  });
}

const suites = await loadSuites();
const sections: {
  heading: string;
  rows: { label: string; results: Result[] }[];
}[] = [];
let group = "";
for (const line of report.split("\n")) {
  const heading = /^(##+) (.*)/.exec(line);
  if (heading) {
    const title = heading[2] ?? "";
    group = heading[1] === "###" ? title : "";
    sections.push({ heading: title, rows: [] });
    continue;
  }
  if (!line.startsWith("|") || OWNER_ROW.test(line)) continue;
  const refs = [...line.matchAll(REF)];
  if (refs.length === 0) continue;
  const results = refs.map(([, kind, ref = ""]): Result => {
    switch (kind) {
      case "test":
        return checkTest(ref, suites);
      case "drill":
        return checkDrill(ref);
      case "doc":
        return checkDoc(ref);
      case "ci":
        return checkCi(ref);
      default: {
        const owner = owners.get(ref);
        if (!owner) return broken(`${ref}: not in the owner checklist`);
        return owner.done ? ok(`${ref} ${owner.done}`) : open(ref);
      }
    }
  });
  sections.at(-1)?.rows.push({
    label: `${group ? `${group}: ` : ""}${cells(line)[0]}`,
    results,
  });
}

// ---------------------------------------------------------------- completeness and documentation

const audit: string[] = [];

const srs = read("docs/requirements/p1.md");
const acceptance = srs.slice(
  srs.indexOf("# 50. Acceptance Criteria"),
  srs.indexOf("# 51.")
);
const labels = new Set(sections.flatMap((s) => s.rows.map((r) => r.label)));
let box = "";
for (const line of acceptance.split("\n")) {
  const heading = /^### (.*)/.exec(line);
  if (heading) box = heading[1] ?? "";
  const item = /^- \[[ x]\] (.*)/.exec(line);
  if (item && !labels.has(`${box}: ${item[1]}`))
    audit.push(`SRS §50 "${box}: ${item[1]}" has no row in the report`);
}

for (let n = 1; n <= 15; n++) {
  const id = `R-${n}`;
  if (!RUNBOOKS_NOT_SHIPPED.has(id) && !exists(`ops/runbooks/${id}.md`))
    audit.push(`runbook ops/runbooks/${id}.md is missing`);
}
const readme = read("deploy/README.md");
for (const section of README_SECTIONS)
  if (!readme.split("\n").some((l) => l.startsWith(section)))
    audit.push(`deploy/README.md has no "${section.trim()}" section`);

// ---------------------------------------------------------------- output

const mark = { proven: "✔", open: "○", broken: "✘" } as const;
const counts = { proven: 0, open: 0, broken: 0 };
for (const section of sections) {
  if (section.rows.length === 0) continue;
  console.log(`\n${section.heading}`);
  for (const row of section.rows) {
    const status: Status = row.results.some((r) => r.status === "broken")
      ? "broken"
      : row.results.some((r) => r.status === "open")
        ? "open"
        : "proven";
    counts[status]++;
    console.log(`  ${mark[status]} ${row.label}`);
    for (const r of row.results)
      if (r.status !== "proven")
        console.log(`      ${mark[r.status]} ${r.detail}`);
  }
}

console.log("\nDocumentation audit");
if (audit.length === 0)
  console.log(
    "  ✔ runbooks R-1 … R-15, deploy README sections, every SRS §50 box has a row"
  );
for (const problem of audit) console.log(`  ✘ ${problem}`);

const pending = [...owners].filter(([, o]) => !o.done);
if (pending.length > 0) console.log("\nOwner checklist, open");
for (const [id, owner] of pending) console.log(`  ○ ${id} ${owner.item}`);
console.log(
  `\n${counts.proven} proven, ${counts.open} open, ${counts.broken} broken; owner checklist ${owners.size - pending.length}/${owners.size} done`
);
if (counts.broken > 0 || audit.length > 0) {
  console.log("launch check FAILED: fix the broken evidence above");
  process.exit(1);
}
console.log(
  counts.open === 0
    ? "launch check OK: every row is proven"
    : "evidence OK; launch waits on the open rows"
);
if (args.strict && counts.open > 0) process.exit(2);
