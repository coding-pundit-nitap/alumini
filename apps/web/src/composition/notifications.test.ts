import { describe, expect, it, vi } from "vitest";

import type { Captured } from "../../tests/support/capture-factories";

const captured = vi.hoisted(() => new Map<string, Captured>());
const env = vi.hoisted(() => ({
  QUEUE_REDIS_URL: undefined as string | undefined,
}));
const createQueueAdmin = vi.hoisted(() => vi.fn(() => ({ id: "queue" })));
const audit = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock("@/modules/notifications", async (importOriginal) => {
  const { captureFactories } =
    await import("../../tests/support/capture-factories");
  return captureFactories(await importOriginal(), captured);
});
vi.mock("@/infrastructure/observability", async () => {
  const { infra } = await import("../../tests/support/capture-factories");
  return { logger: infra.logger, captureError: infra.captureError };
});
vi.mock("@nitap/queue", () => ({ createQueueAdmin }));
vi.mock("@/config/env", () => ({ env }));
vi.mock("@/infrastructure/audit", () => ({ audit }));
vi.mock("@/infrastructure/database/client", () => ({
  prisma: {},
  transactionRunner: { run: (work: (tx: unknown) => unknown) => work("tx") },
}));
vi.mock("@/infrastructure/redis/client", () => ({ getRedis: vi.fn() }));
vi.mock("@/modules/auth", () => ({ authorize: vi.fn() }));

import { infra } from "../../tests/support/capture-factories";
import "./notifications";

const replay = () => captured.get("createReplayNotifications")!.deps;

describe("notifications composition", () => {
  it("connects to the queue Redis once, and only when it is configured", () => {
    const queueAdmin = replay().queueAdmin as () => unknown;
    expect(() => queueAdmin()).toThrow("QUEUE_REDIS_URL is not set");
    env.QUEUE_REDIS_URL = "redis://queue:6379";
    expect(queueAdmin()).toEqual({ id: "queue" });
    queueAdmin();
    expect(createQueueAdmin).toHaveBeenCalledTimes(1);
    expect(createQueueAdmin).toHaveBeenCalledWith({
      url: "redis://queue:6379",
    });
  });

  it("audits a replay in its own transaction, and reports a failed audit", async () => {
    await (replay().audit as (entry: unknown) => Promise<unknown>)({
      action: "x",
    });
    expect(audit.record).toHaveBeenCalledWith("tx", { action: "x" });

    const error = new Error("down");
    (replay().onAuditFailed as (e: unknown, m: unknown) => void)(error, {
      n: 1,
    });
    expect(infra.logger.error).toHaveBeenCalledWith(
      "notification.replay.audit_failed",
      { error, metadata: { n: 1 } }
    );
    expect(infra.captureError).toHaveBeenCalledWith(error, {
      tags: { action: "notification.replay" },
      extra: { n: 1 },
    });
  });

  it("dates failed deliveries by the current clock", () => {
    const now = captured.get("createListFailedDeliveries")!.deps
      .now as () => Date;
    expect(now()).toBeInstanceOf(Date);
  });
});
