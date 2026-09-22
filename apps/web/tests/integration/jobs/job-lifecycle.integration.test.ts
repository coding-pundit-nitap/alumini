import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { PERMISSIONS } from "@nitap/database/permissions";
import type { Permission } from "@nitap/database/permissions";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createCreateJob } from "@/modules/jobs/application/create-job";
import { createEditJob } from "@/modules/jobs/application/edit-job";
import { createPrismaJobStore } from "@/modules/jobs/infrastructure/prisma-job-store";

const actor = (userId: string, grants: Permission[] = []): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: grants.map((permission) => ({
    permission,
    scope: "GLOBAL" as const,
    expiresAt: null,
  })),
});
const authorize = (a: Actor | null, permission: string) => {
  if (!a) throw new AuthenticationError();
  if (!a.grants.some((g) => g.permission === permission)) {
    throw new AuthorizationError({ code: "PERMISSION_DENIED" });
  }
  return a;
};
const can = (a: Actor, permission: string) =>
  a.grants.some((g) => g.permission === permission);
const allowAll = { consume: async () => ({ allowed: true, retryAfter: null }) };

const validInput = {
  title: "Backend Engineer",
  company: "Acme",
  description: "Build things",
  employmentType: "FULL_TIME",
  location: "Remote",
  workMode: "REMOTE",
  experience: "2+ years",
  skills: ["node"],
  applicationUrl: "https://acme.example/apply",
  deadline: "2026-12-01",
};

describe("job create/edit against real PostgreSQL", () => {
  let db: TestDatabase;
  let poster: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    poster = (
      await db.prisma.user.create({
        data: { name: "Poster", email: "poster@example.test" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  function build() {
    const outbox = createOutboxWriter();
    const store = createPrismaJobStore({
      runner: createTransactionRunner(db.prisma),
      outbox,
    });
    return {
      createJob: createCreateJob({
        store,
        authorize,
        can,
        rateLimiter: allowAll,
      }),
      editJob: createEditJob({ store, authorize, can }),
    };
  }

  it("creates a row and its job.submitted outbox event in one transaction", async () => {
    const { createJob } = build();
    const result = await createJob({
      actor: actor(poster, [PERMISSIONS.JOB_CREATE]),
      input: validInput,
    });
    const row = await db.prisma.job.findUniqueOrThrow({
      where: { id: result.jobId },
    });
    expect(row.status).toBe("PENDING_REVIEW");
    const events = await db.prisma.outboxEvent.findMany({
      where: { type: "job.submitted" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      jobId: result.jobId,
      postedBy: poster,
    });
  });

  it("a material edit on PUBLISHED reverts to PENDING_REVIEW and writes a second job.submitted event", async () => {
    const { createJob, editJob } = build();
    const created = await createJob({
      actor: actor(poster, [PERMISSIONS.JOB_CREATE, PERMISSIONS.JOB_APPROVE]),
      input: validInput,
    });
    expect(created.status).toBe("PUBLISHED");

    await editJob({
      actor: actor(poster, [PERMISSIONS.JOB_READ]),
      jobId: created.jobId,
      input: { ...validInput, title: "Senior Backend Engineer" },
    });
    const row = await db.prisma.job.findUniqueOrThrow({
      where: { id: created.jobId },
    });
    expect(row.status).toBe("PENDING_REVIEW");
    const events = await db.prisma.outboxEvent.findMany({
      where: { type: "job.submitted" },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(1); // job.published was the first event, not job.submitted — direct publish skipped it
  });
});
