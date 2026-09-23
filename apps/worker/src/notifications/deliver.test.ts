import { describe, expect, it, vi } from "vitest";
import { dedupeKeyFor } from "@nitap/jobs";

import { createDeliverNotification } from "./deliver.ts";

function fakeStore(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(async () => ({ id: "notif-1", created: true })),
    recordDelivery: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("deliverNotification", () => {
  it("writes the in-app row before enqueueing email", async () => {
    const calls: string[] = [];
    const store = fakeStore({
      insert: vi.fn(async () => {
        calls.push("insert");
        return { id: "notif-1", created: true };
      }),
    });
    const enqueueEmail = vi.fn<(p: unknown, o: unknown) => Promise<void>>(
      async () => {
        calls.push("email");
      }
    );
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn(), decrement: vi.fn(), get: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    });

    await deliver({
      eventId: "e1",
      type: "connection.requested",
      category: "ENGAGEMENT",
      recipientId: "u1",
      payload: {},
      emailTo: "u1@nitap.ac.in",
    });

    expect(calls).toEqual(["insert", "email"]);
    expect(enqueueEmail).toHaveBeenCalledWith(expect.anything(), {
      jobId: dedupeKeyFor({
        eventId: "e1",
        recipientId: "u1",
        type: "connection.requested",
      }),
    });
  });

  it("skips email when the recipient disabled it, but still writes in-app", async () => {
    const store = fakeStore();
    const enqueueEmail = vi.fn(async () => {});
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => ({ enabled: false }),
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn(), decrement: vi.fn(), get: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    });

    await deliver({
      eventId: "e1",
      type: "connection.requested",
      category: "ENGAGEMENT",
      recipientId: "u1",
      payload: {},
      emailTo: "u1@nitap.ac.in",
    });

    expect(store.insert).toHaveBeenCalledTimes(1);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("is a no-op on a duplicate dedupeKey (already delivered)", async () => {
    const store = fakeStore({
      insert: vi.fn(async () => ({ id: "notif-1", created: false })),
    });
    const enqueueEmail = vi.fn(async () => {});
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => ({ enabled: true }),
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn(), decrement: vi.fn(), get: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    });

    await deliver({
      eventId: "e1",
      type: "connection.requested",
      category: "ENGAGEMENT",
      recipientId: "u1",
      payload: {},
      emailTo: "u1@nitap.ac.in",
    });

    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});
