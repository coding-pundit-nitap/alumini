import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import { createNotificationRetentionSweepProcessor } from "./notification-retention-sweep.ts";

const context = (signal = new AbortController().signal) => ({
  jobId: "j",
  attempt: 1,
  requestId: null,
  signal,
  logger: silentLogger(),
});

describe("notification.retention-sweep processor", () => {
  it("sweeps read rows older than 90 days in batches until a short one", async () => {
    const sweep = vi
      .fn<(before: Date, limit: number) => Promise<number>>()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    await createNotificationRetentionSweepProcessor({
      sweep,
      batchSize: 3,
      now: () => new Date("2026-09-23T00:00:00Z"),
    })({ v: 1 }, context());
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(sweep).toHaveBeenCalledWith(new Date("2026-06-25T00:00:00Z"), 3);
  });

  it("uses the configured period, read at the start of the run", async () => {
    const sweep = vi.fn(async () => 0);
    await createNotificationRetentionSweepProcessor({
      sweep,
      retentionDays: async () => 120,
      batchSize: 3,
      now: () => new Date("2026-09-23T00:00:00Z"),
    })({ v: 1 }, context());
    expect(sweep).toHaveBeenCalledWith(new Date("2026-05-26T00:00:00Z"), 3);
  });

  it("stops when aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const sweep = vi.fn();
    await createNotificationRetentionSweepProcessor({ sweep })(
      { v: 1 },
      context(ac.signal)
    );
    expect(sweep).not.toHaveBeenCalled();
  });
});
