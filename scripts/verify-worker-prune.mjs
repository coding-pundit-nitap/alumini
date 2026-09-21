import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * `turbo prune @nitap/worker --docker` builds the minimal workspace the worker image needs. This proves
 * the worker's dependency graph is what we intend: the worker and its packages are in, the web app and
 * the design system are out (ADR-018). It is also the Docker layer-caching input for the deploy phase.
 */
const out = mkdtempSync(path.join(tmpdir(), "worker-prune-"));
const mustContain = [
  "apps/worker",
  "packages/queue",
  "packages/email",
  "packages/jobs",
  "packages/observability",
  "database",
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
    console.log("worker prune OK: the worker's workspace is what ADR-018 says");
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
