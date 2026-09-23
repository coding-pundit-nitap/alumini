import { describe, expect, it, vi } from "vitest";
import { dedupeKeyFor } from "@nitap/jobs";

import { createDeliverNotification } from "./deliver.ts";

function fakeStore(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(async () => ({ id: "notif-1", created: true })),
    recordDelivery: vi.fn(async () => {}),
    hasDelivery: vi.fn(async () => false),
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
      appUrl: "https://alumni.example",
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

  it("stamps the enqueued email with the notification id (N-12 status tracking)", async () => {
    const store = fakeStore({
      insert: vi.fn(async () => ({ id: "notif-1", created: true })),
    });
    const enqueueEmail = vi.fn<(p: unknown, o: unknown) => Promise<void>>(
      async () => {}
    );
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn(), decrement: vi.fn(), get: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      appUrl: "https://alumni.example",
    });

    await deliver({
      eventId: "e1",
      type: "connection.requested",
      category: "ENGAGEMENT",
      recipientId: "u1",
      payload: {},
      emailTo: "u1@nitap.ac.in",
    });

    const [payload] = enqueueEmail.mock.calls[0]!;
    expect((payload as { notificationId: string }).notificationId).toBe(
      "notif-1"
    );
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
      appUrl: "https://alumni.example",
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
      hasDelivery: vi.fn(async () => true),
    });
    const enqueueEmail = vi.fn(async () => {});
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => ({ enabled: true }),
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn(), decrement: vi.fn(), get: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      appUrl: "https://alumni.example",
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

  it("on a duplicate whose email step never completed, queues the email but not a second in-app row", async () => {
    const store = fakeStore({
      insert: vi.fn(async () => ({ id: "notif-1", created: false })),
    });
    const enqueueEmail = vi.fn(async () => {});
    const increment = vi.fn();
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment, decrement: vi.fn(), get: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      appUrl: "https://alumni.example",
    });

    await deliver({
      eventId: "e1",
      type: "connection.requested",
      category: "ENGAGEMENT",
      recipientId: "u1",
      payload: {},
      emailTo: "u1@nitap.ac.in",
    });

    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(store.recordDelivery).toHaveBeenCalledTimes(1);
    expect(store.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "EMAIL", status: "PENDING" })
    );
    expect(increment).not.toHaveBeenCalled();
  });

  it("builds the email action link from the configured app origin", async () => {
    const enqueueEmail = vi.fn<(p: unknown, o: unknown) => Promise<void>>(
      async () => {}
    );
    const deliver = createDeliverNotification({
      store: fakeStore() as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn(), decrement: vi.fn(), get: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      appUrl: "https://alumni.example",
    });

    await deliver({
      eventId: "e1",
      type: "connection.requested",
      category: "ENGAGEMENT",
      recipientId: "u1",
      payload: {},
      emailTo: "u1@nitap.ac.in",
    });

    const [payload] = enqueueEmail.mock.calls[0]!;
    expect(
      (payload as { params: { actionUrl: string } }).params.actionUrl
    ).toMatch(/^https:\/\/alumni\.example\//);
  });

  it("publishes a notificationId-only hint for a newly created row", async () => {
    const publish = vi.fn(async () => {});
    const deliver = createDeliverNotification({
      store: fakeStore() as never,
      getPreference: async () => null,
      enqueueEmail: vi.fn(async () => {}),
      hintPublisher: { publish },
      unreadCounter: { increment: vi.fn(), decrement: vi.fn(), get: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      appUrl: "https://alumni.example",
    });
    await deliver({
      eventId: "e1",
      type: "connection.requested",
      category: "ENGAGEMENT",
      recipientId: "u1",
      payload: {},
    });
    expect(publish).toHaveBeenCalledWith("u1", { notificationId: "notif-1" });
  });
});
