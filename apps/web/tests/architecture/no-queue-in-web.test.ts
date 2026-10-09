import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkNoQueueImports,
  checkNoWorkerImports,
} from "../support/architecture";

const webRoot = path.resolve(import.meta.dirname, "../..");
const temps: string[] = [];

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "queue-"));
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

describe("the web app only produces events", () => {
  it("apps/web/src imports no queue or SMTP library", () => {
    expect(checkNoQueueImports(path.join(webRoot, "src"))).toEqual([]);
  });

  it("apps/web/package.json depends on no queue or SMTP package", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(webRoot, "package.json"), "utf8")
    );
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    // @nitap/queue is allowed for the admin replay endpoint only.
    for (const name of ["bullmq", "nodemailer", "@nitap/email"]) {
      expect(declared, name).not.toHaveProperty(name);
    }
  });
});

describe("the queue-import checker can fail", () => {
  it.each([["bullmq"], ["nodemailer"], ["@nitap/queue"], ["@nitap/email"]])(
    "flags an import of %s",
    (specifier) => {
      const root = fixture({
        "modules/jobs/application/x.ts": `import x from "${specifier}";\nexport { x };`,
      });
      expect(checkNoQueueImports(root)).toContainEqual(
        expect.stringContaining(specifier)
      );
    }
  );

  it("does not flag the cache Redis client, the outbox writer, or test files", () => {
    const root = fixture({
      "infrastructure/redis/client.ts":
        'import { Redis } from "ioredis";\nexport { Redis };',
      "infrastructure/outbox/index.ts":
        'export { createOutboxWriter } from "@nitap/database/outbox";',
      "modules/jobs/application/x.test.ts":
        'import x from "bullmq";\nexport { x };',
    });
    expect(checkNoQueueImports(root)).toEqual([]);
  });
});

describe("the web app never depends on the worker", () => {
  it("apps/web/src imports nothing from apps/worker", () => {
    expect(checkNoWorkerImports(webRoot)).toEqual([]);
  });
});

describe("the worker-import checker can fail", () => {
  it("flags a relative import reaching into apps/worker", () => {
    const root = fixture({
      "src/bad.ts":
        'import x from "../../../worker/src/compose.ts";\nexport { x };',
    });
    expect(checkNoWorkerImports(root)).toContainEqual(
      expect.stringContaining("src/bad.ts")
    );
  });
});
