import { describe, expect, it, vi } from "vitest";

import type { OutboxStore } from "@nitap/jobs";

import { silentLogger } from "../../tests/support.ts";
import { createOutboxPruneProcessor } from "./outbox-prune.ts";

const NOW = new Date("2026-09-21T00:00:00.000Z");
const context = (signal = new AbortController().signal) => ({
  jobId: "outbox-prune",
  attempt: 1,
  requestId: null,
  signal,
  logger: silentLogger(),
});

describe("outbox.prune processor", () => {
  it("deletes rows older than the retention window, in batches, until a short batch", async () => {
    const pruneBefore = vi
      .fn<OutboxStore["pruneBefore"]>()
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(37);
    const processor = createOutboxPruneProcessor(
      { pruneBefore } as unknown as OutboxStore,
      {
        retentionDays: 7,
        batchSize: 1000,
        now: () => NOW,
      }
    );

    await processor({ v: 1 }, context());

    expect(pruneBefore).toHaveBeenCalledTimes(3);
    expect(pruneBefore).toHaveBeenCalledWith(
      new Date("2026-09-14T00:00:00.000Z"),
      1000
    );
  });

  it("stops between batches when its signal is aborted", async () => {
    const controller = new AbortController();
    const pruneBefore = vi.fn<OutboxStore["pruneBefore"]>(async () => {
      controller.abort();
      return 1000;
    });
    const processor = createOutboxPruneProcessor(
      { pruneBefore } as unknown as OutboxStore,
      {
        batchSize: 1000,
        now: () => NOW,
      }
    );

    await processor({ v: 1 }, context(controller.signal));

    expect(pruneBefore).toHaveBeenCalledTimes(1);
  });
});
