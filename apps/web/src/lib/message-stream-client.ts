"use client";

/**
 * One `EventSource` per browser tab for `/api/v1/messages/stream`, shared and ref-counted across every
 * subscriber (the header bell and any open message thread) instead of each opening its own connection
 * (deferred finding 1: `/messages/[id]` used to hold two concurrent SSE connections for the same user).
 * Opens the connection on the first subscriber, closes it after the last one unsubscribes.
 */

type Listener = (event: MessageEvent) => void;

let source: EventSource | null = null;
let refCount = 0;

export function subscribeToMessageStream(
  eventName: string,
  listener: Listener
): () => void {
  if (refCount === 0) {
    try {
      source = new EventSource("/api/v1/messages/stream");
    } catch {
      // EventSource unavailable or the stream can't connect: callers fall back to their own polling
      source = null;
    }
  }
  refCount += 1;
  source?.addEventListener(eventName, listener);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    source?.removeEventListener(eventName, listener);
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      source?.close();
      source = null;
    }
  };
}
