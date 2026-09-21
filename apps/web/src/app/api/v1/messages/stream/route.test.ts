import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  authorize: vi.fn(),
  subscribeToUser: vi.fn(),
  realtimeAvailable: vi.fn(() => true),
}));
vi.mock("@/modules/auth", () => ({
  getActor: mocks.getActor,
  authorize: mocks.authorize,
}));
vi.mock("@/infrastructure/realtime/message-hub", () => mocks);

import { AuthenticationError } from "@/lib/errors";

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.realtimeAvailable.mockReturnValue(true);
  mocks.getActor.mockResolvedValue({ userId: "u1" });
  mocks.authorize.mockImplementation((actor) => actor);
});

describe("GET /api/v1/messages/stream", () => {
  it("is 401 for an unauthenticated caller and opens no subscription", async () => {
    mocks.authorize.mockImplementation(() => {
      throw new AuthenticationError();
    });
    expect(
      (await GET(new Request("https://x.test/api/v1/messages/stream"))).status
    ).toBe(401);
    expect(mocks.subscribeToUser).not.toHaveBeenCalled();
  });

  it("is 503 when real-time is not configured, so the client polls instead", async () => {
    mocks.realtimeAvailable.mockReturnValue(false);
    expect(
      (await GET(new Request("https://x.test/api/v1/messages/stream"))).status
    ).toBe(503);
  });

  it("streams a hint as an SSE event and unsubscribes when the client goes away", async () => {
    const unsubscribe = vi.fn();
    let push: (hint: unknown) => void = () => undefined;
    mocks.subscribeToUser.mockImplementation((_user, listener) => {
      push = listener;
      return unsubscribe;
    });
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

    abort.abort();
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });
});
