"use client";

/**
 * One `EventSource` per browser tab for `/api/v1/messages/stream`, shared and ref-counted across every
 * subscriber (the header bell and any open message thread) instead of each opening its own connection
 * (deferred finding 1: `/messages/[id]` used to hold two concurrent SSE connections for the same user).
 * Opens the connection on the first subscriber (or reopens a dead one), closes it after the last one unsubscribes.
 */

type Listener = (event: MessageEvent) => void;

let source: EventSource | null = null;
const subscriptions = new Set<{ eventName: string; listener: Listener }>();

// (Re)opens when there is no live source: first subscriber, a constructor that threw earlier, or a
// source the browser gave up on (CLOSED — e.g. a non-200 connect is never retried). Every current
// listener moves to the new source so earlier subscribers keep receiving events.
function ensureOpen() {
  if (source && source.readyState !== EventSource.CLOSED) return;
  source?.close();
  try {
    source = new EventSource("/api/v1/messages/stream");
  } catch {
    // EventSource unavailable or the stream can't connect: callers fall back to their own polling
    source = null;
    return;
  }
  for (const { eventName, listener } of subscriptions) {
    source.addEventListener(eventName, listener);
  }
}

export function subscribeToMessageStream(
  eventName: string,
  listener: Listener
): () => void {
  const subscription = { eventName, listener };
  subscriptions.add(subscription);
  ensureOpen();
  source?.addEventListener(eventName, listener); // no-op if ensureOpen just attached it

  return () => {
    if (!subscriptions.delete(subscription)) return;
    source?.removeEventListener(eventName, listener);
    if (subscriptions.size === 0) {
      source?.close();
      source = null;
    }
  };
}
