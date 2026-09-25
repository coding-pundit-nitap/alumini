import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import type { DeliverNotification } from "../notifications/deliver.ts";
import { createAnnouncementPublishedProcessor } from "./announcement-published.ts";

const ctx = (signal = new AbortController().signal) => ({
  jobId: "evt-1",
  attempt: 1,
  requestId: null,
  signal,
  logger: silentLogger(),
});
const payload = { v: 1 as const, postId: "p1", authorId: "u2" };
const users = ["u1", "u2", "u3", "u4", "u5"].map((id) => ({
  id,
  email: `${id}@nitap.ac.in`,
}));
const pager = vi.fn(async (afterId: string | null, limit: number) => {
  const start = afterId ? users.findIndex((u) => u.id === afterId) + 1 : 0;
  return users.slice(start, start + limit);
});

describe("announcement.published", () => {
  it("walks every batch, skips the author, emails each recipient with the job id", async () => {
    const deliver = vi.fn<DeliverNotification>(async () => {});
    await createAnnouncementPublishedProcessor({
      deliver,
      postIsLive: async () => true,
      listRecipients: pager,
      batchSize: 2,
    })(payload, ctx());
    expect(deliver.mock.calls.map(([c]) => c.recipientId)).toEqual([
      "u1",
      "u3",
      "u4",
      "u5",
    ]);
    for (const [call] of deliver.mock.calls) {
      expect(call).toMatchObject({
        eventId: "evt-1",
        type: "announcement.published",
        category: "ENGAGEMENT",
        payload: { postId: "p1" },
        emailTo: `${call.recipientId}@nitap.ac.in`,
      });
    }
    expect(pager).toHaveBeenLastCalledWith("u5", 2);
  });

  it("notifies no one when the announcement was removed before the job ran", async () => {
    const deliver = vi.fn<DeliverNotification>(async () => {});
    await createAnnouncementPublishedProcessor({
      deliver,
      postIsLive: async () => false,
      listRecipients: pager,
    })(payload, ctx());
    expect(deliver).not.toHaveBeenCalled();
  });
});
