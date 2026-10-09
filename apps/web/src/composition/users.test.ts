import { describe, expect, it, vi } from "vitest";

import type { Captured } from "../../tests/support/capture-factories";

const captured = vi.hoisted(() => new Map<string, Captured>());

vi.mock("@/modules/users", async (importOriginal) => {
  const { captureFactories } =
    await import("../../tests/support/capture-factories");
  return captureFactories(await importOriginal(), captured);
});
vi.mock("@/infrastructure/observability", async () => ({
  logger: (await import("../../tests/support/capture-factories")).infra.logger,
}));
vi.mock("./connections", () => ({ connectionLookup: {} }));
vi.mock("@/infrastructure/audit", () => ({ audit: {} }));
vi.mock("@/infrastructure/database/client", () => ({
  prisma: {},
  transactionRunner: {},
}));
vi.mock("@/modules/auth", () => ({ authorize: vi.fn(), can: vi.fn() }));

import { infra } from "../../tests/support/capture-factories";
import "./users";

describe("users composition", () => {
  it("warns, without failing the read, when the connection lookup fails", () => {
    const error = new Error("down");
    for (const name of [
      "createGetProfileForViewer",
      "createGetProfilePhotoKey",
    ]) {
      (captured.get(name)!.deps.reportError as (e: unknown) => void)(error);
    }
    expect(infra.logger.warn).toHaveBeenCalledTimes(2);
    expect(infra.logger.warn).toHaveBeenCalledWith(
      "profile.connection_lookup_failed",
      { error }
    );
  });

  it("dates collection items by the current clock", () => {
    const now = captured.get("createCollectionUseCases")!.deps
      .now as () => Date;
    expect(now()).toBeInstanceOf(Date);
  });
});
