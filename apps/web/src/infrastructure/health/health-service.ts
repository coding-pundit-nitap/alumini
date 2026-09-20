import { getMetrics } from "@/infrastructure/observability/metrics";

/**
 * Liveness and readiness (reliability §4.1).
 *
 * - `live`: the process answers. Checks nothing external, so a dependency outage never restarts healthy pods.
 * - `ready`: PostgreSQL is the only required infrastructure. Redis is *reported* as degraded but never
 *   fails readiness, otherwise a Redis blip would pull every instance out of rotation (rule 1).
 * - Results are cached for ~2 s and concurrent probes share one check, so a probe storm cannot exhaust
 *   the connection pool (rule 2).
 * - `startDraining()` flips readiness to unavailable first on shutdown so no new traffic arrives (rule 4).
 * Failure detail (error text, hosts) never leaves this module: callers only see ok/down/degraded.
 */
export type ReadinessResult = {
  ready: boolean;
  status: "ok" | "unavailable";
  checks: {
    postgres: "ok" | "down";
    redis: "ok" | "degraded";
  };
};

export type HealthServiceOptions = {
  checkPostgres: () => Promise<void>;
  checkRedis: () => Promise<void>;
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
};

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function createHealthService(options: HealthServiceOptions) {
  const timeoutMs = options.timeoutMs ?? 1_000;
  const cacheMs = options.cacheMs ?? 2_000;
  const now = options.now ?? Date.now;
  let draining = false;

  // Caches the promise itself, so concurrent callers share the in-flight check.
  function cached(check: () => Promise<void>) {
    let entry: { at: number; result: Promise<boolean> } | undefined;
    return () => {
      const time = now();
      if (!entry || time - entry.at >= cacheMs) {
        entry = {
          at: time,
          // A synchronous throw from `check` must count as down, not escape.
          result: withTimeout(Promise.resolve().then(check), timeoutMs).then(
            () => true,
            () => false
          ),
        };
      }
      return entry.result;
    };
  }

  const postgresUp = cached(options.checkPostgres);
  const redisUp = cached(options.checkRedis);

  return {
    live() {
      return { status: "ok" as const };
    },

    async ready(): Promise<ReadinessResult> {
      const [postgres, redis] = await Promise.all([postgresUp(), redisUp()]);

      const metrics = getMetrics();
      metrics.gauge("dependency_up", postgres ? 1 : 0, {
        dependency: "postgres",
      });
      metrics.gauge("dependency_up", redis ? 1 : 0, { dependency: "redis" });

      const ready = postgres && !draining;
      return {
        ready,
        status: ready ? "ok" : "unavailable",
        checks: {
          postgres: postgres ? "ok" : "down",
          redis: redis ? "ok" : "degraded",
        },
      };
    },

    startDraining() {
      draining = true;
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
