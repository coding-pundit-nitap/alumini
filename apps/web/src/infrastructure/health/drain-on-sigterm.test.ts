import { describe, expect, it, vi } from "vitest";

const health = vi.hoisted(() => ({
  draining: false,
  isDraining: vi.fn(),
  startDraining: vi.fn(),
}));
vi.mock("./index", () => ({ health }));
vi.mock("@/infrastructure/observability", () => ({
  logger: { info: vi.fn() },
}));

import { logger } from "@/infrastructure/observability";

import { drainOnSigterm } from "./drain-on-sigterm";

describe("drainOnSigterm", () => {
  it("starts draining on SIGTERM, logging only the first time", () => {
    const once = vi.spyOn(process, "once").mockImplementation(() => process);
    drainOnSigterm();
    expect(once).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    const onSigterm = once.mock.calls[0]![1] as () => void;

    health.isDraining.mockReturnValue(false);
    onSigterm();
    expect(logger.info).toHaveBeenCalledWith("web.drain.started", {
      metadata: { trigger: "SIGTERM" },
    });
    expect(health.startDraining).toHaveBeenCalledTimes(1);

    health.isDraining.mockReturnValue(true);
    onSigterm();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(health.startDraining).toHaveBeenCalledTimes(2);
  });
});
