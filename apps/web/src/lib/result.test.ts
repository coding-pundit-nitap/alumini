import { describe, it, expect } from "vitest";
import { err, isErr, isOk, ok } from "./result";

describe("Result", () => {
  it("wraps success and failure values", () => {
    const success = ok(1);
    const failure = err("boom");
    expect(isOk(success) && success.value).toBe(1);
    expect(isErr(failure) && failure.error).toBe("boom");
  });

  it("discriminates without exceptions", () => {
    const results = [ok(1), err("x")];
    expect(results.filter(isOk)).toHaveLength(1);
    expect(results.filter(isErr)).toHaveLength(1);
  });
});
