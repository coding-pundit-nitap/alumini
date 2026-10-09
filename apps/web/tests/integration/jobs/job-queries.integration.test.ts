import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createPrismaJobQueries } from "@/modules/jobs/infrastructure/prisma-job-queries";

describe("job queries against real PostgreSQL", () => {
  let db: TestDatabase;
  let poster: string;
  let other: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    poster = (
      await db.prisma.user.create({
        data: { name: "Poster", email: "poster@example.test" },
      })
    ).id;
    other = (
      await db.prisma.user.create({
        data: { name: "Other", email: "other@example.test" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const future = new Date(Date.now() + 30 * 86_400_000);
  async function job(over: {
    title: string;
    postedBy?: string;
    status?: "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
    createdAt: string;
    employmentType?: "FULL_TIME" | "INTERNSHIP";
    workMode?: "REMOTE" | "ONSITE";
    location?: string;
  }) {
    return db.prisma.job.create({
      data: {
        postedBy: over.postedBy ?? poster,
        title: over.title,
        company: "Acme",
        description: "d",
        employmentType: over.employmentType ?? "FULL_TIME",
        location: over.location ?? "Pune",
        workMode: over.workMode ?? "ONSITE",
        experience: "any",
        applicationUrl: "https://acme.example/apply",
        deadline: future,
        status: over.status ?? "PENDING_REVIEW",
        createdAt: new Date(over.createdAt),
      },
    });
  }

  it("pages the poster's own jobs newest first, never another member's", async () => {
    const a = await job({ title: "A", createdAt: "2026-01-01T00:00:00Z" });
    const b = await job({ title: "B", createdAt: "2026-01-02T00:00:00Z" });
    await job({ title: "C", createdAt: "2026-01-03T00:00:00Z" });
    await job({
      title: "X",
      postedBy: other,
      createdAt: "2026-01-04T00:00:00Z",
    });
    const q = createPrismaJobQueries(db.prisma);

    const first = await q.listMine(poster, { limit: 2 });
    expect(first.map((j) => j.title)).toEqual(["C", "B"]);
    const rest = await q.listMine(poster, {
      limit: 2,
      after: { key: b.createdAt.toISOString(), id: b.id },
    });
    expect(rest.map((j) => j.id)).toEqual([a.id]);
  });

  it("pages the review queue oldest first, only jobs pending review", async () => {
    const a = await job({ title: "A", createdAt: "2026-01-01T00:00:00Z" });
    await job({ title: "B", createdAt: "2026-01-02T00:00:00Z" });
    await job({
      title: "P",
      status: "PUBLISHED",
      createdAt: "2026-01-03T00:00:00Z",
    });
    const q = createPrismaJobQueries(db.prisma);

    expect((await q.listPending({ limit: 10 })).map((j) => j.title)).toEqual([
      "A",
      "B",
    ]);
    expect(
      (
        await q.listPending({
          limit: 10,
          after: { key: a.createdAt.toISOString(), id: a.id },
        })
      ).map((j) => j.title)
    ).toEqual(["B"]);
  });

  it("filters published jobs by type, mode and location (any case), and pages them", async () => {
    await job({
      title: "Remote intern",
      status: "PUBLISHED",
      employmentType: "INTERNSHIP",
      workMode: "REMOTE",
      location: "Bengaluru",
      createdAt: "2026-01-01T00:00:00Z",
    });
    const onsite = await job({
      title: "Onsite",
      status: "PUBLISHED",
      createdAt: "2026-01-02T00:00:00Z",
    });
    const q = createPrismaJobQueries(db.prisma);

    expect(
      (
        await q.listPublished({
          limit: 10,
          employmentType: "INTERNSHIP",
          workMode: "REMOTE",
          location: "bengaluru",
        })
      ).map((j) => j.title)
    ).toEqual(["Remote intern"]);
    expect(
      (
        await q.listPublished({
          limit: 10,
          after: { key: onsite.createdAt.toISOString(), id: onsite.id },
        })
      ).map((j) => j.title)
    ).toEqual(["Remote intern"]);
    expect((await q.get(onsite.id))?.title).toBe("Onsite");
  });
});
