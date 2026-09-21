import fs from "node:fs";
import path from "node:path";

const SOURCE_FILE = /\.ts$/;
const TEST_FILE = /\.test\.ts$/;
// Matches a relative import that walks out of the worker app into apps/web (any number of `../`
// segments, then `web/`), e.g. `../../web/src/proxy.ts` or `../../../apps/web/src/x.ts`.
const WEB_IMPORT = /from\s+["'](?:\.\.\/)+(?:apps\/)?web\//;

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const rel = (root: string, full: string) =>
  path.relative(root, full).split(path.sep).join("/");

/**
 * The worker must not depend on the Next.js app (ADR-018): they are two deployables sharing packages,
 * not code. Test files are ignored.
 *
 * A hand-written substitute for the dependency-cruiser rule `worker-never-imports-web`: with the
 * workspace on TypeScript 7, dependency-cruiser@18.3.1 (which requires TypeScript <7) parses 0 files
 * and enforces nothing (TASK.md, 2026-09-21). This checker is the one that actually runs.
 */
export function checkNoWebImports(appRoot: string): string[] {
  const violations: string[] = [];
  for (const file of walk(appRoot)) {
    if (!SOURCE_FILE.test(file) || TEST_FILE.test(file)) continue;
    const match = WEB_IMPORT.exec(fs.readFileSync(file, "utf8"));
    if (match) {
      violations.push(
        `${rel(appRoot, file)} imports from apps/web (${match[0].trim()})`
      );
    }
  }
  return violations;
}
