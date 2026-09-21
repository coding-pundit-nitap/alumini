import Redis from "ioredis";

import {
  MESSAGE_HINT_PREFIX,
  messageHintChannel,
  type MessageHint,
} from "@nitap/jobs";

import { env } from "@/config/env";
import { logger } from "@/infrastructure/observability";

type Listener = (hint: MessageHint) => void;
type Hub = { subscriber: Redis | null; listeners: Map<string, Set<Listener>> };

// One subscriber connection per process (Redis subscriber mode owns the connection), surviving dev HMR.
const globalForHub = globalThis as unknown as { messageHub?: Hub };
const hub = (): Hub =>
  (globalForHub.messageHub ??= { subscriber: null, listeners: new Map() });

export const realtimeAvailable = () => Boolean(env.REDIS_URL);

function subscriber(): Redis {
  const state = hub();
  if (state.subscriber) return state.subscriber;
  const client = new Redis(env.REDIS_URL as string);
  client.on("error", (error: Error) =>
    logger.warn("realtime.redis.error", {
      metadata: { message: error.message },
    })
  );
  client.on("message", (channel: string, raw: string) => {
    const set = state.listeners.get(channel.slice(MESSAGE_HINT_PREFIX.length));
    if (!set) return;
    let hint: MessageHint;
    try {
      hint = JSON.parse(raw) as MessageHint;
    } catch {
      return;
    }
    for (const listener of set) listener(hint);
  });
  state.subscriber = client;
  return client;
}

/**
 * Listens for one member's hints. Subscribes to their Redis channel with the first listener and leaves it with
 * the last. ponytail: one channel per connected member; a single pattern subscription is simpler but every
 * process then receives every member's traffic, so switch only if per-channel churn shows up in metrics.
 */
export function subscribeToUser(
  userId: string,
  listener: Listener
): () => void {
  const state = hub();
  const client = subscriber();
  let set = state.listeners.get(userId);
  if (!set) {
    set = new Set();
    state.listeners.set(userId, set);
    void client.subscribe(messageHintChannel(userId)).catch((error: Error) =>
      logger.warn("realtime.subscribe.failed", {
        metadata: { message: error.message },
      })
    );
  }
  set.add(listener);
  return () => {
    const current = state.listeners.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      state.listeners.delete(userId);
      void client
        .unsubscribe(messageHintChannel(userId))
        .catch(() => undefined);
    }
  };
}
