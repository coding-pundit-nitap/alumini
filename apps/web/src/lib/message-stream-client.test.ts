import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeToMessageStream } from "./message-stream-client";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
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
});
