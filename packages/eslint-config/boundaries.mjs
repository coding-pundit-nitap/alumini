/**
 * Layer and module boundary rules (docs/architecture/development-and-testing-strategy.md §2.3–2.4).
 * `no-restricted-imports` replaces (does not merge) its options per matching block, so every block below
 * is built from the shared groups and lists everything that layer may not import.
 *
 * Inside a module use relative imports; across modules only `@/modules/<name>` (the index).
 * The module DAG and cycles are checked separately by dependency-cruiser (`.dependency-cruiser.cjs`).
 */

const infrastructureSdks = {
  group: [
    // The bare "@nitap/database" is banned through `databaseRoot` below (`paths`, exact match): as a
    // gitignore-style pattern it would also cover every subpath and defeat the negation.
    "@nitap/database/*",
    // The permission registry is pure data shared with the seed (rbac-permission-matrix.md §3). It is the
    // one @nitap/database subpath the domain and application layers may import. Order matters: the
    // negation must come after the pattern it re-allows.
    "!@nitap/database/permissions",
    "@prisma/*",
    "ioredis",
    "bullmq",
    "@aws-sdk/*",
    "fastify",
    "express",
  ],
  message:
    "Prisma, Redis, queues and provider SDKs belong to infrastructure/ (strategy §2.3).",
};

const databaseRoot = {
  name: "@nitap/database",
  message:
    "Prisma, Redis, queues and provider SDKs belong to infrastructure/ (strategy §2.3).",
};

const authLibrary = {
  group: ["better-auth", "better-auth/*"],
  message:
    "Better Auth is wired only in infrastructure/ (the createAuth factory) and app/ (its route handler); the domain and use cases stay library-free (ADR-005, spec 2C D-10).",
};

const react = {
  group: ["react", "react/*", "react-dom", "react-dom/*"],
  message: "React is a presentation/ui concern.",
};

const next = {
  group: ["next", "next/*"],
  message: "Next.js belongs to app/, presentation/ui and proxy.ts.",
};

const designSystem = {
  group: ["@nitap/ui", "@nitap/ui/*"],
  message: "@nitap/ui is for app/ and presentation/ui only.",
};

const anyInfrastructure = {
  group: ["**/infrastructure", "**/infrastructure/**"],
  message:
    "Nothing inward imports infrastructure; depend on an interface the layer declares (strategy §2.3 rules 2, 6, 7).",
};

const anyPresentation = {
  group: ["**/presentation/**"],
  message: "Dependencies point inward: nothing imports presentation.",
};

const anyApplication = {
  group: ["**/application/**"],
  message: "domain and infrastructure may not depend on use cases.",
};

const anyModule = {
  group: ["@/modules/*", "@/modules/*/*"],
  message:
    "This layer may not import another module. Coordinate through the application layer or events (TDS §5.2).",
};

const deepModuleImport = {
  group: ["@/modules/*/*"],
  message:
    "Import another module only through its index (`@/modules/<name>`); use relative paths inside a module (strategy §2.3 rule 3).",
};

const components = {
  group: ["@/components/*", "@/components/**"],
  message: "App-level UI is not visible to the layers below it.",
};

const restrict = (...patterns) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns,
      // Every layer that bans the infrastructure SDKs also bans the bare "@nitap/database".
      paths: patterns.includes(infrastructureSdks) ? [databaseRoot] : [],
    },
  ],
});

const browserGlobals = [
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "navigator",
].map((name) => ({
  name,
  message: "The domain is pure: no browser APIs (strategy §2.4).",
}));

/** Appended after the framework presets in each app's eslint.config. Globs are relative to the app root. */
export const layerRules = [
  {
    name: "boundaries/everywhere",
    files: ["src/**/*.{ts,tsx}"],
    rules: restrict(deepModuleImport),
  },
  {
    name: "boundaries/app-ui-lib",
    files: [
      "src/app/**",
      "src/components/**",
      "src/hooks/**",
      "src/providers/**",
      "src/lib/**",
      "src/composition/**",
      "src/worker/**",
    ],
    rules: restrict(deepModuleImport, infrastructureSdks),
  },
  {
    name: "boundaries/lib-is-pure",
    files: ["src/lib/**"],
    rules: restrict(deepModuleImport, infrastructureSdks, {
      group: ["@/infrastructure/*", "@/infrastructure/**", "@/modules/*"],
      message:
        "lib/ is pure: no I/O and no imports from modules/ or infrastructure/ (strategy §2.5).",
    }),
  },
  {
    name: "boundaries/domain",
    files: ["src/modules/*/domain/**"],
    rules: {
      ...restrict(
        infrastructureSdks,
        authLibrary,
        react,
        next,
        designSystem,
        components,
        anyModule,
        anyInfrastructure,
        anyApplication,
        anyPresentation
      ),
      "no-restricted-globals": ["error", ...browserGlobals],
    },
  },
  {
    name: "boundaries/application",
    files: ["src/modules/*/application/**"],
    rules: restrict(
      infrastructureSdks,
      authLibrary,
      react,
      next,
      designSystem,
      components,
      deepModuleImport,
      anyInfrastructure,
      anyPresentation
    ),
  },
  {
    name: "boundaries/module-infrastructure",
    files: ["src/modules/*/infrastructure/**"],
    rules: restrict(
      react,
      next,
      designSystem,
      components,
      anyModule,
      anyPresentation
    ),
  },
  {
    // The one sanctioned exception: Better Auth's Next.js integration and the request-scoped identity read
    // (`next/headers`, React `cache` in getActor()) are framework code by nature. Keep it confined to
    // src/modules/auth/infrastructure; the rules in domain/ and application/ stay framework-free.
    name: "boundaries/auth-infrastructure-exception",
    files: ["src/modules/auth/infrastructure/**"],
    rules: restrict(designSystem, components, anyModule, anyPresentation),
  },
  {
    name: "boundaries/presentation-api",
    files: ["src/modules/*/presentation/api/**"],
    rules: restrict(
      infrastructureSdks,
      react,
      next,
      designSystem,
      components,
      deepModuleImport,
      anyInfrastructure
    ),
  },
  {
    name: "boundaries/presentation-ui",
    files: ["src/modules/*/presentation/ui/**"],
    rules: restrict(
      infrastructureSdks,
      components,
      deepModuleImport,
      anyInfrastructure
    ),
  },
  {
    name: "boundaries/shared-infrastructure",
    files: ["src/infrastructure/**"],
    rules: restrict(
      react,
      next,
      designSystem,
      components,
      anyModule,
      anyPresentation
    ),
  },
];
