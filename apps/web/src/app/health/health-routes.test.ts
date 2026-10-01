import { describe, it, expect, vi, beforeEach } from "vitest";

const ready = vi.fn();
const detailsVisible = vi.fn();
const startDraining = vi.fn();

vi.mock("@/infrastructure/health", () => ({
  health: {
    live: () => ({ status: "ok" }),
    ready: () => ready(),
    isDraining: () => false,
    startDraining: () => startDraining(),
  },
  healthDetailsVisible: () => detailsVisible(),
}));

import { POST as drain } from "./drain/route";
import { GET as live } from "./live/route";
import { GET as readyRoute } from "./ready/route";
import { GET as startup } from "./startup/route";

const request = () => new Request("http://localhost/health/x");
const okResult = {
  ready: true,
  status: "ok",
  checks: { postgres: "ok", redis: "degraded" },
} as const;

beforeEach(() => {
  ready.mockReset();
  detailsVisible.mockReset();
  startDraining.mockReset();
});

describe("POST /health/drain (spec 14 RD-4)", () => {
  it("starts draining for a privileged caller and answers 202", async () => {
    detailsVisible.mockReturnValue(true);
    const response = await drain(
      new Request("http://localhost/health/drain", { method: "POST" })
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "draining" });
    expect(startDraining).toHaveBeenCalledTimes(1);
  });

  it("is a plain 404 to anyone else, and drains nothing", async () => {
    detailsVisible.mockReturnValue(false);
    const response = await drain(
      new Request("http://localhost/health/drain", { method: "POST" })
    );
    expect(response.status).toBe(404);
    expect(startDraining).not.toHaveBeenCalled();
  });
});

describe("GET /health/live", () => {
  it("returns 200 {status: ok}, uncacheable, without consulting dependencies", async () => {
    const response = await live(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(ready).not.toHaveBeenCalled();
  });
});

describe.each([
  ["ready", readyRoute],
  ["startup", startup],
] as const)("GET /health/%s", (_name, route) => {
  it("returns 200 with checks for a privileged caller", async () => {
    ready.mockResolvedValue(okResult);
    detailsVisible.mockReturnValue(true);
    const response = await route(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { postgres: "ok", redis: "degraded" },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns only the status to an anonymous caller", async () => {
    ready.mockResolvedValue(okResult);
    detailsVisible.mockReturnValue(false);
    expect(await (await route(request())).json()).toEqual({ status: "ok" });
  });

  it("returns 503 when the instance should not receive traffic", async () => {
    ready.mockResolvedValue({
      ready: false,
      status: "unavailable",
      checks: { postgres: "down", redis: "ok" },
    });
    detailsVisible.mockReturnValue(false);
    const response = await route(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("returns the error envelope if the check itself blows up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    ready.mockRejectedValue(new Error("boom"));
    const response = await route(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
  });
});
