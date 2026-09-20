import { describe, expect, it } from "vitest";

import { createTestDatabase } from "../../support/test-database";

describe("createTestDatabase", () => {
  it("returns a working, already-migrated, isolated database", async () => {
    const db = await createTestDatabase();
    try {
      // The template is migrated by global-setup, so the `user` table already exists.
      const count = await db.prisma.user.count();
      expect(count).toBe(0);
    } finally {
      await db.drop();
    }
  });

  it("gives two calls two independent databases", async () => {
    const a = await createTestDatabase();
    const b = await createTestDatabase();
    try {
      await a.prisma.user.create({
        data: { name: "Isolated", email: "isolated@example.com" },
      });
      expect(await a.prisma.user.count()).toBe(1);
      expect(await b.prisma.user.count()).toBe(0);
    } finally {
      await a.drop();
      await b.drop();
    }
  });
});
