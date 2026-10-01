import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import { createDonationExpireProcessor } from "./donation-expire.ts";

const context = (signal = new AbortController().signal) => ({
  jobId: "j",
  attempt: 1,
  requestId: null,
  signal,
  logger: silentLogger(),
});

describe("donation.expire-pledges processor (12H H-8)", () => {
  it("expires pledges older than 30 days in batches until a short one", async () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const store = {
      listStale: vi
        .fn()
        .mockResolvedValueOnce([{ id: "a" }, { id: "b" }])
        .mockResolvedValueOnce([{ id: "c" }]),
      expireOne: vi.fn(async (id: string) => id !== "b"),
    };
    await createDonationExpireProcessor({
      store,
      batchSize: 2,
      now: () => now,
    })({ v: 1 }, context());
    const before = new Date("2026-09-01T00:00:00Z");
    expect(store.listStale).toHaveBeenCalledWith(before, 2);
    expect(store.expireOne).toHaveBeenCalledTimes(3);
    expect(store.expireOne).toHaveBeenCalledWith("a", before, now);
  });

  it("stops when aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const store = { listStale: vi.fn(), expireOne: vi.fn() };
    await createDonationExpireProcessor({ store })(
      { v: 1 },
      context(ac.signal)
    );
    expect(store.listStale).not.toHaveBeenCalled();
  });
});
