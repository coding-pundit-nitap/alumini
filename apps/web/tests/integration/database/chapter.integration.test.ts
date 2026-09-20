import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expectConstraintViolation } from "../../support/constraint-test";
import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

describe("chapter (minimal, Phase 1 — domain-model.md 'Chapter (minimal, Phase 1)')", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.drop();
  });

  it("creates an active chapter", async () => {
    const chapter = await db.prisma.chapter.create({
      data: { slug: "bengaluru" },
    });
    expect(chapter.archivedAt).toBeNull();
  });

  it("rejects a duplicate slug (chapter_slug_key)", async () => {
    await db.prisma.chapter.create({ data: { slug: "bengaluru" } });
    await expect(
      db.prisma.chapter.create({ data: { slug: "bengaluru" } })
    ).rejects.toSatisfy((error: unknown) => {
      expectConstraintViolation(error, "chapter_slug_key");
      return true;
    });
  });

  it("archives by setting archivedAt, not by deleting the row", async () => {
    const chapter = await db.prisma.chapter.create({ data: { slug: "delhi" } });
    const archived = await db.prisma.chapter.update({
      where: { id: chapter.id },
      data: { archivedAt: new Date() },
    });
    expect(archived.archivedAt).not.toBeNull();
    expect(await db.prisma.chapter.count()).toBe(1);
  });
});
