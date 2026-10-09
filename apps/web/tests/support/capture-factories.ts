import { vi } from "vitest";

/** What one `createX(deps)` call was wired with, and the stand-in it returned. */
export type Captured = {
  deps: Record<string, unknown>;
  built: ReturnType<typeof vi.fn>;
};

/**
 * For composition tests: replaces every `create*` factory a module exports with one that records the
 * dependencies it was called with and returns a mock, so a test can call the hooks and wrappers the
 * composition file wires (observers, error reporters, tick decoration) without a database or Redis.
 */
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
