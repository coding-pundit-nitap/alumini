import { describe, expect, it } from "vitest";

import { TimeoutError, withTimeout } from "./timeout.ts";

describe("withTimeout", () => {
  it("passes the result through when the work finishes in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 100, "job")).resolves.toBe(7);
  });

  it("rejects with a TimeoutError naming the operation when it takes too long", async () => {
    const never = new Promise<never>(() => {});
    const error = await withTimeout(never, 30, "enqueue").catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as Error).message).toContain("enqueue");
  });

  it("propagates the work's own rejection", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 100, "job")
    ).rejects.toThrow("boom");
  });
});
