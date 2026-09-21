import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkNoWebImports } from "../support/architecture.ts";

const workerRoot = path.resolve(import.meta.dirname, "../..");
const temps: string[] = [];

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "worker-web-"));
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

describe("the worker never depends on the Next.js app (ADR-018)", () => {
  it("apps/worker/src and tests import nothing from apps/web", () => {
    expect(checkNoWebImports(workerRoot)).toEqual([]);
  });
});

describe("the checker can fail", () => {
  it("flags a relative import reaching into apps/web", () => {
    const root = fixture({
      "src/bad.ts": 'import x from "../../web/src/proxy.ts";\nexport { x };',
    });
    expect(checkNoWebImports(root)).toContainEqual(
      expect.stringContaining("src/bad.ts")
    );
  });

  it("does not flag an unrelated relative import", () => {
    const root = fixture({
      "src/ok.ts": 'import x from "./compose.ts";\nexport { x };',
    });
    expect(checkNoWebImports(root)).toEqual([]);
  });
});
