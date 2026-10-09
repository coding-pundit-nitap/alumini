/**
 * Architecture rules that lint cannot see well: cycles, the module DAG,
 * deep cross-module imports, and workspace direction. Layer import bans live in
 * packages/eslint-config/boundaries.mjs.
 *
 * Run from apps/web (`pnpm arch`, which passes --ts-config so `@/` resolves) and from the repo root
 * (`pnpm arch:workspace`, for packages/). Patterns accept both path prefixes.
 */

// Module DAG: each module may import only the public API of the modules listed here.
// Anything not listed is forbidden. Extend this in the same PR that adds a module or an edge.
const MODULE_DEPENDENCIES = {
  auth: [],
  users: ["auth"],
  uploads: ["auth", "users"],
  directory: ["auth"],
  connections: ["auth"],
  mentorship: ["auth"],
  events: ["auth"],
  admin: ["auth"],
  donations: ["auth"],
};

const moduleDagRules = Object.entries(MODULE_DEPENDENCIES).map(
  ([name, allowed]) => ({
    name: `module-dag-${name}`,
    comment: `modules/${name} may depend only on: ${allowed.join(", ") || "no other module"}.`,
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

// From inside apps/worker, its own `src/` is indistinguishable from web's by path, and the worker is
// the one place allowed to use the queue and email packages, so web-only rules are skipped there.
const runningInWorker = /[\\/]apps[\\/]worker$/.test(process.cwd());

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "No cycles at file or module level.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-deep-cross-module-import",
      comment:
        "Other modules are reached only through their index.ts, or their server.ts / client.ts for exports a " +
        "barrel can't carry to that side (see modules/moderation/server.ts).",
      severity: "error",
      from: { path: "^(?:apps/web/)?src/modules/([^/]+)/" },
      to: {
        path: "^(?:apps/web/)?src/modules/[^/]+/",
        pathNot: [
          "^(?:apps/web/)?src/modules/$1/",
          "^(?:apps/web/)?src/modules/[^/]+/(index|server|client)\\.ts$",
        ],
      },
    },
    {
      name: "no-deep-cross-module-import-from-outside",
      comment:
        "app/, components/, etc. reach a module only through its index.ts, or its server.ts / client.ts for " +
        "exports its barrel can't carry to that side.",
      severity: "error",
      from: {
        path: "^(?:apps/web/)?src/",
        pathNot: "^(?:apps/web/)?src/modules/",
      },
      to: {
        path: "^(?:apps/web/)?src/modules/[^/]+/",
        pathNot: "^(?:apps/web/)?src/modules/[^/]+/(index|server|client)\\.ts$",
      },
    },
    {
      name: "workspace-packages-never-import-apps",
      comment:
        "packages/* never depend on apps/*. packages/scripts is tooling run by hand or in CI, never imported, so its drills may drive an app's code directly.",
      severity: "error",
      from: { path: "^packages/", pathNot: "^packages/scripts/" },
      to: { path: "^apps/" },
    },
    ...moduleDagRules,

    // Each rule is proven to fail by a temporary violating file.
    // step 5). The web/worker boundary is also enforced by checkNoQueueImports (apps/web) and
    // checkNoWebImports (apps/worker), which run without dependency-cruiser.
    {
      name: "queue-stays-generic",
      comment:
        "@nitap/queue knows nothing about email or the database; contracts live in @nitap/jobs.",
      severity: "error",
      from: { path: "^packages/queue/src/", pathNot: "\\.test\\.ts$" },
      to: { path: "(^|/)packages/(email|database)/" },
    },
    {
      name: "jobs-is-a-leaf-contract",
      comment:
        "@nitap/jobs is pure contract (types, schemas, backoff math); it imports no other workspace.",
      severity: "error",
      from: { path: "^packages/jobs/src/" },
      to: {
        path: "(^|/)(packages/(queue|email|observability|testing|database)|apps)/",
      },
    },
    {
      name: "search-is-a-leaf-contract",
      comment:
        "@nitap/search is the provider-neutral SearchPort contract, query and cursor; it imports no other workspace, so any adapter (Postgres now, OpenSearch later) can implement it.",
      severity: "error",
      from: { path: "^packages/search/src/" },
      to: {
        path: "(^|/)(packages/(queue|jobs|email|observability|storage|testing|database)|apps)/",
      },
    },
    {
      name: "email-is-provider-only",
      comment:
        "@nitap/email is the provider adapter and templates; it imports no other workspace.",
      severity: "error",
      from: { path: "^packages/email/src/", pathNot: "\\.test\\.ts$" },
      to: { path: "(^|/)(packages/(queue|jobs|database)|apps)/" },
    },
    ...(runningInWorker
      ? []
      : [
          {
            name: "web-never-touches-the-queue",
            comment:
              "The web app only writes outbox events; the queue and email adapters belong to the worker. One exception: the notifications composition builds the admin QueueAdmin for the audited replay endpoint.",
            severity: "error",
            from: {
              path: "^(?:apps/web/)?src/",
              pathNot: "^(?:apps/web/)?src/composition/notifications\\.ts$",
            },
            to: { path: "(^|/)packages/(queue|email)/" },
          },
        ]),
    {
      name: "web-and-worker-never-import-each-other",
      comment:
        "Two deployables, one repository: they share packages, not code.",
      severity: "error",
      from: { path: "^(?:apps/web/)?(src|tests)/" },
      to: { path: "^((\\.\\./)+|apps/)worker/" },
    },
    {
      name: "worker-never-imports-web",
      comment: "The worker must not depend on the Next.js app.",
      severity: "error",
      from: { path: "^(?:apps/worker/)?(src|tests)/" },
      to: { path: "^((\\.\\./)+|apps/)web/" },
    },
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
