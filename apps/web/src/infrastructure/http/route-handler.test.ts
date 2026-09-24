import { describe, it, expect, vi, afterEach } from "vitest";
import {
  logger,
  getRequestContext,
  setMetrics,
  type Metrics,
} from "@/infrastructure/observability";
import { noopMetrics } from "@nitap/observability";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { routeHandler } from "./route-handler";

const request = (
  headers: HeadersInit = {},
  url = "http://localhost/x?token=secret"
) => new Request(url, { headers });

afterEach(() => setMetrics(noopMetrics));

describe("routeHandler", () => {
  it("passes the response through and echoes X-Request-Id", async () => {
    const handler = routeHandler(async () => Response.json({ data: 1 }));
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: 1 });
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses a well-formed incoming request id and exposes it in context", async () => {
    let inside: string | undefined;
    const handler = routeHandler(async () => {
      inside = getRequestContext()?.requestId;
      return new Response(null, { status: 204 });
    });
    const response = await handler(
      request({ "x-request-id": "abcd-1234-efgh" })
    );
    expect(inside).toBe("abcd-1234-efgh");
    expect(response.headers.get("x-request-id")).toBe("abcd-1234-efgh");
  });

  it("replaces a malformed incoming request id", async () => {
    const handler = routeHandler(async () => new Response(null));
    const response = await handler(
      request({ "x-request-id": 'bad id "injection"' })
    );
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("maps an AppError to the error envelope with the request id", async () => {
    const handler = routeHandler(async () => {
      throw new NotFoundError();
    });
    const response = await handler(
      request({ "x-request-id": "abcd-1234-efgh" })
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
      requestId: "abcd-1234-efgh",
    });
  });

  it("returns 500 with a generic body for unknown errors and never leaks them", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const handler = routeHandler(async () => {
      throw new Error('relation "user" does not exist');
    });
    const response = await handler(request());
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).toContain("INTERNAL_ERROR");
    expect(text).not.toContain("relation");
  });

  it("logs once, at the level of the error class, without the query string", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});

    await routeHandler(async () => {
      throw new ValidationError();
    })(request());
    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(info.mock.calls[0])).not.toContain("secret");
    expect(info.mock.calls[0]?.[1]?.metadata).toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
      path: "/x",
    });

    await routeHandler(async () => {
      throw new AuthorizationError();
    })(request());
    expect(warn).toHaveBeenCalledTimes(1);

    await routeHandler(async () => {
      throw new Error("boom");
    })(request());
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[1]?.error).toBeInstanceOf(Error);
  });

  it("does not log a successful request above debug", async () => {
    const info = vi.spyOn(logger, "info");
    await routeHandler(async () => new Response(null))(request());
    expect(info).not.toHaveBeenCalled();
  });

  it("counts requests by method and status", async () => {
    const increment = vi.fn();
    setMetrics({ ...noopMetrics, increment } satisfies Metrics);
    await routeHandler(async () => new Response(null, { status: 201 }))(
      request()
    );
    expect(increment).toHaveBeenCalledWith("http_requests_total", {
      method: "GET",
      status: 201,
      route: "/x",
      status_class: "2xx",
    });
  });
});
