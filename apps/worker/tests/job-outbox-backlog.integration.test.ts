import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const migration = fileURLToPath(
  new URL(
    "../../../packages/database/prisma/migrations/20260924000000_retire_job_outbox_backlog/migration.sql",
    import.meta.url
  )
);

/** First consumes job.*; rows written since had no consumer and must not replay as emails. */
describe("job.* outbox backlog migration (real PostgreSQL)", () => {
  let db: TestDatabase;
  beforeEach(async () => {
    db = await createTestDatabase();
  });
  afterEach(async () => {
    await db.drop();
  });

  it("marks only unpublished job.* rows published; other types and already-published rows are untouched", async () => {
    const earlier = new Date("2026-01-01T00:00:00Z");
    const rows = await Promise.all(
      [
        { type: "job.submitted", publishedAt: null },
        { type: "job.expired", publishedAt: null },
        { type: "job.closed", publishedAt: earlier },
        { type: "connection.requested", publishedAt: null },
      ].map((data) =>
        db.prisma.outboxEvent.create({ data: { ...data, payload: {} } })
      )
    );

    await db.prisma.$executeRawUnsafe(readFileSync(migration, "utf8"));

    const after = await db.prisma.outboxEvent.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    const byType = Object.fromEntries(after.map((r) => [r.type, r]));
    expect(byType["job.submitted"]!.publishedAt).not.toBeNull();
    expect(byType["job.expired"]!.publishedAt).not.toBeNull();
    expect(byType["job.closed"]!.publishedAt).toEqual(earlier);
    expect(byType["connection.requested"]!.publishedAt).toBeNull();
  });
});
