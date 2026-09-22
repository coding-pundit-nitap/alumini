import { describe, expect, it } from "vitest";

import type { Permission } from "@nitap/database/permissions";

import { AuthenticationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  createFakeJobStore,
  jobRow,
} from "../../../../tests/support/fake-job-store";
import { createEditJob } from "./edit-job";

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
const authorize = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};
const can = (a: Actor, permission: string) =>
  a.grants.some((g) => g.permission === permission);

const edit = {
  title: "Backend Engineer II",
  company: "Acme",
  description: "Build more things",
  employmentType: "FULL_TIME",
  location: "Remote",
  workMode: "REMOTE",
  experience: "3+ years",
  skills: ["node", "postgres"],
  applicationUrl: "https://acme.example/apply",
  deadline: "2026-12-01",
};

function build(seed = [jobRow()]) {
  const { store, rows, events } = createFakeJobStore(seed);
  const editJob = createEditJob({ store, authorize, can });
  return { editJob, rows, events };
}

const nonMaterialOnly = {
  ...edit,
  title: "Backend Engineer",
  description: "Build things",
};

describe("editJob", () => {
  it("a non-material change on a PUBLISHED job stays PUBLISHED, no event", async () => {
    const { editJob, rows, events } = build([jobRow({ status: "PUBLISHED" })]);
    const result = await editJob({
      actor: actor("poster-1"),
      jobId: "job-1",
      input: { ...nonMaterialOnly, experience: "5+ years" }, // non-material only
    });
    expect(result.status).toBe("PUBLISHED");
    expect(rows.get("job-1")?.experience).toBe("5+ years");
    expect(events).toEqual([]);
  });

  it("a material change (title) on a PUBLISHED job reverts to PENDING_REVIEW and emits job.submitted", async () => {
    const { editJob, rows, events } = build([
      jobRow({
        status: "PUBLISHED",
        reviewedBy: "mod-1",
        reviewedAt: new Date(),
      }),
    ]);
    const result = await editJob({
      actor: actor("poster-1"),
      jobId: "job-1",
      input: edit,
    });
    expect(result.status).toBe("PENDING_REVIEW");
    expect(rows.get("job-1")).toMatchObject({
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
    });
    expect(events).toEqual([
      {
        type: "job.submitted",
        payload: {
          v: 1,
          jobId: "job-1",
          postedBy: "poster-1",
          actorId: "poster-1",
        },
      },
    ]);
  });

  it("editing a REJECTED job (any field) resubmits and clears the review note", async () => {
    const { editJob, rows } = build([
      jobRow({ status: "REJECTED", reviewNote: "Add a salary range" }),
    ]);
    const result = await editJob({
      actor: actor("poster-1"),
      jobId: "job-1",
      input: { ...edit, experience: "changed only this" },
    });
    expect(result.status).toBe("PENDING_REVIEW");
    expect(rows.get("job-1")?.reviewNote).toBeNull();
  });

  it("a job.manage holder may edit someone else's job", async () => {
    const { editJob } = build([
      jobRow({ status: "PUBLISHED", postedBy: "poster-1" }),
    ]);
    const result = await editJob({
      actor: actor("admin-1", ["job.manage"]),
      jobId: "job-1",
      input: { ...nonMaterialOnly, experience: "5+ years" },
    });
    expect(result.status).toBe("PUBLISHED");
  });

  it("a stranger without job.manage is refused NOT_OWNER", async () => {
    const { editJob } = build([
      jobRow({ status: "PUBLISHED", postedBy: "poster-1" }),
    ]);
    await expect(
      editJob({ actor: actor("stranger-1"), jobId: "job-1", input: edit })
    ).rejects.toMatchObject({ code: "NOT_OWNER" });
  });

  it("editing a non-existent job is NOT_FOUND", async () => {
    const { editJob } = build([]);
    await expect(
      editJob({ actor: actor("poster-1"), jobId: "job-1", input: edit })
    ).rejects.toThrow(NotFoundError);
  });

  it.each(["EXPIRED", "CLOSED"] as const)(
    "editing a terminal %s job is refused",
    async (status) => {
      const { editJob } = build([jobRow({ status })]);
      await expect(
        editJob({ actor: actor("poster-1"), jobId: "job-1", input: edit })
      ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    }
  );
});
