import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { ESLint } from "eslint";

/**
 * The layer rules of strategy §2.4 (`packages/eslint-config/boundaries.mjs`), proven by linting snippets
 * placed at layer paths. A rule that cannot fail is not a rule: each ban has a case that must be reported.
 */
const cwd = path.resolve(import.meta.dirname, "../..");
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd });
});

async function violations(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(cwd, filePath),
  });
  // Fail loudly: a missing result would make every "no violations" assertion pass for the wrong reason.
  if (!result) throw new Error(`ESLint returned no result for ${filePath}`);
  return result.messages
    .filter(
      (m) =>
        m.ruleId === "no-restricted-imports" ||
        m.ruleId === "no-restricted-globals"
    )
    .map((m) => m.message);
}

const DOMAIN = "src/modules/mentorship/domain/entities/mentorship.ts";
const APPLICATION = "src/modules/mentorship/application/commands/request.ts";
const MODULE_INFRA =
  "src/modules/mentorship/infrastructure/repositories/repo.ts";
const PRESENTATION_API = "src/modules/mentorship/presentation/api/schemas.ts";
const PRESENTATION_UI = "src/modules/mentorship/presentation/ui/card.tsx";
const SHARED_INFRA = "src/infrastructure/queue/queue.ts";

describe("domain layer", () => {
  it.each([
    ["@nitap/database"],
    ["@prisma/client"],
    ["ioredis"],
    ["bullmq"],
    ["@aws-sdk/client-s3"],
    ["next/server"],
    ["react"],
    ["react-dom"],
    ["express"],
    ["@/infrastructure/database/client"],
    ["@/modules/jobs"],
    ["@/components/common/header"],
    ["@nitap/ui/components/button"],
  ])("may not import %s", async (specifier) => {
    expect(
      await violations(DOMAIN, `import x from "${specifier}";\nexport { x };`)
    ).not.toHaveLength(0);
  });

  it("may not reach into its own application, infrastructure or presentation", async () => {
    for (const rel of [
      "../../application/commands/request",
      "../../infrastructure/repositories/repo",
      "../../presentation/api/schemas",
    ]) {
      expect(
        await violations(DOMAIN, `import x from "${rel}";\nexport { x };`),
        rel
      ).not.toHaveLength(0);
    }
  });

  it("may not touch browser globals", async () => {
    for (const global of [
      "window",
      "document",
      "localStorage",
      "sessionStorage",
      "navigator",
    ]) {
      expect(
        await violations(DOMAIN, `export const x = ${global};`),
        global
      ).not.toHaveLength(0);
    }
  });

  it("may import its own siblings and pure lib code", async () => {
    expect(
      await violations(
        DOMAIN,
        `import a from "../value-objects/state";\nimport { ok } from "@/lib/result";\nexport { a, ok };`
      )
    ).toHaveLength(0);
  });
});

describe("application layer", () => {
  it.each([
    ["@nitap/database"],
    ["ioredis"],
    ["react"],
    ["next/headers"],
    ["@/infrastructure/redis/client"],
    ["@/modules/jobs/domain/job"],
    ["@/components/common/header"],
  ])("may not import %s", async (specifier) => {
    expect(
      await violations(
        APPLICATION,
        `import x from "${specifier}";\nexport { x };`
      )
    ).not.toHaveLength(0);
  });

  it("may not import its own infrastructure or presentation", async () => {
    for (const rel of [
      "../../infrastructure/repositories/repo",
      "../../presentation/api/schemas",
    ]) {
      expect(
        await violations(APPLICATION, `import x from "${rel}";\nexport { x };`),
        rel
      ).not.toHaveLength(0);
    }
  });

  it("may use its own domain, lib and another module's public API", async () => {
    expect(
      await violations(
        APPLICATION,
        `import a from "../../domain/entities/mentorship";\nimport { getActor } from "@/modules/auth";\nimport { err } from "@/lib/result";\nexport { a, getActor, err };`
      )
    ).toHaveLength(0);
  });
});

describe("module infrastructure", () => {
  it("may use Prisma, but not React, Next.js or its own presentation", async () => {
    expect(
      await violations(
        MODULE_INFRA,
        `import { PrismaClient } from "@nitap/database";\nexport { PrismaClient };`
      )
    ).toHaveLength(0);
    for (const specifier of [
      "react",
      "next/server",
      "../../presentation/api/schemas",
    ]) {
      expect(
        await violations(
          MODULE_INFRA,
          `import x from "${specifier}";\nexport { x };`
        ),
        specifier
      ).not.toHaveLength(0);
    }
  });

  it("may not import another module at all", async () => {
    expect(
      await violations(
        MODULE_INFRA,
        `import x from "@/modules/jobs";\nexport { x };`
      )
    ).not.toHaveLength(0);
  });
});

describe("presentation layer", () => {
  it("api may not import infrastructure, Prisma or React", async () => {
    for (const specifier of [
      "@/infrastructure/database/client",
      "../../../infrastructure/repositories/repo",
      "@nitap/database",
      "react",
    ]) {
      expect(
        await violations(
          PRESENTATION_API,
          `import x from "${specifier}";\nexport { x };`
        ),
        specifier
      ).not.toHaveLength(0);
    }
  });

  it("ui may use React and @nitap/ui but not infrastructure or Prisma", async () => {
    expect(
      await violations(
        PRESENTATION_UI,
        `import { useState } from "react";\nimport { Button } from "@nitap/ui/components/button";\nexport { useState, Button };`
      )
    ).toHaveLength(0);
    for (const specifier of [
      "@/infrastructure/database/client",
      "@nitap/database",
    ]) {
      expect(
        await violations(
          PRESENTATION_UI,
          `import x from "${specifier}";\nexport { x };`
        ),
        specifier
      ).not.toHaveLength(0);
    }
  });
});

describe("shared infrastructure", () => {
  it("may use provider SDKs but not modules, UI, React or Next.js", async () => {
    expect(
      await violations(
        SHARED_INFRA,
        `import Redis from "ioredis";\nexport { Redis };`
      )
    ).toHaveLength(0);
    for (const specifier of [
      "@/modules/auth",
      "@/components/common/header",
      "react",
      "next/server",
      "@nitap/ui/components/button",
    ]) {
      expect(
        await violations(
          SHARED_INFRA,
          `import x from "${specifier}";\nexport { x };`
        ),
        specifier
      ).not.toHaveLength(0);
    }
  });
});

describe("everywhere else", () => {
  it("forbids deep cross-module imports from any file (rule 3)", async () => {
    for (const file of [
      "src/app/alumni/page.tsx",
      "src/modules/jobs/application/x.ts",
      "src/lib/x.ts",
    ]) {
      expect(
        await violations(
          file,
          `import x from "@/modules/mentorship/domain/entities/mentorship";\nexport { x };`
        ),
        file
      ).not.toHaveLength(0);
    }
  });

  it("allows the public API of a module from app/", async () => {
    expect(
      await violations(
        "src/app/alumni/page.tsx",
        `import { auth } from "@/modules/auth";\nexport { auth };`
      )
    ).toHaveLength(0);
  });

  it("keeps Prisma and provider SDKs out of app, components, hooks and lib", async () => {
    for (const file of [
      "src/app/alumni/page.tsx",
      "src/components/common/x.tsx",
      "src/hooks/x.ts",
      "src/lib/x.ts",
    ]) {
      for (const specifier of [
        "@nitap/database",
        "@prisma/client",
        "ioredis",
        "bullmq",
      ]) {
        expect(
          await violations(
            file,
            `import x from "${specifier}";\nexport { x };`
          ),
          `${file} ← ${specifier}`
        ).not.toHaveLength(0);
      }
    }
  });

  it("keeps lib pure: no infrastructure and no modules", async () => {
    for (const specifier of [
      "@/infrastructure/observability",
      "@/modules/auth",
    ]) {
      expect(
        await violations(
          "src/lib/x.ts",
          `import x from "${specifier}";\nexport { x };`
        ),
        specifier
      ).not.toHaveLength(0);
    }
  });

  it("carves out one exception: auth's session adapter reads the Next.js request", async () => {
    expect(
      await violations(
        "src/modules/auth/infrastructure/actor.ts",
        `import { headers } from "next/headers";\nexport { headers };`
      )
    ).toHaveLength(0);
    expect(
      await violations(
        "src/modules/auth/infrastructure/actor.ts",
        `import { PrismaClient } from "@nitap/database";\nexport { PrismaClient };`
      )
    ).toHaveLength(0);
  });
});

describe("permission registry carve-out (@nitap/database/permissions)", () => {
  it("is importable from the domain layer: it is pure data", async () => {
    expect(
      await violations(
        DOMAIN,
        'import { PERMISSIONS } from "@nitap/database/permissions";\nexport { PERMISSIONS };'
      )
    ).toEqual([]);
  });

  it("is importable from the application layer", async () => {
    expect(
      await violations(
        APPLICATION,
        'import { PERMISSIONS } from "@nitap/database/permissions";\nexport { PERMISSIONS };'
      )
    ).toEqual([]);
  });

  it.each([
    ["@nitap/database"],
    ["@nitap/database/seed"],
    ["@nitap/database/role-permissions"],
  ])("still bans %s in the domain layer", async (specifier) => {
    expect(
      await violations(DOMAIN, `import x from "${specifier}";\nexport { x };`)
    ).not.toHaveLength(0);
  });
});
