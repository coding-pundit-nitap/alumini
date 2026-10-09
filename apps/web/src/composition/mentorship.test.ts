import { describe, expect, it, vi } from "vitest";

import type { Captured } from "../../tests/support/capture-factories";

const captured = vi.hoisted(() => new Map<string, Captured>());

vi.mock("@/modules/mentorship", async (importOriginal) => {
  const { captureFactories } =
    await import("../../tests/support/capture-factories");
  return captureFactories(await importOriginal(), captured);
});
vi.mock("./ticks", async () => ({
  addTicks: (await import("../../tests/support/capture-factories")).infra
    .addTicks,
}));
vi.mock("@/infrastructure/observability", async () => {
  const { infra } = await import("../../tests/support/capture-factories");
  return {
    logger: infra.logger,
    getMetrics: () => ({ increment: infra.increment }),
  };
});
vi.mock("@/infrastructure/redis/rate-limit-storage", () => ({
  redisRateLimitStorage: {},
}));
vi.mock("@/infrastructure/database/client", () => ({
  prisma: {},
  transactionRunner: {},
}));
vi.mock("@/infrastructure/outbox", () => ({ outbox: {} }));
vi.mock("@/modules/auth", () => ({ authorize: vi.fn() }));

import { infra } from "../../tests/support/capture-factories";
import * as mentorship from "./mentorship";

const actor = { userId: "u1" } as never;

describe("mentorship composition", () => {
  it("logs and counts each outcome by mentorship id", () => {
    const observe = captured.get("createRequestMentorship")!.deps.observe as (
      outcome: string,
      id: string
    ) => void;
    observe("requested", "m1");
    expect(infra.logger.info).toHaveBeenCalledWith("mentorship.requested", {
      metadata: { mentorshipId: "m1" },
    });
    expect(infra.increment).toHaveBeenCalledWith("mentorship_total", {
      outcome: "requested",
    });
  });

  it("decorates mentors and mentorship counterparties with ticks", async () => {
    const counterparty = { id: "c1" };
    captured
      .get("createListMentors")!
      .built.mockResolvedValue({ data: [{ userId: "m1" }] });
    captured
      .get("createListMentorships")!
      .built.mockResolvedValue({ data: [{ counterparty }] });
    await mentorship.listMentors({ actor });
    await mentorship.listMentorships({ actor, role: "mentor" });
    const [mentors, mentorId] = infra.addTicks.mock.calls[0] as unknown as [
      unknown[],
      (row: unknown) => string,
    ];
    expect(mentors.map(mentorId)).toEqual(["m1"]);
    const [items, itemId, target] = infra.addTicks.mock.calls[1] as unknown as [
      unknown[],
      (row: unknown) => string,
      (row: unknown) => unknown,
    ];
    expect(items.map(itemId)).toEqual(["c1"]);
    expect(items.map(target)).toEqual([counterparty]);
  });
});
