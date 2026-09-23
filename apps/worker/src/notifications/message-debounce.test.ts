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
  it("grants one owner per window, and the same owner again on retry", async () => {
    const d = createRedisMessageDebounce(fake());
    expect(await d.tryStart("r", "c", "e1")).toBe(true);
    expect(await d.tryStart("r", "c", "e2")).toBe(false);
    expect(await d.tryStart("r", "c", "e1")).toBe(true);
    expect(await d.tryStart("r2", "c", "e2")).toBe(true);
  });
});
