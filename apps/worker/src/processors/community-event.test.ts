import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import type { DeliverNotification } from "../notifications/deliver.ts";
import {
  createAchievementApprovedProcessor,
  createAchievementRejectedProcessor,
  createAchievementSubmittedProcessor,
  createCommentCreatedProcessor,
  createContentRemovedProcessor,
  createReactionAddedProcessor,
  createReportFiledProcessor,
  createReportResolvedProcessor,
} from "./community-event.ts";

const ctx = (jobId = "j1") => ({
  jobId,
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger: silentLogger(),
});
const base = () => ({
  deliver: vi.fn<DeliverNotification>(async () => {}),
  findEmail: vi.fn(async () => "e@nitap.ac.in" as string | null),
});
const comment = {
  v: 1 as const,
  commentId: "cm1",
  postId: "p1",
  authorId: "c1",
};
const ach = { v: 1 as const, achievementId: "a1", userId: "u1" };
const achApproved = { ...ach, postId: "p1" };
const filed = {
  v: 1 as const,
  reportId: "r1",
  targetType: "POST" as const,
  targetId: "p1",
  reporterId: "rep1",
};

describe("comment.created", () => {
  const deps = (
    over: Partial<{
      blockedIds: string[];
      live: boolean;
      author: string | null;
    }> = {}
  ) => ({
    ...base(),
    findPostAuthor: vi.fn(async () =>
      over.author === undefined ? "author-1" : over.author
    ),
    findPriorCommenters: vi.fn(async () => [
      "prior-1",
      "author-1",
      "c1",
      "prior-1",
    ]),
    commentIsLive: vi.fn(async () => over.live ?? true),
    blocked: vi.fn(async (_a: string, b: string) =>
      (over.blockedIds ?? []).includes(b)
    ),
  });

  it("notifies author and deduped prior commenters, never the commenter", async () => {
    const d = deps();
    await createCommentCreatedProcessor(d)(comment, ctx());
    expect(d.deliver.mock.calls.map((c) => c[0].recipientId).sort()).toEqual([
      "author-1",
      "prior-1",
    ]);
    expect(d.deliver.mock.calls[0]![0]).toMatchObject({
      eventId: "j1",
      type: "comment.created",
      payload: { postId: "p1", commentId: "cm1" },
      emailTo: "e@nitap.ac.in",
    });
  });

  it("skips blocked recipients", async () => {
    const d = deps({ blockedIds: ["prior-1"] });
    await createCommentCreatedProcessor(d)(comment, ctx());
    expect(d.deliver.mock.calls.map((c) => c[0].recipientId)).toEqual([
      "author-1",
    ]);
  });

  it("returns quietly when the comment or post is gone", async () => {
    const gone = deps({ live: false });
    await createCommentCreatedProcessor(gone)(comment, ctx());
    const noPost = deps({ author: null });
    await createCommentCreatedProcessor(noPost)(comment, ctx());
    expect(gone.deliver).not.toHaveBeenCalled();
    expect(noPost.deliver).not.toHaveBeenCalled();
  });

  it("redelivery yields identical deliver inputs", async () => {
    const d = deps();
    const p = createCommentCreatedProcessor(d);
    await p(comment, ctx("same"));
    const first = d.deliver.mock.calls.map((c) => c[0]);
    d.deliver.mockClear();
    await p(comment, ctx("same"));
    expect(d.deliver.mock.calls.map((c) => c[0])).toEqual(first);
  });
});

describe("reaction.added", () => {
  it("does nothing", async () => {
    await createReactionAddedProcessor()(
      { v: 1, postId: "p1", userId: "u1", type: "like" },
      ctx()
    );
  });
});

describe("achievement.*", () => {
  it("submitted fans out in-app only to reviewers, minus the submitter", async () => {
    const findModerators = vi.fn(async () => ["m1", "u1", "m2"]);
    const d = {
      ...base(),
      findModerators,
      achievementExists: vi.fn(async () => true),
    };
    await createAchievementSubmittedProcessor(d)(ach, ctx());
    expect(findModerators).toHaveBeenCalledWith("achievement.review");
    expect(d.deliver.mock.calls.map((c) => c[0].recipientId)).toEqual([
      "m1",
      "m2",
    ]);
    expect(d.deliver.mock.calls[0]![0].emailTo).toBeUndefined();
    expect(d.deliver.mock.calls[0]![0].payload).toEqual({
      achievementId: "a1",
    });
  });

  it("submitted skips when the achievement is gone", async () => {
    const d = {
      ...base(),
      findModerators: vi.fn(async () => ["m1"]),
      achievementExists: vi.fn(async () => false),
    };
    await createAchievementSubmittedProcessor(d)(ach, ctx());
    expect(d.deliver).not.toHaveBeenCalled();
  });

  it.each([
    ["approved", createAchievementApprovedProcessor, achApproved],
    ["rejected", createAchievementRejectedProcessor, ach],
  ] as const)(
    "%s notifies the submitter with email; redelivery is identical",
    async (name, make, payload) => {
      const d = { ...base(), achievementExists: vi.fn(async () => true) };
      const p = make(d as never) as (p: unknown, c: unknown) => Promise<void>;
      await p(payload, ctx("s"));
      await p(payload, ctx("s"));
      const [a, b] = d.deliver.mock.calls.map((c) => c[0]);
      expect(a).toEqual(b);
      expect(a).toMatchObject({
        type: `achievement.${name}`,
        recipientId: "u1",
        payload: { achievementId: "a1" },
        emailTo: "e@nitap.ac.in",
      });
    }
  );

  it("approved skips when the achievement is gone", async () => {
    const d = { ...base(), achievementExists: vi.fn(async () => false) };
    await createAchievementApprovedProcessor(d)(achApproved, ctx());
    expect(d.deliver).not.toHaveBeenCalled();
  });
});

describe("report.*", () => {
  it("filed fans out in-app to report.review holders, minus the reporter", async () => {
    const findModerators = vi.fn(async () => ["mod-1", "rep1", "mod-2"]);
    const d = {
      ...base(),
      findModerators,
      reportExists: vi.fn(async () => true),
    };
    await createReportFiledProcessor(d)(filed, ctx());
    expect(findModerators).toHaveBeenCalledWith("report.review");
    expect(d.deliver.mock.calls.map((c) => c[0].recipientId)).toEqual([
      "mod-1",
      "mod-2",
    ]);
    expect(d.deliver.mock.calls[0]![0].emailTo).toBeUndefined();
  });

  it("filed skips when the report is gone", async () => {
    const d = {
      ...base(),
      findModerators: vi.fn(async () => ["m"]),
      reportExists: vi.fn(async () => false),
    };
    await createReportFiledProcessor(d)(filed, ctx());
    expect(d.deliver).not.toHaveBeenCalled();
  });

  it("resolved notifies the reporter in-app; gone report is a no-op", async () => {
    const d = {
      ...base(),
      findReporter: vi.fn(async () => "rep1" as string | null),
    };
    const payload = {
      v: 1 as const,
      reportId: "r1",
      outcome: "resolved" as const,
    };
    await createReportResolvedProcessor(d)(payload, ctx());
    expect(d.deliver.mock.calls[0]![0]).toMatchObject({
      type: "report.resolved",
      recipientId: "rep1",
      payload: { reportId: "r1", outcome: "resolved" },
    });
    expect(d.deliver.mock.calls[0]![0].emailTo).toBeUndefined();
    d.findReporter.mockResolvedValue(null);
    d.deliver.mockClear();
    await createReportResolvedProcessor(d)(payload, ctx());
    expect(d.deliver).not.toHaveBeenCalled();
  });
});

describe("content.removed", () => {
  const payload = {
    v: 1 as const,
    targetType: "COMMENT" as const,
    targetId: "cm1",
    reportId: "r1",
  };
  it("notifies the author with email; redelivery is identical", async () => {
    const d = {
      ...base(),
      findContentAuthor: vi.fn(async () => "au1" as string | null),
    };
    const p = createContentRemovedProcessor(d);
    await p(payload, ctx("s"));
    await p(payload, ctx("s"));
    const [a, b] = d.deliver.mock.calls.map((c) => c[0]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({
      type: "content.removed",
      recipientId: "au1",
      payload: { targetType: "COMMENT", targetId: "cm1" },
      emailTo: "e@nitap.ac.in",
    });
  });
  it("no-ops when the content row is gone", async () => {
    const d = { ...base(), findContentAuthor: vi.fn(async () => null) };
    await createContentRemovedProcessor(d)(payload, ctx());
    expect(d.deliver).not.toHaveBeenCalled();
  });
});
