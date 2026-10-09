import { describe, expect, it, vi } from "vitest";

import type { Captured } from "../../tests/support/capture-factories";

const captured = vi.hoisted(() => new Map<string, Captured>());

vi.mock("@/modules/admin", async (importOriginal) => {
  const { captureFactories } =
    await import("../../tests/support/capture-factories");
  return captureFactories(await importOriginal(), captured);
});
vi.mock("@/modules/admin/server", async (importOriginal) => {
  const { captureFactories } =
    await import("../../tests/support/capture-factories");
  return captureFactories(await importOriginal(), captured);
});
vi.mock("@/infrastructure/observability", async () => {
  const { infra } = await import("../../tests/support/capture-factories");
  return {
    logger: infra.logger,
    getMetrics: () => ({ increment: infra.increment }),
  };
});
vi.mock("@/infrastructure/audit", () => ({ audit: {} }));
vi.mock("@/infrastructure/database/client", () => ({
  prisma: {},
  transactionRunner: {},
}));
vi.mock("@/infrastructure/outbox", () => ({ outbox: {} }));
vi.mock("@/modules/auth", () => ({
  authorize: vi.fn(),
  can: vi.fn(),
  loadGrants: vi.fn(),
}));

import { infra } from "../../tests/support/capture-factories";
import "./admin";

describe("admin composition", () => {
  it("logs and counts a failed dashboard tile and a failed analytics section", () => {
    const error = new Error("down");
    (
      captured.get("createGetDashboard")!.deps.onTileFailed as (
        tile: string,
        error: unknown
      ) => void
    )("users", error);
    expect(infra.logger.warn).toHaveBeenCalledWith(
      "admin.dashboard.count_failed",
      { error, metadata: { tile: "users" } }
    );
    expect(infra.increment).toHaveBeenCalledWith(
      "admin_dashboard_count_failed_total",
      { tile: "users" }
    );

    (
      captured.get("createGetAnalytics")!.deps.onSectionFailed as (
        section: string,
        error: unknown
      ) => void
    )("growth", error);
    expect(infra.logger.warn).toHaveBeenCalledWith(
      "admin.analytics.section_failed",
      { error, metadata: { section: "growth" } }
    );
    expect(infra.increment).toHaveBeenCalledWith(
      "admin_analytics_section_failed_total",
      { section: "growth" }
    );
  });
});
