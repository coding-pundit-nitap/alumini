import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkClientFormsPost } from "../support/architecture";

const webRoot = path.resolve(import.meta.dirname, "../..");
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(source: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forms-"));
  temps.push(root);
  fs.writeFileSync(path.join(root, "form.tsx"), source);
  return root;
}

describe("client-handled forms never submit as GET (spec 16 S-12)", () => {
  it('every onSubmit form in the app says method="post"', () => {
    expect(checkClientFormsPost(path.join(webRoot, "src"))).toEqual([]);
  });

  it("flags an onSubmit form without a method, on one line or several", () => {
    expect(checkClientFormsPost(fixture("<form onSubmit={go}>"))).toHaveLength(
      1
    );
    expect(
      checkClientFormsPost(
        fixture('<form\n  className="x"\n  onSubmit={go}\n>')
      )
    ).toHaveLength(1);
  });

  it('allows method="post", GET filter forms and Server Action forms', () => {
    expect(
      checkClientFormsPost(fixture('<form method="post" onSubmit={go}>'))
    ).toEqual([]);
    expect(
      checkClientFormsPost(fixture('<form method="get" action="/jobs">'))
    ).toEqual([]);
    expect(checkClientFormsPost(fixture("<form action={submit}>"))).toEqual([]);
  });
});
