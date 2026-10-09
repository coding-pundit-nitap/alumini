import type { ErrorEvent } from "@sentry/node";
import { afterEach, describe, expect, it } from "vitest";

import {
  captureError,
  closeErrorTracker,
  flushErrorTracker,
  initErrorTracker,
  scrubEvent,
} from "./error-tracker.ts";
import { REDACTED } from "./redact.ts";
import { runWithRequestContext, setRequestUser } from "./request-context.ts";
import { startRecordingErrorTracker } from "./testing.ts";

// The same secrets the log redaction test masks (redact.test.ts): tracker and logs share one rule.
const secrets = {
  password: "hunter2",
  token: "tok-abc",
  apiKey: "key-abc",
  authorization: "Bearer bearer-abc",
  cookie: "session=cookie-abc",
  resetLink: "https://x/reset?token=reset-abc",
  email: "ada@example.test",
};
const leaks = [
  "hunter2",
  "tok-abc",
  "key-abc",
  "bearer-abc",
  "cookie-abc",
  "reset-abc",
  "ada@example.test",
];

afterEach(() => closeErrorTracker());

describe("scrubEvent", () => {
  it("masks secrets wherever request data can land, and keeps only the user id", () => {
    const event: ErrorEvent = {
      type: undefined,
      extra: { input: secrets },
      tags: { token: "tok-abc" },
      contexts: { app: { nested: { password: "hunter2" } } },
      breadcrumbs: [
        { message: "m", data: { authorization: "Bearer bearer-abc" } },
      ],
      user: { id: "u1", email: "ada@example.test", ip_address: "10.0.0.1" },
      request: {
        url: "https://alumni.example/api/v1/x?token=tok-abc",
        query_string: "token=tok-abc",
        cookies: { session: "cookie-abc" },
        headers: { authorization: "Bearer bearer-abc", "x-request-id": "r1" },
        data: { password: "hunter2", title: "ok" },
      },
      exception: {
        values: [
          {
            type: "Error",
            value: "boom",
            mechanism: { type: "generic", data: { apiKey: "key-abc" } },
          },
        ],
      },
    };

    const scrubbed = scrubEvent(event);
    const json = JSON.stringify(scrubbed);

    for (const leak of leaks) expect(json).not.toContain(leak);
    expect(scrubbed.user).toEqual({ id: "u1" });
    expect(scrubbed.request?.url).toBe("https://alumni.example/api/v1/x");
    expect(scrubbed.request?.headers?.["x-request-id"]).toBe("r1");
    expect(
      (scrubbed.request?.data as Record<string, unknown> | undefined)?.password
    ).toBe(REDACTED);
    expect(scrubbed.exception?.values?.[0]?.value).toBe("boom");
  });
});

describe("error tracker", () => {
  it("stays off without a DSN, and capturing is then a no-op", () => {
    expect(
      initErrorTracker({ environment: "test", release: "t", service: "web" })
    ).toBe(false);
    expect(() => captureError(new Error("x"))).not.toThrow();
  });

  it("sends a scrubbed event tagged with the request id, service and user id", async () => {
    const recorder = startRecordingErrorTracker("web");

    runWithRequestContext({ requestId: "req-13b" }, () => {
      setRequestUser("user-1");
      captureError(new Error("boom", { cause: { password: "hunter2" } }), {
        tags: { route: "/api/v1/x" },
        extra: { input: secrets },
      });
    });
    await flushErrorTracker(2_000);

    const [event] = recorder.events();
    expect(event?.tags).toMatchObject({
      request_id: "req-13b",
      service: "web",
      route: "/api/v1/x",
    });
    expect(event?.user).toEqual({ id: "user-1" });
    for (const leak of leaks) expect(recorder.raw()).not.toContain(leak);
  });
});
