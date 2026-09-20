/**
 * Architecture rules that lint cannot see well (strategy §2.4 item 3): cycles, the module DAG,
 * deep cross-module imports, and workspace direction. Layer import bans live in
 * packages/eslint-config/boundaries.mjs.
 *
 * Run from apps/web (`pnpm arch`, which passes --ts-config so `@/` resolves) and from the repo root
 * (`pnpm arch:workspace`, for packages/ and database/). Patterns accept both path prefixes.
 */

// Module DAG (TDS §5.3): each module may import only the public API of the modules listed here.
// Anything not listed is forbidden. Extend this in the same PR that adds a module or an edge.
const MODULE_DEPENDENCIES = {
  auth: [],
};

const moduleDagRules = Object.entries(MODULE_DEPENDENCIES).map(
  ([name, allowed]) => ({
    name: `module-dag-${name}`,
    comment: `modules/${name} may depend only on: ${allowed.join(", ") || "no other module"} (TDS §5.3).`,
    severity: "error",
    from: { path: `^(?:apps/web/)?src/modules/${name}/` },
    to: {
      path: "^(?:apps/web/)?src/modules/[^/]+/",
      pathNot: [
        `^(?:apps/web/)?src/modules/(${[name, ...allowed].join("|")})/`,
      ],
    },
  })
);

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "No cycles at file or module level (strategy §2.3 rule 5).",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-deep-cross-module-import",
      comment:
        "Other modules are reached only through their index.ts (strategy §2.3 rule 3).",
      severity: "error",
      from: { path: "^(?:apps/web/)?src/modules/([^/]+)/" },
      to: {
        path: "^(?:apps/web/)?src/modules/[^/]+/",
        pathNot: [
          "^(?:apps/web/)?src/modules/$1/",
          "^(?:apps/web/)?src/modules/[^/]+/index\\.ts$",
        ],
      },
    },
    {
      name: "no-deep-cross-module-import-from-outside",
      comment:
        "app/, components/, etc. reach a module only through its index.ts.",
      severity: "error",
      from: {
        path: "^(?:apps/web/)?src/",
        pathNot: "^(?:apps/web/)?src/modules/",
      },
      to: {
        path: "^(?:apps/web/)?src/modules/[^/]+/",
        pathNot: "^(?:apps/web/)?src/modules/[^/]+/index\\.ts$",
      },
    },
    {
      name: "workspace-packages-never-import-apps",
      comment: "packages/* and database/ never depend on apps/* (ADR-017).",
      severity: "error",
      from: { path: "^(packages|database)/" },
      to: { path: "^apps/" },
    },
    ...moduleDagRules,
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: [
        "/generated/",
        "/\\.next/",
        "/\\.turbo/",
        "/coverage/",
        "/playwright-report/",
        "/test-results/",
      ],
    },
    moduleSystems: ["es6", "cjs"],
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["module", "main", "types"],
    },
  },
};
