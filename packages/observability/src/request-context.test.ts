import { describe, it, expect } from "vitest";
import {
  getRequestContext,
  runWithRequestContext,
  setRequestUser,
} from "./request-context.ts";

describe("request context", () => {
  it("is empty outside a request", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("carries the request id across awaits", async () => {
    await runWithRequestContext({ requestId: "req-aaaaaaaa" }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(getRequestContext()?.requestId).toBe("req-aaaaaaaa");
    });
  });

  it("isolates concurrent requests", async () => {
    const seen: string[] = [];
    await Promise.all(
      ["req-11111111", "req-22222222"].map((requestId) =>
        runWithRequestContext({ requestId }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 2));
          seen.push(getRequestContext()!.requestId);
        })
      )
    );
    expect(seen.sort()).toEqual(["req-11111111", "req-22222222"]);
  });

  it("records the authenticated user for later log lines", () => {
    runWithRequestContext({ requestId: "req-aaaaaaaa" }, () => {
      setRequestUser("user-1");
      expect(getRequestContext()?.userId).toBe("user-1");
    });
  });

  it("ignores setRequestUser outside a request", () => {
    expect(() => setRequestUser("user-1")).not.toThrow();
  });
});
