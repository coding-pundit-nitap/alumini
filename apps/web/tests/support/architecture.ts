import fs from "node:fs";
import path from "node:path";

/**
 * Filesystem architecture rules (strategy §2.4 item 6 and §2.5). Returns human-readable violations
 * relative to `srcRoot`; an empty list means the layout is sound.
 * Import direction is enforced by ESLint (packages/eslint-config/boundaries.mjs) and cycles/DAG by
 * dependency-cruiser; this covers what neither can see.
 */

// Folders named for a kind of file grow without limit (§2.5).
const FORBIDDEN_FOLDERS = new Set([
  "utils",
  "helpers",
  "services",
  "common",
  "shared",
  "misc",
  "controllers",
]);

// Reviewed exceptions. Add here only with a reason:
//  - modules/*/application/services: the one sanctioned use, when two use cases share orchestration (§2.2)
//  - components/common: the app shell (header, footer) named in TDS §4.1
const ALLOWED_FOLDERS = [
  /^modules\/[^/]+\/application\/services$/,
  /^components\/common$/,
];

// `@nitap/database/permissions` is pure data (the permission registry) and may be imported anywhere.
const PRISMA_IMPORT =
  /from\s+["'](@nitap\/database(?!\/permissions["'])(\/[^"']*)?|@prisma\/[^"']+)["']/;
const PRISMA_HOMES = [/^infrastructure\//, /^modules\/[^/]+\/infrastructure\//];
const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;

const rel = (root: string, full: string) =>
  path.relative(root, full).split(path.sep).join("/");

function walk(dir: string): { dirs: string[]; files: string[] } {
  const dirs: string[] = [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = walk(full);
      dirs.push(full, ...inner.dirs);
      files.push(...inner.files);
    } else {
      files.push(full);
    }
  }
  return { dirs, files };
}

export function checkStructure(srcRoot: string): string[] {
  const violations: string[] = [];
  const { dirs, files } = walk(srcRoot);

  // Every module exposes a public API.
  const modulesDir = path.join(srcRoot, "modules");
  if (fs.existsSync(modulesDir)) {
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        !fs.existsSync(path.join(modulesDir, entry.name, "index.ts"))
      ) {
        violations.push(
          `modules/${entry.name} has no index.ts (its public API)`
        );
      }
    }
  }

  // Prisma stays behind infrastructure.
  for (const file of files) {
    const relative = rel(srcRoot, file);
    if (!SOURCE_FILE.test(file) || TEST_FILE.test(file)) continue;
    if (PRISMA_HOMES.some((home) => home.test(relative))) continue;
    if (PRISMA_IMPORT.test(fs.readFileSync(file, "utf8"))) {
      violations.push(
        `${relative} imports Prisma outside an infrastructure/ folder`
      );
    }
  }

  for (const dir of dirs) {
    const relative = rel(srcRoot, dir);
    const name = path.basename(dir);

    if (
      FORBIDDEN_FOLDERS.has(name) &&
      !ALLOWED_FOLDERS.some((allowed) => allowed.test(relative))
    ) {
      violations.push(
        `forbidden folder name "${name}": ${relative} (strategy §2.5)`
      );
    }
    if (fs.readdirSync(dir).length === 0) {
      violations.push(
        `empty directory ${relative} (no folders for appearance, strategy §2.2)`
      );
    }
  }

  return violations;
}

/**
 * RBAC §11: handlers, pages and use cases declare permissions, never role names. A role name inside a
 * quoted string in application source is a role check in disguise. Test files are ignored; the seed
 * and the RBAC tests legitimately name roles and live outside `src/`.
 */
export function checkNoRoleNames(
  srcRoot: string,
  roleNames: readonly string[]
): string[] {
  const pattern = new RegExp(`["'\`](${roleNames.join("|")})["'\`]`);
  const violations: string[] = [];
  for (const file of walk(srcRoot).files) {
    if (!SOURCE_FILE.test(file) || TEST_FILE.test(file)) continue;
    const match = pattern.exec(fs.readFileSync(file, "utf8"));
    if (match) {
      violations.push(
        `${rel(srcRoot, file)} names the role "${match[1]}"; check a permission with authorize() instead (rbac-permission-matrix.md §11)`
      );
    }
  }
  return violations;
}
