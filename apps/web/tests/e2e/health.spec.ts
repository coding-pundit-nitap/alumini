import { test, expect } from "./support/test";

test.describe("Health endpoints", () => {
  test("/health/live reports the process alive, uncacheable, with a request id", async ({
    request,
  }) => {
    const response = await request.get("/health/live");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("/health/ready checks PostgreSQL and reports Redis without failing on it", async ({
    request,
  }) => {
    // A production build shows `checks` only to the monitoring token (reliability §4.1).
    const token = process.env.HEALTH_CHECK_TOKEN;
    const response = await request.get("/health/ready", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.checks.postgres).toBe("ok");
    expect(["ok", "degraded"]).toContain(body.checks.redis);
  });

  test("/health/startup answers like ready", async ({ request }) => {
    const response = await request.get("/health/startup");
    expect(response.status()).toBe(200);
    expect((await response.json()).status).toBe("ok");
  });

  test("reuses a well-formed request id and replaces a malformed one", async ({
    request,
  }) => {
    const reused = await request.get("/health/live", {
      headers: { "x-request-id": "e2e-request-1234" },
    });
    expect(reused.headers()["x-request-id"]).toBe("e2e-request-1234");

    const replaced = await request.get("/health/live", {
      headers: { "x-request-id": "not valid!" },
    });
    expect(replaced.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
