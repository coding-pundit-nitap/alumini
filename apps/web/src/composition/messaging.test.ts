import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Captured } from "../../tests/support/capture-factories";

const captured = vi.hoisted(() => new Map<string, Captured>());
const redis = vi.hoisted(() => ({ del: vi.fn() }));

vi.mock("@/modules/messaging", async (importOriginal) => {
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
vi.mock("@/infrastructure/redis/client", () => ({
  getRedis: async () => redis,
}));
vi.mock("@/infrastructure/redis/rate-limit-storage", () => ({
  redisRateLimitStorage: {},
}));
vi.mock("@/infrastructure/audit", () => ({ audit: {} }));
vi.mock("@/infrastructure/database/client", () => ({
  prisma: {},
  transactionRunner: {},
}));
vi.mock("@/infrastructure/outbox", () => ({ outbox: {} }));
vi.mock("@/modules/auth", () => ({ authorize: vi.fn() }));

import { infra } from "../../tests/support/capture-factories";
import * as messaging from "./messaging";

const deps = (name: string) => captured.get(name)!.deps;
const actor = { userId: "u1" } as never;

beforeEach(() => {
  infra.addTicks.mockClear();
  infra.logger.info.mockClear();
  infra.logger.warn.mockClear();
  infra.increment.mockClear();
});

describe("messaging composition", () => {
  it("logs and counts each outcome by id only", () => {
    const observe = deps("createSendMessage").observe as (
      outcome: string,
      id: string
    ) => void;
    observe("sent", "m1");
    expect(infra.logger.info).toHaveBeenCalledWith("messaging.sent", {
      metadata: { id: "m1" },
    });
    expect(infra.increment).toHaveBeenCalledWith("messaging_total", {
      outcome: "sent",
    });
  });

  it("clears the reader's email debounce on read, and only warns when Redis fails", async () => {
    const onRead = deps("createMarkRead").onRead as (
      userId: string,
      conversationId: string
    ) => Promise<void>;
    await onRead("u1", "c1");
    expect(redis.del).toHaveBeenCalledWith(expect.stringContaining("c1"));
    redis.del.mockRejectedValueOnce(new Error("down"));
    await onRead("u1", "c1");
    expect(infra.logger.warn).toHaveBeenCalledWith(
      "messaging.debounce_clear_failed",
      { metadata: { message: "down" } }
    );
  });

  it("decorates inbox and conversation participants with ticks", async () => {
    const person = { id: "p1", fullName: "P" };
    captured
      .get("createListConversations")!
      .built.mockResolvedValue({ data: [{ participants: [person] }] });
    captured
      .get("createGetConversation")!
      .built.mockResolvedValue({ participants: [person] });
    await messaging.listConversations({ actor });
    await messaging.getConversation({ actor, conversationId: "c1" });
    for (const [rows, idOf] of infra.addTicks.mock.calls as unknown as [
      unknown[],
      (row: unknown) => string,
    ][]) {
      expect(rows.map(idOf)).toEqual(["p1"]);
    }
    expect(infra.addTicks).toHaveBeenCalledTimes(2);
  });
});
