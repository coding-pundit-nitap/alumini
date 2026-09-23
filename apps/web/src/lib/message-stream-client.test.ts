import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeToMessageStream } from "./message-stream-client";

class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  close = vi.fn();
  listeners = new Map<string, Set<(event: unknown) => void>>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, listener: (event: unknown) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }
  removeEventListener(name: string, listener: (event: unknown) => void) {
    this.listeners.get(name)?.delete(listener);
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subscribeToMessageStream", () => {
  it("shares one EventSource across two subscribers and closes it only after both unsubscribe", () => {
    const unsubA = subscribeToMessageStream("message", () => undefined);
    const unsubB = subscribeToMessageStream("notification", () => undefined);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.url).toBe("/api/v1/messages/stream");

    unsubA();
    expect(FakeEventSource.instances[0]!.close).not.toHaveBeenCalled();

    unsubB();
    expect(FakeEventSource.instances[0]!.close).toHaveBeenCalledTimes(1);
  });

  it("opens a fresh connection for a subscriber that arrives after the shared one has closed", () => {
    subscribeToMessageStream("message", () => undefined)();
    const unsub = subscribeToMessageStream("message", () => undefined);

    expect(FakeEventSource.instances).toHaveLength(2);
    unsub();
  });

  it("delivers events only to listeners subscribed to that event name", () => {
    const messageListener = vi.fn();
    const notificationListener = vi.fn();
    const unsubA = subscribeToMessageStream("message", messageListener);
    const unsubB = subscribeToMessageStream(
      "notification",
      notificationListener
    );

    const [instance] = FakeEventSource.instances;
    const event = { data: "{}" };
    instance!.listeners.get("message")!.forEach((l) => l(event));

    expect(messageListener).toHaveBeenCalledWith(event);
    expect(notificationListener).not.toHaveBeenCalled();
    unsubA();
    unsubB();
  });

  it("reopens a CLOSED shared source for a new subscriber and keeps delivering to existing listeners", () => {
    const bellListener = vi.fn();
    const unsubBell = subscribeToMessageStream("notification", bellListener);
    const [dead] = FakeEventSource.instances;
    dead!.readyState = FakeEventSource.CLOSED;

    const threadListener = vi.fn();
    const unsubThread = subscribeToMessageStream("message", threadListener);

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(dead!.close).toHaveBeenCalled();
    const fresh = FakeEventSource.instances[1]!;
    const event = { data: "{}" };
    fresh.listeners.get("notification")!.forEach((l) => l(event));
    fresh.listeners.get("message")!.forEach((l) => l(event));
    expect(bellListener).toHaveBeenCalledWith(event);
    expect(threadListener).toHaveBeenCalledWith(event);

    unsubBell();
    unsubThread();
    expect(fresh.close).toHaveBeenCalledTimes(1);
  });

  it("retries opening for a new subscriber when the constructor threw for an earlier one", () => {
    let fail = true;
    class FlakyEventSource extends FakeEventSource {
      constructor(url: string) {
        if (fail) throw new Error("unavailable");
        super(url);
      }
    }
    vi.stubGlobal("EventSource", FlakyEventSource);

    const bellListener = vi.fn();
    const unsubBell = subscribeToMessageStream("notification", bellListener);
    expect(FakeEventSource.instances).toHaveLength(0);

    fail = false;
    const unsubThread = subscribeToMessageStream("message", () => undefined);

    expect(FakeEventSource.instances).toHaveLength(1);
    const event = { data: "{}" };
    FakeEventSource.instances[0]!.listeners.get("notification")!.forEach((l) =>
      l(event)
    );
    expect(bellListener).toHaveBeenCalledWith(event);
    unsubBell();
    unsubThread();
  });
});
