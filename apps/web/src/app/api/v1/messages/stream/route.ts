import { PERMISSIONS } from "@nitap/database/permissions";

import {
  realtimeAvailable,
  subscribeToUser,
} from "@/infrastructure/realtime/message-hub";
import { health } from "@/infrastructure/health";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { authorize, can, getActor } from "@/modules/auth";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events carrying id-only message and notification hints; the
 * client refetches through the authorized endpoints. Each hint kind needs its
 * matching permission. 503 without Redis.
 */
export const GET = routeHandler(async (request) => {
  const actor = await getActor();
  const canReceiveMessages = can(actor, PERMISSIONS.MESSAGE_SEND);
  // authorize() records the decision: on MESSAGE_SEND when held, else on NOTIFICATION_READ, which
  // throws 401/403 when the caller has neither.
  const caller = authorize(
    actor,
    canReceiveMessages
      ? PERMISSIONS.MESSAGE_SEND
      : PERMISSIONS.NOTIFICATION_READ
  );
  const canReceiveNotifications = can(caller, PERMISSIONS.NOTIFICATION_READ);
  // A draining instance takes no new streams: the client falls back to polling and reconnects to the live one.
  if (!realtimeAvailable() || health.isDraining())
    return new Response(null, { status: 503 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // the stream is already closed
        }
      };
      write("retry: 5000\n: connected\n\n");
      const unsubscribe = subscribeToUser(
        caller.userId,
        canReceiveMessages
          ? (hint) => write(`event: message\ndata: ${JSON.stringify(hint)}\n\n`)
          : undefined,
        canReceiveNotifications
          ? (hint) =>
              write(`event: notification\ndata: ${JSON.stringify(hint)}\n\n`)
          : undefined
      );
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      let stopDrainWatch = () => {};
      const end = () => {
        clearInterval(heartbeat);
        unsubscribe();
        stopDrainWatch();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", end, { once: true });
      // An open stream never ends by itself, so it would hold a draining instance's shutdown open until the
      // grace period kills it. Ending it makes the browser reconnect (retry: 5000) elsewhere.
      stopDrainWatch = health.onDrain(end);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
