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
 * Web and worker share packages, not code. Hand-written because
 * dependency-cruiser does not support TypeScript 7.
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
