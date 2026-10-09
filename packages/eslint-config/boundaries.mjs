/**
 * Layer and module boundary rules. `no-restricted-imports` replaces rather than merges options per
 * block, so each block lists everything its layer may not import. Across modules, import only
 * `@/modules/<name>`.
 */

const infrastructureSdks = {
  group: [
    // The bare "@nitap/database" is banned through `databaseRoot` below (`paths`, exact match): as a
    // gitignore-style pattern it would also cover every subpath and defeat the negation.
    "@nitap/database/*",
    // The permission registry is pure data. The negation must come after the pattern it re-allows.
    "!@nitap/database/permissions",
    // Role display labels (ticks): pure data beside the role definitions, so app code never names a role.
    "!@nitap/database/role-ticks",
    // Prisma enum types are pure type data and the source of truth for schema-backed unions.
    "!@nitap/database/enums",
    "@prisma/*",
    "ioredis",
    "bullmq",
    "@aws-sdk/*",
    "fastify",
    "express",
  ],
  message: "Prisma, Redis, queues and provider SDKs belong to infrastructure/.",
};

const databaseRoot = {
  name: "@nitap/database",
  message: "Prisma, Redis, queues and provider SDKs belong to infrastructure/.",
};

const authLibrary = {
  group: ["better-auth", "better-auth/*"],
  message:
    "Better Auth is wired only in infrastructure/ (the createAuth factory) and app/ (its route handler); the domain and use cases stay library-free.",
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
    "Nothing inward imports infrastructure; depend on an interface the layer declares.",
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
    "This layer may not import another module. Coordinate through the application layer or events.",
};

const deepModuleImport = {
  group: [
    "@/modules/*/*",
    // Server-only module entry points, kept apart so client bundles never pull in Prisma.
    "!@/modules/*/server",
    // A module's client-safe entry point, for client components whose module index reaches server code.
    "!@/modules/*/client",
  ],
  message:
    "Import another module only through its index (`@/modules/<name>`) or its server-only or client-safe entry point (`@/modules/<name>/server`, `/client`); use relative paths inside a module.",
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
  message: "The domain is pure: no browser APIs.",
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
        "lib/ is pure: no I/O and no imports from modules/ or infrastructure/.",
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
    // Better Auth's Next.js integration and the request-scoped identity read are framework code by nature.
    // Keep them in src/modules/auth/infrastructure.
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
