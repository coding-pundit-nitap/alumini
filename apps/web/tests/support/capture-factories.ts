import { vi } from "vitest";

/** What one `createX(deps)` call was wired with, and the stand-in it returned. */
export type Captured = {
  deps: Record<string, unknown>;
  built: ReturnType<typeof vi.fn>;
};

/** Replaces each `create*` factory with one that records its dependencies and returns a mock. */
export function captureFactories<T extends Record<string, unknown>>(
  real: T,
  captured: Map<string, Captured>
): T {
  return Object.fromEntries(
    Object.entries(real).map(([name, value]) => [
      name,
      typeof value === "function" && name.startsWith("create")
        ? (deps: Record<string, unknown>) => {
            const built = vi.fn();
            captured.set(name, { deps, built });
            return built;
          }
        : value,
    ])
  ) as T;
}

/** Shared stand-ins for the infrastructure singletons composition files import. */
export const infra = {
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  increment: vi.fn(),
  captureError: vi.fn(),
  addTicks: vi.fn(async () => undefined),
};
