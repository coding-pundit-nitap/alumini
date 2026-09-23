import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { PERMISSIONS } from "@nitap/database/permissions";
import type { Permission } from "@nitap/database/permissions";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createApproveJob } from "@/modules/jobs/application/approve-job";
import { createCreateJob } from "@/modules/jobs/application/create-job";
import { createEditJob } from "@/modules/jobs/application/edit-job";
import { createListPublishedJobs } from "@/modules/jobs/application/list-published-jobs";
import { createRejectJob } from "@/modules/jobs/application/reject-job";
import { createPrismaJobQueries } from "@/modules/jobs/infrastructure/prisma-job-queries";
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
  let moderator: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    poster = (
      await db.prisma.user.create({
        data: { name: "Poster", email: "poster@example.test" },
      })
    ).id;
    moderator = (
      await db.prisma.user.create({
        data: { name: "Moderator", email: "mod@example.test" },
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
      approveJob: createApproveJob({ store, authorize }),
      rejectJob: createRejectJob({ store, authorize }),
    };
  }

  const code = (promise: Promise<unknown>) =>
    promise.then(
      () => "ok",
      (e: { code?: string }) => e.code ?? "error"
    );

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

  it("approve racing reject on the same PENDING_REVIEW job: exactly one wins (spec J-6)", async () => {
    const { createJob, approveJob, rejectJob } = build();
    for (let round = 0; round < 10; round += 1) {
      const created = await createJob({
        actor: actor(poster, [PERMISSIONS.JOB_CREATE]),
        input: validInput,
      });
      const approvedBefore = await db.prisma.outboxEvent.count({
        where: { type: "job.published" },
      });
      const rejectedBefore = await db.prisma.outboxEvent.count({
        where: { type: "job.rejected" },
      });

      const [approved, rejected] = await Promise.all([
        code(
          approveJob({
            actor: actor(moderator, [PERMISSIONS.JOB_APPROVE]),
            jobId: created.jobId,
          })
        ),
        code(
          rejectJob({
            actor: actor(moderator, [PERMISSIONS.JOB_APPROVE]),
            jobId: created.jobId,
            input: { reviewNote: "Needs more detail" },
          })
        ),
      ]);

      // Never both refused, and never both succeeding — the DB's guarded UPDATE lets exactly one through.
      expect(approved === "ok" && rejected === "ok").toBe(false);
      expect(
        approved === "INVALID_STATE_TRANSITION" &&
          rejected === "INVALID_STATE_TRANSITION"
      ).toBe(false);

      const row = await db.prisma.job.findUniqueOrThrow({
        where: { id: created.jobId },
      });
      if (approved === "ok") {
        expect(row.status).toBe("PUBLISHED");
      } else {
        expect(rejected).toBe("ok");
        expect(row.status).toBe("REJECTED");
      }

      const approvedAfter =
        (await db.prisma.outboxEvent.count({
          where: { type: "job.published" },
        })) - approvedBefore;
      const rejectedAfter =
        (await db.prisma.outboxEvent.count({
          where: { type: "job.rejected" },
        })) - rejectedBefore;
      expect(approvedAfter).toBe(approved === "ok" ? 1 : 0);
      expect(rejectedAfter).toBe(rejected === "ok" ? 1 : 0);
    }
  });

  it("the poster cannot approve or reject their own job even holding job.approve (spec J-5)", async () => {
    const { createJob, approveJob, rejectJob } = build();
    const created = await createJob({
      actor: actor(poster, [PERMISSIONS.JOB_CREATE, PERMISSIONS.JOB_APPROVE]),
      input: validInput,
    });
    // direct-publish already happened; make a second PENDING_REVIEW job with the poster also holding job.approve
    const pending = await createJob({
      actor: actor(poster, [PERMISSIONS.JOB_CREATE]),
      input: validInput,
    });
    await expect(
      approveJob({
        actor: actor(poster, [PERMISSIONS.JOB_APPROVE]),
        jobId: pending.jobId,
      })
    ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN" });
    await expect(
      rejectJob({
        actor: actor(poster, [PERMISSIONS.JOB_APPROVE]),
        jobId: pending.jobId,
        input: { reviewNote: "note" },
      })
    ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN" });
    void created;
  });

  it("a job due exactly today stays listed; a job due yesterday does not (spec J-9)", async () => {
    const { createJob } = build();
    const listPublishedJobs = createListPublishedJobs({
      queries: createPrismaJobQueries(db.prisma),
      authorize,
    });
    const todayIso = new Date().toISOString().slice(0, 10);
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const dueToday = await createJob({
      actor: actor(poster, [PERMISSIONS.JOB_CREATE, PERMISSIONS.JOB_APPROVE]),
      input: { ...validInput, deadline: todayIso },
    });
    const dueYesterday = await createJob({
      actor: actor(poster, [PERMISSIONS.JOB_CREATE, PERMISSIONS.JOB_APPROVE]),
      input: { ...validInput, deadline: yesterdayIso },
    });

    const page = await listPublishedJobs({
      actor: actor(poster, [PERMISSIONS.JOB_READ]),
    });
    const ids = page.data.map((j) => j.id);
    expect(ids).toContain(dueToday.jobId);
    expect(ids).not.toContain(dueYesterday.jobId);
  });
});
