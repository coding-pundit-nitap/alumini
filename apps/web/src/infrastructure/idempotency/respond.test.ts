import { describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure/database/client", () => ({ prisma: {} }));

import { respondIdempotently } from "./index";
import type { RunIdempotently, StoredResponse } from "./idempotency";

const stored: StoredResponse = {
  status: 201,
  body: { data: { id: "c1" } },
  headers: { Location: "/api/v1/connections/c1" },
};
const KEY = "11111111-1111-4111-8111-111111111111";
const req = (
  headers: Record<string, string> = {},
  path = "/api/v1/connections"
) =>
  new Request(`https://alumni.example.test${path}`, {
    method: "POST",
    headers,
  });

describe("respondIdempotently", () => {
  it.each([
    ["no Idempotency-Key header", { userId: "u1" }, {}],
    [
      "no signed-in user to scope the key to",
      { userId: null },
      { "idempotency-key": KEY },
    ],
  ])("just runs the work with %s", async (_l, over, headers) => {
    const run = vi.fn();
    const execute = vi.fn(async () => stored);
    const res = await respondIdempotently(req(headers), {
      rawBody: "{}",
      execute,
      run: run as never,
      ...over,
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/api/v1/connections/c1");
    expect(res.headers.get("idempotent-replay")).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses a key that is not a UUID before doing anything", async () => {
    const run = vi.fn();
    const execute = vi.fn();
    await expect(
      respondIdempotently(req({ "idempotency-key": "not-a-uuid" }), {
        userId: "u1",
        rawBody: "{}",
        execute,
        run: run as never,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(execute).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("scopes the key to the user, lower-cases it, and marks a replay with Idempotent-Replay: true", async () => {
    const run = vi.fn(async () => ({ response: stored, replayed: true }));
    const res = await respondIdempotently(
      req({ "idempotency-key": KEY.toUpperCase() }),
      {
        userId: "u1",
        rawBody: "{}",
        execute: vi.fn(),
        run: run as RunIdempotently,
      }
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", key: KEY })
    );
    expect(res.headers.get("idempotent-replay")).toBe("true");
    expect(await res.json()).toEqual(stored.body);
  });

  it("fingerprints method, path and body: a different body or path is a different request", async () => {
    const hashes: string[] = [];
    const run = (async (a: { requestHash: string }) => {
      hashes.push(a.requestHash);
      return { response: stored, replayed: false };
    }) as unknown as RunIdempotently;
    const call = (path: string, rawBody: string) =>
      respondIdempotently(req({ "idempotency-key": KEY }, path), {
        userId: "u1",
        rawBody,
        execute: vi.fn(),
        run,
      });
    await call("/api/v1/connections", '{"a":1}');
    await call("/api/v1/connections", '{"a":1}');
    await call("/api/v1/connections", '{"a":2}');
    await call("/api/v1/blocks", '{"a":1}');
    expect(hashes[0]).toBe(hashes[1]);
    expect(new Set(hashes).size).toBe(3);
  });
});
