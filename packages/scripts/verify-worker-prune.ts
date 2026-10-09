import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Checks that `turbo prune @nitap/worker` includes the worker's packages and
 * excludes web and ui.
 */
const out = mkdtempSync(path.join(tmpdir(), "worker-prune-"));
const mustContain = [
  "apps/worker",
  "packages/queue",
  "packages/email",
  "packages/jobs",
  "packages/storage",
  "packages/observability",
  "packages/database",
];
const mustNotContain = ["apps/web", "packages/ui"];

try {
  execFileSync(
    "pnpm",
    ["exec", "turbo", "prune", "@nitap/worker", "--docker", "--out-dir", out],
    { stdio: "inherit" }
  );
  const problems = [
    ...mustContain
      .filter((dir) => !existsSync(path.join(out, "json", dir, "package.json")))
      .map((dir) => `missing from the pruned workspace: ${dir}`),
    ...mustNotContain
      .filter((dir) => existsSync(path.join(out, "json", dir, "package.json")))
      .map((dir) => `must not be in the worker's workspace: ${dir}`),
  ];
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("worker prune OK: the worker's workspace is what says");
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
