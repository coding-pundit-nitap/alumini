import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => mocks.current }));

import { getClientIp } from "./client-ip";

beforeEach(() => {
  mocks.current = new Headers();
});

describe("getClientIp", () => {
  it("takes the first address of x-forwarded-for", async () => {
    mocks.current = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(await getClientIp()).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", async () => {
    mocks.current = new Headers({ "x-real-ip": "198.51.100.4" });
    expect(await getClientIp()).toBe("198.51.100.4");
  });

  it("uses a fixed bucket when nothing is known", async () => {
    expect(await getClientIp()).toBe("unknown");
  });
});
