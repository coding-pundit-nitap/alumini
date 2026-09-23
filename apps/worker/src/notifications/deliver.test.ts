import { describe, expect, it, vi } from "vitest";
import { dedupeKeyFor } from "@nitap/jobs";

import { createDeliverNotification } from "./deliver.ts";

function fakeStore(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(async () => ({ id: "notif-1", created: true })),
    recordDelivery: vi.fn(async () => {}),
    emailDeliveryStatus: vi.fn(async () => null),
    ensureEmailPending: vi.fn(async () => {}),
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
      unreadCounter: { increment: vi.fn() },
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

  it("records the EMAIL row PENDING before enqueueing, not after (closes the markSent-before-insert race)", async () => {
    const calls: string[] = [];
    const store = fakeStore({
      ensureEmailPending: vi.fn(async () => {
        calls.push("ensurePending");
      }),
    });
    const enqueueEmail = vi.fn<(p: unknown, o: unknown) => Promise<void>>(
      async () => {
        calls.push("enqueue");
      }
    );
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn() },
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

    expect(calls).toEqual(["ensurePending", "enqueue"]);
  });

  it("propagates an enqueue failure after the PENDING row is recorded, so the job retries", async () => {
    const store = fakeStore();
    const failure = new Error("queue unreachable");
    const enqueueEmail = vi.fn(async () => Promise.reject(failure));
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      appUrl: "https://alumni.example",
    });

    await expect(
      deliver({
        eventId: "e1",
        type: "connection.requested",
        category: "ENGAGEMENT",
        recipientId: "u1",
        payload: {},
        emailTo: "u1@nitap.ac.in",
      })
    ).rejects.toBe(failure);

    expect(store.ensureEmailPending).toHaveBeenCalledWith("notif-1");
  });

  it("a redelivery with the EMAIL row still PENDING re-enqueues (idempotently) rather than skipping", async () => {
    const store = fakeStore({
      insert: vi.fn(async () => ({ id: "notif-1", created: false })),
      emailDeliveryStatus: vi.fn(async () => "PENDING"),
    });
    const enqueueEmail = vi.fn(async () => {});
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn() },
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

    expect(store.ensureEmailPending).toHaveBeenCalledWith("notif-1");
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it("a redelivery with the EMAIL row already SENT does nothing", async () => {
    const store = fakeStore({
      insert: vi.fn(async () => ({ id: "notif-1", created: false })),
      emailDeliveryStatus: vi.fn(async () => "SENT"),
    });
    const enqueueEmail = vi.fn(async () => {});
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn() },
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

    expect(store.ensureEmailPending).not.toHaveBeenCalled();
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("a redelivery with the EMAIL row already FAILED does nothing", async () => {
    const store = fakeStore({
      insert: vi.fn(async () => ({ id: "notif-1", created: false })),
      emailDeliveryStatus: vi.fn(async () => "FAILED"),
    });
    const enqueueEmail = vi.fn(async () => {});
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn() },
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

    expect(store.ensureEmailPending).not.toHaveBeenCalled();
    expect(enqueueEmail).not.toHaveBeenCalled();
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
      unreadCounter: { increment: vi.fn() },
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
      unreadCounter: { increment: vi.fn() },
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
      emailDeliveryStatus: vi.fn(async () => "SENT"),
    });
    const enqueueEmail = vi.fn(async () => {});
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => ({ enabled: true }),
      enqueueEmail,
      hintPublisher: null,
      unreadCounter: { increment: vi.fn() },
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
      unreadCounter: { increment },
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
    expect(store.ensureEmailPending).toHaveBeenCalledWith("notif-1");
    expect(store.recordDelivery).not.toHaveBeenCalled();
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
      unreadCounter: { increment: vi.fn() },
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
      unreadCounter: { increment: vi.fn() },
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

  it("a cache Redis outage (unread bump and hint both reject) still records PENDING and enqueues the email (N-9)", async () => {
    const store = fakeStore();
    const enqueueEmail = vi.fn(async () => {});
    const warn = vi.fn();
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail,
      hintPublisher: { publish: async () => Promise.reject(new Error("down")) },
      unreadCounter: {
        increment: async () => Promise.reject(new Error("down")),
      },
      logger: { info: vi.fn(), warn, error: vi.fn() } as never,
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

    expect(store.ensureEmailPending).toHaveBeenCalledWith("notif-1");
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it("a debounced duplicate (caller-supplied dedupeKey) bumps the existing row; a read row becomes unread again (N-7)", async () => {
    const bump = vi.fn(async () => ({ wasRead: true }));
    const store = fakeStore({
      insert: vi.fn(async () => ({ id: "notif-1", created: false })),
      bump,
    });
    const increment = vi.fn(async () => {});
    const publish = vi.fn(async () => {});
    const deliver = createDeliverNotification({
      store: store as never,
      getPreference: async () => null,
      enqueueEmail: vi.fn(async () => {}),
      hintPublisher: { publish },
      unreadCounter: { increment },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      appUrl: "https://alumni.example",
    });
    const input = {
      eventId: "e2",
      type: "message.sent",
      category: "ENGAGEMENT" as const,
      recipientId: "u1",
      payload: {},
      dedupeKey: "window-key",
    };

    await deliver(input);
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: "window-key" })
    );
    expect(bump).toHaveBeenCalledWith("notif-1");
    expect(increment).toHaveBeenCalledWith("u1");
    expect(publish).toHaveBeenCalledWith("u1", { notificationId: "notif-1" });

    bump.mockResolvedValueOnce({ wasRead: false });
    increment.mockClear();
    await deliver(input);
    expect(increment).not.toHaveBeenCalled(); // still unread: already counted
  });
});
