import { PERMISSIONS } from "@nitap/database/permissions";

import {
  realtimeAvailable,
  subscribeToUser,
} from "@/infrastructure/realtime/message-hub";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { authorize, can, getActor } from "@/modules/auth";

const HEARTBEAT_MS = 25_000;

/**
 * GET /api/v1/messages/stream — Server-Sent Events. Carries ids-only message and notification hints for the caller's own channels; the
 * browser refetches through the authorized list endpoints, so nothing here can leak a message. Without Redis
 * the answer is 503 and the client falls back to polling (spec M-3, M-12).
 *
 * A caller needs MESSAGE_SEND, NOTIFICATION_READ, or both — permissions, never a role — to open the
 * connection at all (401/403 otherwise); each hint kind is then only ever written to the wire for a
 * caller who holds the matching permission, so an actor with only NOTIFICATION_READ gets notification
 * hints and no message traffic, and vice versa.
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
  if (!realtimeAvailable()) return new Response(null, { status: 503 });

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
          : () => undefined,
        canReceiveNotifications
          ? (hint) =>
              write(`event: notification\ndata: ${JSON.stringify(hint)}\n\n`)
          : () => undefined
      );
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      request.signal.addEventListener(
        "abort",
        () => {
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // already closed
          }
        },
        { once: true }
      );
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
