import { describe, expect, it, vi } from "vitest";

import { createJobEventProcessor } from "./job-event.ts";

const ctx = (jobId = "e1") =>
  ({
    logger: { info: vi.fn() },
    signal: new AbortController().signal,
    jobId,
    attempt: 1,
    requestId: null,
  }) as never;
const base = { v: 1, jobId: "j1", postedBy: "poster-1", actorId: "rev-1" };

describe("job event processor", () => {
  it("notifies the poster on job.published with the outbox event id", async () => {
    const deliver = vi.fn(async () => {});
    const processor = createJobEventProcessor("published", {
      deliver,
      findEmail: async () => "poster@nitap.ac.in",
    });
    await processor({ ...base, directPublish: false } as never, ctx("e1"));
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "e1",
        type: "job.published",
        recipientId: "poster-1",
        emailTo: "poster@nitap.ac.in",
      })
    );
  });

  it("fans job.submitted out to moderators", async () => {
    const deliver = vi.fn(async () => {});
    const processor = createJobEventProcessor("submitted", {
      deliver,
      findEmail: async () => "mod@nitap.ac.in",
      findModerators: async () => ["mod-1"],
    });
    await processor({ ...base, actorId: "poster-1" } as never, ctx());
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "mod-1", type: "job.submitted" })
    );
  });

  it("job.submitted is now in-app + email (spec catalogue, updated 12E); job.closed by someone else is in-app only", async () => {
    const deliver = vi.fn(async (input: unknown) => void input);
    const findEmail = vi.fn(async () => "x@nitap.ac.in");
    await createJobEventProcessor("submitted", {
      deliver,
      findEmail,
      findModerators: async () => ["mod-1"],
    })({ ...base, actorId: "poster-1" } as never, ctx());
    await createJobEventProcessor("closed", { deliver, findEmail })(
      base as never,
      ctx()
    );
    expect(deliver.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({
        type: "job.submitted",
        emailTo: "x@nitap.ac.in",
      }),
      expect.objectContaining({ type: "job.closed", emailTo: undefined }),
    ]);
  });

  it("does not notify the submitter when they hold job.approve", async () => {
    const deliver = vi.fn(async () => {});
    const processor = createJobEventProcessor("submitted", {
      deliver,
      findEmail: async () => "x",
      findModerators: async () => ["poster-1", "mod-1"],
    });
    await processor({ ...base, actorId: "poster-1" } as never, ctx());
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "mod-1" })
    );
  });

  it("job.expired is in-app only for the poster", async () => {
    const deliver = vi.fn(async () => {});
    const findEmail = vi.fn(async () => "poster@nitap.ac.in");
    const processor = createJobEventProcessor("expired", {
      deliver,
      findEmail,
    });
    await processor(
      { v: 1, jobId: "j1", postedBy: "poster-1" } as never,
      ctx()
    );
    const input = (deliver.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(input).toMatchObject({
      type: "job.expired",
      recipientId: "poster-1",
    });
    expect(input.emailTo).toBeUndefined();
  });

  it("skips a self-close", async () => {
    const deliver = vi.fn(async () => {});
    const processor = createJobEventProcessor("closed", {
      deliver,
      findEmail: async () => "x",
    });
    await processor({ ...base, actorId: "poster-1" } as never, ctx());
    expect(deliver).not.toHaveBeenCalled();
  });

  it("omits emailTo when the account has no deliverable email", async () => {
    const deliver = vi.fn(async () => {});
    const processor = createJobEventProcessor("rejected", {
      deliver,
      findEmail: async () => null,
    });
    await processor(base as never, ctx());
    expect((deliver.mock.calls[0] as unknown[])[0]).toMatchObject({
      type: "job.rejected",
      emailTo: undefined,
    });
  });
});
