import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createPrismaEducationCollection } from "@/modules/users/infrastructure/prisma-education-collection";
import { createPrismaExperienceCollection } from "@/modules/users/infrastructure/prisma-experience-collection";
import { createPrismaLinkCollection } from "@/modules/users/infrastructure/prisma-link-collection";
import { createPrismaSkillCollection } from "@/modules/users/infrastructure/prisma-skill-collection";

describe("detail collections against real PostgreSQL", () => {
  let db: TestDatabase;
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const user = await db.prisma.user.create({
      data: { name: "Asha", email: "asha@example.test" },
    });
    const other = await db.prisma.user.create({
      data: { name: "Ravi", email: "ravi@example.test" },
    });
    userId = user.id;
    otherId = other.id;
    await db.prisma.profile.create({ data: { userId, fullName: "Asha" } });
    await db.prisma.profile.create({
      data: { userId: otherId, fullName: "Ravi" },
    });
  });

  afterEach(async () => {
    await db.drop();
  });

  function runner() {
    return createTransactionRunner(db.prisma);
  }

  describe("experience", () => {
    const collection = () =>
      createPrismaExperienceCollection({ runner: runner(), prisma: db.prisma });
    const input = {
      company: "Acme",
      industry: null,
      designation: "Engineer",
      startDate: "2020-01-01",
      endDate: "2021-01-01",
      isCurrent: false,
    };

    it("adds, lists, updates and removes an item scoped to the owner", async () => {
      const c = collection();
      const added = await c.add(userId, input);
      expect(added).toMatchObject({ ok: true });
      const id = added.ok ? added.item.id : "";

      expect(await c.list(userId)).toEqual([{ id, ...input }]);

      const updated = await c.update(userId, id, {
        ...input,
        designation: "Senior Engineer",
      });
      expect(updated).toMatchObject({
        ok: true,
        item: { designation: "Senior Engineer" },
      });

      expect(await c.remove(userId, id)).toBe(true);
      expect(await c.list(userId)).toEqual([]);
    });

    it("another member's item id is not-found for update and remove (IDOR)", async () => {
      const c = collection();
      const added = await c.add(userId, input);
      const id = added.ok ? added.item.id : "";

      const updateResult = await c.update(otherId, id, input);
      expect(updateResult).toEqual({ ok: false, reason: "NOT_FOUND" });
      expect(await c.remove(otherId, id)).toBe(false);

      // Untouched: still there, unchanged, for its real owner.
      expect(await c.list(userId)).toHaveLength(1);
    });

    it("enforces the cap of 30 under 60 concurrent adds", async () => {
      const c = collection();
      const results = await Promise.all(
        Array.from({ length: 60 }, () => c.add(userId, input))
      );
      expect(results.filter((r) => r.ok)).toHaveLength(30);
      expect(
        results.filter((r) => !r.ok && r.reason === "LIMIT_REACHED")
      ).toHaveLength(30);
      expect(await c.list(userId)).toHaveLength(30);
    });
  });

  describe("education", () => {
    const collection = () =>
      createPrismaEducationCollection({ runner: runner(), prisma: db.prisma });
    const input = {
      institution: "IIT Madras",
      qualification: "M.Tech",
      fieldOfStudy: null,
      startYear: 2019,
      endYear: 2021,
    };

    it("adds and lists an item", async () => {
      const c = collection();
      const added = await c.add(userId, input);
      expect(added).toMatchObject({ ok: true });
      expect(await c.list(userId)).toEqual([
        { id: added.ok ? added.item.id : "", ...input },
      ]);
    });

    it("enforces the cap of 20", async () => {
      const c = collection();
      const results = await Promise.all(
        Array.from({ length: 25 }, () => c.add(userId, input))
      );
      expect(results.filter((r) => r.ok)).toHaveLength(20);
    });
  });

  describe("skills", () => {
    const collection = () =>
      createPrismaSkillCollection({ runner: runner(), prisma: db.prisma });

    it("rejects a duplicate skill (case-insensitive) as DUPLICATE", async () => {
      const c = collection();
      await c.add(userId, { skill: "TypeScript" });
      const result = await c.add(userId, { skill: "typescript" });
      expect(result).toEqual({ ok: false, reason: "DUPLICATE" });
    });

    it("lets two members hold the same skill", async () => {
      const c = collection();
      await c.add(userId, { skill: "Go" });
      const result = await c.add(otherId, { skill: "Go" });
      expect(result.ok).toBe(true);
    });

    it("enforces the cap of 50 under 60 concurrent adds, exactly", async () => {
      const c = collection();
      const results = await Promise.all(
        Array.from({ length: 60 }, (_, i) =>
          c.add(userId, { skill: `Skill ${i}` })
        )
      );
      expect(results.filter((r) => r.ok)).toHaveLength(50);
      expect(await c.list(userId)).toHaveLength(50);
    });
  });

  describe("links", () => {
    const collection = () =>
      createPrismaLinkCollection({ runner: runner(), prisma: db.prisma });

    it("rejects the same url twice for one member as DUPLICATE", async () => {
      const c = collection();
      const input = { type: "GITHUB" as const, url: "https://github.com/asha" };
      await c.add(userId, input);
      const result = await c.add(userId, input);
      expect(result).toEqual({ ok: false, reason: "DUPLICATE" });
    });

    it("enforces the cap of 10 under 15 concurrent adds, exactly", async () => {
      const c = collection();
      const results = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          c.add(userId, {
            type: "WEBSITE" as const,
            url: `https://example.com/${i}`,
          })
        )
      );
      expect(results.filter((r) => r.ok)).toHaveLength(10);
      expect(await c.list(userId)).toHaveLength(10);
    });
  });
});
