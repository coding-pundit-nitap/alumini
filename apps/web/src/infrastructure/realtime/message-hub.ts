import Redis from "ioredis";

import {
  messageHintChannel,
  notificationHintChannel,
  type MessageHint,
  type NotificationHint,
} from "@nitap/jobs";

import { env } from "@/config/env";
import { logger } from "@/infrastructure/observability";

type Listener = (hint: never) => void;
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
    const set = state.listeners.get(channel);
    if (!set) return;
    let hint: unknown;
    try {
      hint = JSON.parse(raw);
    } catch {
      return;
    }
    for (const listener of set) listener(hint as never);
  });
  state.subscriber = client;
  return client;
}

/** Joins one channel's listener set, subscribing with the first listener; returns the leave function. */
function join(client: Redis, channel: string, listener: Listener) {
  const state = hub();
  let set = state.listeners.get(channel);
  if (!set) {
    set = new Set();
    state.listeners.set(channel, set);
    void client.subscribe(channel).catch((error: Error) =>
      logger.warn("realtime.subscribe.failed", {
        metadata: { message: error.message },
      })
    );
  }
  set.add(listener);
  return () => {
    const current = state.listeners.get(channel);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      state.listeners.delete(channel);
      void client.unsubscribe(channel).catch(() => undefined);
    }
  };
}

/**
 * Listens for one member's hints on both channels: `msg:user:` (message hints) and `notif:user:` (notification
 * hints, spec N-8). Subscribes to a channel with its first listener and leaves it with the last. ponytail: two
 * channels per connected member; a single pattern subscription is simpler but every process then receives every
 * member's traffic, so switch only if per-channel churn shows up in metrics.
 */
export function subscribeToUser(
  userId: string,
  onMessage: (hint: MessageHint) => void,
  onNotification: (hint: NotificationHint) => void = () => undefined
): () => void {
  const client = subscriber();
  const offs = [
    join(client, messageHintChannel(userId), onMessage),
    join(client, notificationHintChannel(userId), onNotification),
  ];
  return () => offs.forEach((off) => off());
}
