import { describe, expect, it } from "vitest";

import { createRedisMessageDebounce } from "./message-debounce.ts";

const fake = () => {
  const m = new Map<string, string>();
  return {
    set: async (k: string, v: string) =>
      m.has(k) ? null : (m.set(k, v), "OK"),
    get: async (k: string) => m.get(k) ?? null,
  } as never;
};

describe("redis message debounce", () => {
  it("grants one owner per window and names the window by its owner; the same owner again on retry", async () => {
    const d = createRedisMessageDebounce(fake());
    expect(await d.claim("r", "c", "e1")).toEqual({
      owner: true,
      window: "e1",
    });
    expect(await d.claim("r", "c", "e2")).toEqual({
      owner: false,
      window: "e1",
    });
    expect(await d.claim("r", "c", "e1")).toEqual({
      owner: true,
      window: "e1",
    });
    expect(await d.claim("r2", "c", "e2")).toEqual({
      owner: true,
      window: "e2",
    });
  });
});
