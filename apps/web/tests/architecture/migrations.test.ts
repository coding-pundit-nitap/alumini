import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrations = path.resolve(
  import.meta.dirname,
  "../../../../packages/database/prisma/migrations"
);

describe("migration history (reliability §1, §11)", () => {
  it("has no migration dated in the future: a placeholder like 2099… would sort after every real one", () => {
    const now = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const dated = fs
      .readdirSync(migrations)
      .filter((name) => /^\d{14}_/.test(name));

    expect(dated.length).toBeGreaterThan(0);
    expect(dated.filter((name) => name.slice(0, 14) > now)).toEqual([]);
  });
});
