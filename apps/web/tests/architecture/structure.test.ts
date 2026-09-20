import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkStructure } from "../support/architecture";

const srcRoot = path.resolve(import.meta.dirname, "../../src");
const temps: string[] = [];

function fixture(files: Record<string, string>, emptyDirs: string[] = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
  temps.push(root);
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  for (const dir of emptyDirs)
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("repository structure (strategy §2.4 item 6, §2.5)", () => {
  it("apps/web/src satisfies every architecture rule", () => {
    expect(checkStructure(srcRoot)).toEqual([]);
  });
});

describe("the checker can fail", () => {
  it("requires every module to have a public index.ts", () => {
    const root = fixture({ "modules/jobs/domain/job.ts": "export {};" });
    expect(checkStructure(root)).toContainEqual(
      expect.stringContaining("modules/jobs has no index.ts")
    );
  });

  it("keeps Prisma inside infrastructure", () => {
    const root = fixture({
      "modules/jobs/index.ts": "export {};",
      "modules/jobs/application/list.ts":
        'import { PrismaClient } from "@nitap/database";\nexport { PrismaClient };',
      "app/page.tsx": 'import x from "@prisma/client";\nexport { x };',
      "modules/jobs/infrastructure/repo.ts":
        'import { PrismaClient } from "@nitap/database";\nexport { PrismaClient };',
      "infrastructure/database/client.ts":
        'import { PrismaClient } from "@nitap/database";\nexport { PrismaClient };',
    });
    const found = checkStructure(root);
    expect(found).toContainEqual(
      expect.stringContaining("modules/jobs/application/list.ts imports Prisma")
    );
    expect(found).toContainEqual(
      expect.stringContaining("app/page.tsx imports Prisma")
    );
    expect(found.filter((v) => v.includes("imports Prisma"))).toHaveLength(2);
  });

  it("rejects folders named for a kind of file", () => {
    const root = fixture({
      "utils/a.ts": "export {};",
      "modules/jobs/index.ts": "export {};",
      "modules/jobs/helpers/b.ts": "export {};",
      "modules/jobs/application/services/ok.ts": "export {};",
      "components/common/header.tsx": "export {};",
      "services/health.ts": "export {};",
    });
    const found = checkStructure(root);
    expect(found).toContainEqual(expect.stringContaining("utils"));
    expect(found).toContainEqual(
      expect.stringContaining("modules/jobs/helpers")
    );
    expect(found).toContainEqual(expect.stringContaining("services"));
    // sanctioned: modules/*/application/services and the app shell's components/common
    expect(found.join("\n")).not.toContain("application/services");
    expect(found.join("\n")).not.toContain("components/common");
  });

  it("rejects empty directories (no folders for appearance, §2.2)", () => {
    const root = fixture({ "modules/jobs/index.ts": "export {};" }, [
      "modules/jobs/domain",
    ]);
    expect(checkStructure(root)).toContainEqual(
      expect.stringContaining("empty directory modules/jobs/domain")
    );
  });

  it("ignores test files when looking for Prisma imports", () => {
    const root = fixture({
      "modules/jobs/index.ts": "export {};",
      "modules/jobs/application/list.test.ts":
        'import x from "@nitap/database";\nexport { x };',
    });
    expect(checkStructure(root)).toEqual([]);
  });
});
