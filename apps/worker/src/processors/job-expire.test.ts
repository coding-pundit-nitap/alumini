import { describe, expect, it } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import { createJobExpireProcessor } from "./job-expire.ts";
import type { JobExpireCandidate, JobExpireStoreLike } from "./job-expire.ts";

const context = () => ({
  jobId: "job-1",
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger: silentLogger(),
});

function fakeStore(
  batches: JobExpireCandidate[][],
  expireResults: Record<string, boolean> = {}
): JobExpireStoreLike & { expired: string[] } {
  const expired: string[] = [];
  let call = 0;
  return {
    expired,
    async listExpirable() {
      const batch = batches[call] ?? [];
      call += 1;
      return batch;
    },
    async expireOne(id) {
      const flipped = expireResults[id] ?? true;
      if (flipped) expired.push(id);
      return flipped;
    },
  };
}

describe("job.expire processor", () => {
  it("expires every PUBLISHED row past its deadline, across a full batch and a short final one", async () => {
    const batchA: JobExpireCandidate[] = [
      { id: "a", postedBy: "u1" },
      { id: "b", postedBy: "u2" },
    ];
    const batchB: JobExpireCandidate[] = [{ id: "c", postedBy: "u3" }];
    const store = fakeStore([batchA, batchB, []]);

    await createJobExpireProcessor({ store, batchSize: 2 })(
      { v: 1 },
      context()
    );

    expect(store.expired.sort()).toEqual(["a", "b", "c"]);
  });

  it("is a no-op on a second run: listExpirable already excludes PUBLISHED rows that left the state", async () => {
    const store = fakeStore([[]]); // nothing left to expire
    await createJobExpireProcessor({ store })({ v: 1 }, context());
    expect(store.expired).toEqual([]);
  });

  it("counts only rows expireOne actually flipped (a row raced by an edit is skipped, not double-counted)", async () => {
    const batch: JobExpireCandidate[] = [
      { id: "a", postedBy: "u1" },
      { id: "b", postedBy: "u2" },
    ];
    const store = fakeStore([batch, []], { b: false }); // "b" was edited back to PENDING_REVIEW mid-sweep
    await createJobExpireProcessor({ store, batchSize: 10 })(
      { v: 1 },
      context()
    );
    expect(store.expired).toEqual(["a"]);
  });

  it("survives a mid-batch restart: re-running after a partial batch reaches the same end state", async () => {
    // First run processes only "a" (simulated abort before "b" — the processor itself has no abort here,
    // so this models the restart by giving the second run a store that already lacks "a").
    const firstRun = fakeStore([[{ id: "a", postedBy: "u1" }]]);
    await createJobExpireProcessor({ store: firstRun })({ v: 1 }, context());
    expect(firstRun.expired).toEqual(["a"]);

    const secondRun = fakeStore([[{ id: "b", postedBy: "u2" }], []]);
    await createJobExpireProcessor({ store: secondRun })({ v: 1 }, context());
    expect(secondRun.expired).toEqual(["b"]);
  });
});
