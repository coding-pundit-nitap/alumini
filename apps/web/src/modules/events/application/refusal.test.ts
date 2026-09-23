import { describe, expect, it } from "vitest";

import { AuthorizationError, ConflictError, NotFoundError } from "@/lib/errors";

import type { RefusalCode } from "../domain/event";
import { refuse } from "./refusal";

describe("refuse", () => {
  it("maps NOT_FOUND to NotFoundError", () => {
    expect(() => refuse({ ok: false, code: "NOT_FOUND" })).toThrow(
      NotFoundError
    );
  });

  it("maps PERMISSION_DENIED to AuthorizationError with the default code", () => {
    try {
      refuse({ ok: false, code: "PERMISSION_DENIED" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).code).toBe("PERMISSION_DENIED");
    }
  });

  it.each<RefusalCode>([
    "EVENT_CANCELLED",
    "EVENT_FULL",
    "REGISTRATION_CLOSED",
    "ALREADY_REGISTERED",
    "INVALID_STATE_TRANSITION",
  ])("maps %s to ConflictError carrying that code", (code) => {
    try {
      refuse({ ok: false, code });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe(code);
    }
  });
});
