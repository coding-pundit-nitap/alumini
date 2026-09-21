import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import { createIdempotencySweepProcessor } from "./idempotency-sweep.ts";

const context = (signal = new AbortController().signal) => ({
  jobId: "j",
  attempt: 1,
  requestId: null,
  signal,
  logger: silentLogger(),
});

describe("idempotency.sweep processor", () => {
  it("sweeps rows older than 24 h, in batches, until a short one", async () => {
    const now = new Date("2026-09-21T12:00:00Z");
    const sweep = vi
      .fn<(before: Date, limit: number) => Promise<number>>()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    await createIdempotencySweepProcessor({
      sweep,
      batchSize: 3,
      now: () => now,
    })({ v: 1 }, context());
    expect(sweep).toHaveBeenCalledTimes(3);
    expect(sweep).toHaveBeenCalledWith(new Date("2026-09-20T12:00:00Z"), 3);
  });

  it("stops at once when the job is aborted", async () => {
    const abort = new AbortController();
    abort.abort();
    const sweep = vi.fn(async () => 0);
    await createIdempotencySweepProcessor({ sweep })(
      { v: 1 },
      context(abort.signal)
    );
    expect(sweep).not.toHaveBeenCalled();
  });
});
