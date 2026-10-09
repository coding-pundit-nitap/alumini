import { createTransport } from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";

import { closeErrorTracker, initErrorTracker } from "./error-tracker.ts";

/** Keeps envelopes in memory so tests can assert on what would be sent. */
export function startRecordingErrorTracker(service: "web" | "worker" = "web") {
  const sent: string[] = [];
  initErrorTracker({
    dsn: "https://public@tracker.example.test/1",
    environment: "test",
    release: "t",
    service,
    transport: (options) =>
      createTransport(options, async (request) => {
        sent.push(
          typeof request.body === "string"
            ? request.body
            : new TextDecoder().decode(request.body)
        );
        return { statusCode: 200 };
      }),
  });
  return {
    /** Every serialized envelope, for "contains no secret" assertions. */
    raw: () => sent.join("\n"),
    events: () =>
      sent.flatMap((envelope) =>
        envelope
          .split("\n")
          .filter((line) => line.includes('"exception"'))
          .map((line) => JSON.parse(line) as ErrorEvent)
      ),
    stop: () => closeErrorTracker(),
  };
}
