import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "@nitap/database/permissions";
import type { Permission } from "@nitap/database/permissions";

import {
  AuthenticationError,
  AuthorizationError,
  RateLimitedError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeJobStore } from "../../../../tests/support/fake-job-store";
import { createCreateJob } from "./create-job";

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
const allowAll = { consume: async () => ({ allowed: true, retryAfter: null }) };
const authorize = (a: Actor | null, permission: string) => {
  if (!a) throw new AuthenticationError();
  if (!a.grants.some((g) => g.permission === permission)) {
    throw new AuthorizationError({ code: "PERMISSION_DENIED" });
  }
  return a;
};
const can = (a: Actor, permission: string) =>
  a.grants.some((g) => g.permission === permission);

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

function build(overrides: Partial<Parameters<typeof createCreateJob>[0]> = {}) {
  const { store, rows, events, audits } = createFakeJobStore();
  const createJob = createCreateJob({
    store,
    authorize,
    can,
    rateLimiter: allowAll,
    ...overrides,
  });
  return { createJob, rows, events, audits };
}

describe("createJob", () => {
  it("without job.approve, creates PENDING_REVIEW and emits job.submitted", async () => {
    const { createJob, rows, events } = build();
    const result = await createJob({
      actor: actor("poster-1", [PERMISSIONS.JOB_CREATE]),
      input: validInput,
    });
    expect(result.status).toBe("PENDING_REVIEW");
    expect(rows.get(result.jobId)).toMatchObject({
      status: "PENDING_REVIEW",
      postedBy: "poster-1",
    });
    expect(events).toEqual([
      {
        type: "job.submitted",
        payload: {
          v: 1,
          jobId: result.jobId,
          postedBy: "poster-1",
          actorId: "poster-1",
        },
      },
    ]);
  });

  it("with job.approve, publishes directly and emits job.published with directPublish: true", async () => {
    const { createJob, rows, events } = build();
    const result = await createJob({
      actor: actor("poster-1", [
        PERMISSIONS.JOB_CREATE,
        PERMISSIONS.JOB_APPROVE,
      ]),
      input: validInput,
    });
    expect(result.status).toBe("PUBLISHED");
    expect(rows.get(result.jobId)?.status).toBe("PUBLISHED");
    expect(events[0]).toMatchObject({
      type: "job.published",
      payload: {
        directPublish: true,
        postedBy: "poster-1",
        actorId: "poster-1",
      },
    });
  });

  it("rejects an unauthenticated caller before touching the store", async () => {
    const { createJob, rows } = build();
    await expect(createJob({ actor: null, input: validInput })).rejects.toThrow(
      AuthenticationError
    );
    expect(rows.size).toBe(0);
  });

  it("rejects a non-https application_url with a field-level ValidationError", async () => {
    const { createJob } = build();
    await expect(
      createJob({
        actor: actor("poster-1", [PERMISSIONS.JOB_CREATE]),
        input: { ...validInput, applicationUrl: "http://acme.example" },
      })
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("is rate-limited at 10/hour/member (spec J-16)", async () => {
    const { createJob } = build({
      rateLimiter: {
        consume: async () => ({ allowed: false, retryAfter: 42 }),
      },
    });
    await expect(
      createJob({
        actor: actor("poster-1", [PERMISSIONS.JOB_CREATE]),
        input: validInput,
      })
    ).rejects.toThrow(RateLimitedError);
  });

  it("calls observe with publish_direct (not published) when a job.approve holder posts directly", async () => {
    const observe = vi.fn();
    const { createJob } = build({ observe });
    const result = await createJob({
      actor: actor("poster-1", [
        PERMISSIONS.JOB_CREATE,
        PERMISSIONS.JOB_APPROVE,
      ]),
      input: validInput,
    });
    expect(observe).toHaveBeenCalledWith("publish_direct", result.jobId);
  });

  it("audits a direct publish by a job.approve holder, and not an ordinary submission", async () => {
    const { createJob, audits } = build();
    await createJob({
      actor: actor("poster-1", [PERMISSIONS.JOB_CREATE]),
      input: validInput,
    });
    expect(audits).toEqual([]);
    const { jobId } = await createJob({
      actor: actor("tp-1", [PERMISSIONS.JOB_CREATE, PERMISSIONS.JOB_APPROVE]),
      input: validInput,
    });
    expect(audits).toEqual([
      {
        action: "job.publish_direct",
        actorId: "tp-1",
        jobId,
        postedBy: "tp-1",
      },
    ]);
  });
});
