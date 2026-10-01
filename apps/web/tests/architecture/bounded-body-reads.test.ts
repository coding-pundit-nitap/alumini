import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkBoundedBodyReads } from "../support/architecture";

const webRoot = path.resolve(import.meta.dirname, "../..");
const temps: string[] = [];

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bodies-"));
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

describe("request bodies are read through the bounded reader (spec 16 SD-4)", () => {
  it("no Route Handler reads a body directly", () => {
    expect(checkBoundedBodyReads(path.join(webRoot, "src"))).toEqual([]);
  });

  it.each(["json", "text", "arrayBuffer", "formData", "blob"])(
    "flags request.%s()",
    (method) => {
      const root = fixture({
        "app/api/v1/x/route.ts": `export const POST = async (request: Request) => request.${method}();`,
      });
      expect(checkBoundedBodyReads(root)).toHaveLength(1);
    }
  );

  it("allows the reader itself and test files", () => {
    const root = fixture({
      "app/api/v1/_lib/request.ts": "request.json()",
      "app/api/v1/x/route.test.ts": "request.json()",
    });
    expect(checkBoundedBodyReads(root)).toEqual([]);
  });
});
