import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/auth";

import { encodeCursor } from "../domain/cursor";
import { createListFailedDeliveries } from "./list-failed-deliveries";
import type { EmailDeliveryRow } from "./notification-store";

const actor: Actor = {
  userId: "u",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};
const NOW = new Date("2026-09-24T12:00:00Z");
const row = (
  n: number,
  over: Partial<EmailDeliveryRow> = {}
): EmailDeliveryRow => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  notificationId: `00000000-0000-4000-8000-00000000010${n}`,
  type: "job.published",
  recipient: { id: "r1", email: "r1@example.test" },
  attempts: 3,
  lastError: "x".repeat(500),
  updatedAt: new Date(NOW.getTime() - n * 60_000),
  ...over,
});

describe("listFailedDeliveries", () => {
  it("authorizes concealed, lists FAILED keyset-paged and PENDING older than an hour", async () => {
    const listEmailDeliveries = vi.fn(async ({ status }: { status: string }) =>
      status === "FAILED" ? [row(1), row(2)] : [row(3, { lastError: null })]
    );
    const authorize = vi.fn((a: Actor | null) => a!);
    const list = createListFailedDeliveries({
      store: { listEmailDeliveries },
      authorize,
      now: () => NOW,
    });
    const page = await list({ actor });

    expect(authorize).toHaveBeenCalledWith(actor, "notification.replay", {
      concealed: true,
    });
    expect(listEmailDeliveries).toHaveBeenCalledWith({
      status: "FAILED",
      after: undefined,
      take: 51,
    });
    expect(listEmailDeliveries).toHaveBeenCalledWith({
      status: "PENDING",
      updatedBefore: new Date(NOW.getTime() - 3_600_000),
      take: 50,
    });
    expect(page.failed).toHaveLength(2);
    expect(page.failed[0]!.lastError).toHaveLength(200);
    expect(page.stuck[0]!.lastError).toBeNull();
    expect(page.nextCursor).toBeNull();
  });

  it("decodes its own cursor and rejects a foreign one", async () => {
    const listEmailDeliveries = vi.fn(async () => []);
    const list = createListFailedDeliveries({
      store: { listEmailDeliveries },
      authorize: (a) => a!,
      now: () => NOW,
    });
    const at = new Date("2026-09-24T11:00:00Z");
    await list({ actor, cursor: encodeCursor(at, row(1).id) });
    expect(listEmailDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED",
        after: { updatedAt: at, id: row(1).id },
      })
    );
    await expect(list({ actor, cursor: "@@" })).rejects.toMatchObject({
      code: "INVALID_CURSOR",
    });
  });
});
