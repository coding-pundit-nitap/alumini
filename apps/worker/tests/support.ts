import { vi } from "vitest";

import type { Logger, Metrics } from "@nitap/observability";

export const silentLogger = () =>
  ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }) as unknown as Logger;

export const recordingMetrics = () =>
  ({
    increment: vi.fn(),
    observe: vi.fn(),
    gauge: vi.fn(),
  }) as unknown as Metrics &
    Record<"increment" | "observe" | "gauge", ReturnType<typeof vi.fn>>;
