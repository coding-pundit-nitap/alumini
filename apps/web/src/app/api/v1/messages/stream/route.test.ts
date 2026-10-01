import { PERMISSIONS } from "@nitap/database/permissions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  can: vi.fn(),
  authorize: vi.fn(),
  subscribeToUser: vi.fn(),
  realtimeAvailable: vi.fn(() => true),
}));
vi.mock("@/modules/auth", () => ({
  getActor: mocks.getActor,
  can: mocks.can,
  authorize: mocks.authorize,
}));
vi.mock("@/infrastructure/realtime/message-hub", () => mocks);
// A real health service, so draining behaves exactly as in production (spec 14 F-4).
const drain = vi.hoisted(() => ({
  current: null as null | { startDraining(): void },
}));
vi.mock("@/infrastructure/health", async () => {
  const { createHealthService } =
    await import("@/infrastructure/health/health-service");
  const health = createHealthService({
    checkPostgres: async () => {},
    checkRedis: async () => {},
  });
  drain.current = health;
  return { health };
});

import { AuthenticationError, AuthorizationError } from "@/lib/errors";

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.realtimeAvailable.mockReturnValue(true);
  mocks.getActor.mockResolvedValue({ userId: "u1" });
  // Full access by default (never for a null actor, like the real can()); individual tests narrow this.
  mocks.can.mockImplementation((actor: unknown) => actor !== null);
  // Mirrors the real authorize(): records the decision, then throws 401/403 or returns the actor.
  mocks.authorize.mockImplementation((actor: unknown, permission: string) => {
    if (actor === null) throw new AuthenticationError();
    if (!mocks.can(actor, permission)) throw new AuthorizationError();
    return actor;
  });
});

describe("GET /api/v1/messages/stream", () => {
  it("is 401 for an unauthenticated caller and opens no subscription", async () => {
    mocks.getActor.mockResolvedValue(null);
    expect(
      (await GET(new Request("https://x.test/api/v1/messages/stream"))).status
    ).toBe(401);
    expect(mocks.authorize).toHaveBeenCalledWith(
      null,
      PERMISSIONS.NOTIFICATION_READ
    );
    expect(mocks.subscribeToUser).not.toHaveBeenCalled();
  });

  it("is 403 for an actor with neither MESSAGE_SEND nor NOTIFICATION_READ, and opens no subscription", async () => {
    mocks.can.mockReturnValue(false);
    expect(
      (await GET(new Request("https://x.test/api/v1/messages/stream"))).status
    ).toBe(403);
    // The denial goes through authorize(), which records it for the authz observer/audit.
    expect(mocks.authorize).toHaveBeenCalledWith(
      { userId: "u1" },
      PERMISSIONS.NOTIFICATION_READ
    );
    expect(mocks.subscribeToUser).not.toHaveBeenCalled();
  });

  it("records the allowed decision on MESSAGE_SEND for an actor who holds it", async () => {
    await GET(new Request("https://x.test/api/v1/messages/stream"));
    expect(mocks.authorize).toHaveBeenCalledWith(
      { userId: "u1" },
      PERMISSIONS.MESSAGE_SEND
    );
  });

  it("is 503 when real-time is not configured, so the client polls instead", async () => {
    mocks.realtimeAvailable.mockReturnValue(false);
    expect(
      (await GET(new Request("https://x.test/api/v1/messages/stream"))).status
    ).toBe(503);
  });

  it("checks permissions, never a role", async () => {
    await GET(new Request("https://x.test/api/v1/messages/stream"));
    expect(mocks.can).toHaveBeenCalledWith(
      { userId: "u1" },
      PERMISSIONS.MESSAGE_SEND
    );
    expect(mocks.can).toHaveBeenCalledWith(
      { userId: "u1" },
      PERMISSIONS.NOTIFICATION_READ
    );
  });

  it("streams a hint as an SSE event and unsubscribes when the client goes away", async () => {
    const unsubscribe = vi.fn();
    let push: (hint: unknown) => void = () => undefined;
    let pushNotification: (hint: unknown) => void = () => undefined;
    mocks.subscribeToUser.mockImplementation(
      (_user, listener, onNotification) => {
        push = listener;
        pushNotification = onNotification;
        return unsubscribe;
      }
    );
    const abort = new AbortController();
    const res = await GET(
      new Request("https://x.test/api/v1/messages/stream", {
        signal: abort.signal,
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(mocks.subscribeToUser).toHaveBeenCalledWith(
      "u1",
      expect.any(Function),
      expect.any(Function)
    );

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain(
      ": connected"
    );
    push({ conversationId: "c1", messageId: "m1" });
    const chunk = decoder.decode((await reader.read()).value);
    expect(chunk).toBe(
      'event: message\ndata: {"conversationId":"c1","messageId":"m1"}\n\n'
    );

    pushNotification({ notificationId: "n1" });
    expect(decoder.decode((await reader.read()).value)).toBe(
      'event: notification\ndata: {"notificationId":"n1"}\n\n'
    );

    abort.abort();
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });

  it("gives an actor with only NOTIFICATION_READ a 200 stream without subscribing its message channel", async () => {
    mocks.can.mockImplementation(
      (_actor: unknown, permission: string) =>
        permission === PERMISSIONS.NOTIFICATION_READ
    );
    let push: ((hint: unknown) => void) | undefined;
    let pushNotification: ((hint: unknown) => void) | undefined;
    mocks.subscribeToUser.mockImplementation(
      (_user, listener, onNotification) => {
        push = listener;
        pushNotification = onNotification;
        return vi.fn();
      }
    );

    const res = await GET(new Request("https://x.test/api/v1/messages/stream"));
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read(); // ": connected"

    // A message hint this actor is not entitled to must never reach the wire, even though the
    // channel is per-user (never another conversation's traffic): not subscribing its channel at
    // all, not just relying on the client to ignore it, is the enforcement point.
    expect(push).toBeUndefined();
    pushNotification!({ notificationId: "n1" });

    const chunk = decoder.decode((await reader.read()).value);
    expect(chunk).toBe(
      'event: notification\ndata: {"notificationId":"n1"}\n\n'
    );
  });

  it("gives an actor with only MESSAGE_SEND a 200 stream without subscribing its notification channel", async () => {
    mocks.can.mockImplementation(
      (_actor: unknown, permission: string) =>
        permission === PERMISSIONS.MESSAGE_SEND
    );
    let push: ((hint: unknown) => void) | undefined;
    let pushNotification: ((hint: unknown) => void) | undefined;
    mocks.subscribeToUser.mockImplementation(
      (_user, listener, onNotification) => {
        push = listener;
        pushNotification = onNotification;
        return vi.fn();
      }
    );

    const res = await GET(new Request("https://x.test/api/v1/messages/stream"));
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read(); // ": connected"

    expect(pushNotification).toBeUndefined();
    push!({ conversationId: "c1", messageId: "m1" });

    const chunk = decoder.decode((await reader.read()).value);
    expect(chunk).toBe(
      'event: message\ndata: {"conversationId":"c1","messageId":"m1"}\n\n'
    );
  });
});

describe("GET /api/v1/messages/stream while the instance drains (spec 14 F-4)", () => {
  it("ends an open stream when draining starts and unsubscribes, then refuses new streams with 503", async () => {
    const unsubscribe = vi.fn();
    mocks.subscribeToUser.mockReturnValue(unsubscribe);
    const response = await GET(
      new Request("https://x.test/api/v1/messages/stream")
    );
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    await reader.read(); // the "connected" preamble

    drain.current!.startDraining();

    await expect(reader.read()).resolves.toMatchObject({ done: true });
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    mocks.subscribeToUser.mockClear();
    const refused = await GET(
      new Request("https://x.test/api/v1/messages/stream")
    );
    expect(refused.status).toBe(503);
    expect(mocks.subscribeToUser).not.toHaveBeenCalled();
  });
});
