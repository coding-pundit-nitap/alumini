import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => mocks.current }));

import { getRequestContext } from "@/infrastructure/observability";
import { AuthorizationError, ValidationError } from "@/lib/errors";

import { runAction } from "./run-action";

beforeEach(() => {
  mocks.current = new Headers({ "x-request-id": "req-abc-123" });
});

describe("runAction", () => {
  it("returns the data of a successful action", async () => {
    expect(await runAction(async () => ({ requestId: "r1" }))).toEqual({
      ok: true,
      data: { requestId: "r1" },
    });
  });

  it("runs the work inside the request context, with the request id from the proxy header", async () => {
    let seen: string | undefined;
    await runAction(async () => {
      seen = getRequestContext()?.requestId;
    });
    expect(seen).toBe("req-abc-123");
  });

  it("maps an expected error to its code and safe message, and returns the request id", async () => {
    const result = await runAction(async () => {
      throw new AuthorizationError({ code: "SELF_REVIEW_FORBIDDEN" });
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "SELF_REVIEW_FORBIDDEN",
        message: "You cannot review your own request.",
      },
      requestId: "req-abc-123",
    });
  });

  it("carries per-field messages of a validation error", async () => {
    const result = await runAction(async () => {
      throw new ValidationError({
        details: [
          {
            field: "note",
            code: "INVALID_NOTE",
            message: "A note is required.",
          },
        ],
      });
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        fields: { note: "A note is required." },
      },
    });
  });

  it("hides an unexpected failure behind the generic message", async () => {
    const result = await runAction(async () => {
      throw new Error("database password is hunter2");
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });
});
