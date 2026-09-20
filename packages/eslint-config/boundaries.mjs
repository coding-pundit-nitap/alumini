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
    "@nitap/database",
    "@nitap/database/*",
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
  "no-restricted-imports": ["error", { patterns }],
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
    // The one sanctioned exception: Better Auth's Next.js integration and the request-scoped session
    // read (`next/headers`, React `cache`) are framework code by nature. Revisit when `getActor()` lands
    // in Phase 2, when the framework-facing part can move behind a port.
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
