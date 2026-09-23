import { PERMISSIONS } from "@nitap/database/permissions";

import {
  realtimeAvailable,
  subscribeToUser,
} from "@/infrastructure/realtime/message-hub";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { authorize, getActor } from "@/modules/auth";

const HEARTBEAT_MS = 25_000;

/**
 * GET /api/v1/messages/stream — Server-Sent Events. Carries ids-only message and notification hints for the caller's own channels; the
 * browser refetches through the authorized list endpoints, so nothing here can leak a message. Without Redis
 * the answer is 503 and the client falls back to polling (spec M-3, M-12).
 */
export const GET = routeHandler(async (request) => {
  const caller = authorize(await getActor(), PERMISSIONS.MESSAGE_SEND);
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
        (hint) => write(`event: message\ndata: ${JSON.stringify(hint)}\n\n`),
        (hint) =>
          write(`event: notification\ndata: ${JSON.stringify(hint)}\n\n`)
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
