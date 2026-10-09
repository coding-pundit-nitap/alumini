import { describe, expect, it, vi } from "vitest";

describe("getQueryClient", () => {
  it("makes a new client per call on the server", async () => {
    vi.resetModules();
    vi.doMock("@tanstack/react-query", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@tanstack/react-query")>()),
      isServer: true,
    }));
    const { getQueryClient } = await import("./query-client");
    expect(getQueryClient()).not.toBe(getQueryClient());
    vi.doUnmock("@tanstack/react-query");
  });

  it("reuses one client in the browser, retrying only non-4xx errors twice and dehydrating pending queries", async () => {
    vi.resetModules();
    vi.doMock("@tanstack/react-query", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@tanstack/react-query")>()),
      isServer: false,
    }));
    const { getQueryClient } = await import("./query-client");
    const client = getQueryClient();
    expect(getQueryClient()).toBe(client);

    const { retry } = client.getDefaultOptions().queries!;
    const decide = retry as (count: number, error: unknown) => boolean;
    const withStatus = (status: number) =>
      Object.assign(new Error("x"), { status });
    expect(decide(0, withStatus(404))).toBe(false);
    expect(decide(0, withStatus(503))).toBe(true);
    expect(decide(0, new Error("network"))).toBe(true);
    expect(decide(2, new Error("network"))).toBe(false);

    const dehydrate = client.getDefaultOptions().dehydrate!;
    const should = dehydrate.shouldDehydrateQuery!;
    expect(
      should({ state: { status: "pending" } } as Parameters<typeof should>[0])
    ).toBe(true);
    vi.doUnmock("@tanstack/react-query");
  });
});
