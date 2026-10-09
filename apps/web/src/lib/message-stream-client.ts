"use client";

/**
 * One ref-counted `EventSource` per tab, shared by every subscriber. Opens on
 * the first subscriber and closes after the last.
 */

type Listener = (event: MessageEvent) => void;

let source: EventSource | null = null;
const subscriptions = new Set<{ eventName: string; listener: Listener }>();

// Reopens when there is no live source, including one the browser gave up on (CLOSED). Existing
// listeners move to the new source.
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
