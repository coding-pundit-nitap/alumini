import { describe, expect, it, vi } from "vitest";

import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";

import { loadBlock } from "./load-block";

vi.mock("@/infrastructure/observability", () => ({
  logger: { warn: vi.fn() },
}));

describe("loadBlock", () => {
  it("wraps a value", async () => {
    expect(await loadBlock(async () => 3)).toEqual({ status: "ok", value: 3 });
  });

  it.each([
    new AuthenticationError(),
    new AuthorizationError(),
    new NotFoundError(),
  ])("treats %s as an absent block, not an error", async (error) => {
    expect(
      await loadBlock(async () => {
        throw error;
      })
    ).toEqual({ status: "absent" });
  });

  it("turns anything else into an error block", async () => {
    expect(
      await loadBlock(async () => {
        throw new Error("db down");
      })
    ).toEqual({ status: "error" });
  });
});
