import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger, flushErrorTracker } from "@nitap/observability";
import { startRecordingErrorTracker } from "@nitap/observability/testing";

import { logger } from "@/infrastructure/observability";
import { ValidationError } from "@/lib/errors";

import { routeHandler } from "./route-handler";

/**
 * Over the real wrapper: the request id reaches the response
 * header, the error body, the log line and the tracker event; none of the request's secrets reach the
 * log line or the tracker.
 */
const secrets = ["hunter2", "session=cookie-abc", "bearer-abc", "query-abc"];

function capture() {
  const lines: string[] = [];
  const real = createLogger({
    level: "debug",
    service: "web",
    env: "test",
    version: "t",
    write: (_stream, line) => lines.push(line),
  });
  for (const level of ["info", "warn", "error"] as const)
    vi.spyOn(logger, level).mockImplementation(real[level]);
  return { lines, tracker: startRecordingErrorTracker("web") };
}

const secretRequest = () =>
  new Request("http://localhost/api/v1/things/42?token=query-abc", {
    method: "POST",
    headers: {
      "x-request-id": "req-13b-web",
      authorization: "Bearer bearer-abc",
      cookie: "session=cookie-abc",
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: "ada@example.test", password: "hunter2" }),
  });

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await stop?.();
});

describe("routeHandler request ids and redaction over a real request", () => {
  it("carries the id everywhere and leaks no secret into logs or the tracker on a 500", async () => {
    const { lines, tracker } = capture();
    stop = tracker.stop;
    const handler = routeHandler(async (request) => {
      const body = await request.json();
      // A library error that drags the request along with it.
      throw Object.assign(new Error("database unavailable"), {
        request: {
          headers: Object.fromEntries(request.headers),
          input: body,
        },
      });
    });

    const response = await handler(secretRequest());
    await flushErrorTracker(2_000);

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe("req-13b-web");
    expect(await response.json()).toMatchObject({ requestId: "req-13b-web" });

    const logged = lines.map((line) => JSON.parse(line));
    expect(logged).toEqual([
      expect.objectContaining({
        event: "http.request.failed",
        level: "error",
        request_id: "req-13b-web",
      }),
    ]);
    const [event] = tracker.events();
    expect(event?.tags).toMatchObject({
      request_id: "req-13b-web",
      route: "/api/v1/things/:id",
      service: "web",
    });
    for (const secret of [...secrets, "ada@example.test"]) {
      expect(lines.join("\n")).not.toContain(secret);
      expect(tracker.raw()).not.toContain(secret);
    }
  });

  it("does not send a client error (4xx) to the tracker", async () => {
    const { lines, tracker } = capture();
    stop = tracker.stop;

    const response = await routeHandler(async () => {
      throw new ValidationError();
    })(secretRequest());
    await flushErrorTracker(2_000);

    expect(response.status).toBe(400);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      request_id: "req-13b-web",
    });
    expect(tracker.events()).toEqual([]);
  });
});
