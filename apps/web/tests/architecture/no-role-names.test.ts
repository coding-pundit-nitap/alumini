import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ROLE_NAMES } from "@nitap/database/role-permissions";

import { checkNoRoleNames } from "../support/architecture";

const srcRoot = path.resolve(import.meta.dirname, "../../src");
const temps: string[] = [];

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "roles-"));
  temps.push(root);
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("handlers and use cases name permissions, never roles", () => {
  it("apps/web/src contains no role-name literal", () => {
    expect(checkNoRoleNames(srcRoot, ROLE_NAMES)).toEqual([]);
  });
});

describe("the role-name checker can fail", () => {
  it("flags a role name in a string literal", () => {
    const root = fixture({
      "app/api/v1/jobs/route.ts": 'if (user.role === "SUPER_ADMIN") {}',
      "modules/jobs/application/approve.ts": "const r = 'TP_ADMIN';",
      "modules/jobs/application/tpl.ts": "const r = `MODERATOR`;",
    });
    const found = checkNoRoleNames(root, ROLE_NAMES);
    expect(found).toHaveLength(3);
    expect(found).toContainEqual(
      expect.stringContaining(
        'app/api/v1/jobs/route.ts names the role "SUPER_ADMIN"'
      )
    );
  });

  it("does not flag permissions, prose, or test files", () => {
    const root = fixture({
      "modules/jobs/application/ok.ts":
        'authorize(actor, "alumni.verify"); // ALUMNI is a role, but only in a comment word',
      "modules/jobs/application/ok.test.ts": 'const role = "SUPER_ADMIN";',
    });
    expect(checkNoRoleNames(root, ROLE_NAMES)).toEqual([]);
  });
});
