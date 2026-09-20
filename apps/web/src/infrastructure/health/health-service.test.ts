import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { noopMetrics, setMetrics } from "@nitap/observability";
import { createHealthService } from "./health-service";

const up = () => Promise.resolve();
const down = () =>
  Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  setMetrics(noopMetrics);
});

describe("health: live (reliability §4.1)", () => {
  it("answers ok without touching any dependency", () => {
    const checkPostgres = vi.fn(up);
    const checkRedis = vi.fn(up);
    const service = createHealthService({ checkPostgres, checkRedis });
    expect(service.live()).toEqual({ status: "ok" });
    expect(checkPostgres).not.toHaveBeenCalled();
    expect(checkRedis).not.toHaveBeenCalled();
  });
});

describe("health: ready", () => {
  it("is ready when PostgreSQL and Redis are up", async () => {
    const service = createHealthService({ checkPostgres: up, checkRedis: up });
    expect(await service.ready()).toEqual({
      ready: true,
      status: "ok",
      checks: { postgres: "ok", redis: "ok" },
    });
  });

  it("reports Redis down as degraded but stays ready (rule 1)", async () => {
    const service = createHealthService({
      checkPostgres: up,
      checkRedis: down,
    });
    expect(await service.ready()).toEqual({
      ready: true,
      status: "ok",
      checks: { postgres: "ok", redis: "degraded" },
    });
  });

  it("is not ready when PostgreSQL is down", async () => {
    const service = createHealthService({
      checkPostgres: down,
      checkRedis: up,
    });
    expect(await service.ready()).toEqual({
      ready: false,
      status: "unavailable",
      checks: { postgres: "down", redis: "ok" },
    });
  });

  it("treats a PostgreSQL check slower than the timeout as down (1 s)", async () => {
    const hang = () => new Promise<void>(() => {});
    const service = createHealthService({
      checkPostgres: hang,
      checkRedis: up,
    });
    const pending = service.ready();
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await pending).checks.postgres).toBe("down");
  });

  it("reports a hung Redis as degraded without waiting on it forever", async () => {
    const hang = () => new Promise<void>(() => {});
    const service = createHealthService({
      checkPostgres: up,
      checkRedis: hang,
    });
    const pending = service.ready();
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await pending).checks.redis).toBe("degraded");
  });

  it("caches the PostgreSQL result so a probe storm cannot exhaust the pool (rule 2)", async () => {
    let now = 0;
    const checkPostgres = vi.fn(up);
    const service = createHealthService({
      checkPostgres,
      checkRedis: up,
      cacheMs: 2_000,
      now: () => now,
    });

    await service.ready();
    await service.ready();
    now = 1_999;
    await service.ready();
    expect(checkPostgres).toHaveBeenCalledTimes(1);

    now = 2_000;
    await service.ready();
    expect(checkPostgres).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight check between concurrent probes", async () => {
    const checkPostgres = vi.fn(up);
    const service = createHealthService({ checkPostgres, checkRedis: up });
    await Promise.all([service.ready(), service.ready(), service.ready()]);
    expect(checkPostgres).toHaveBeenCalledTimes(1);
  });

  it("recovers once PostgreSQL is back after the cache expires", async () => {
    let now = 0;
    let healthy = false;
    const service = createHealthService({
      checkPostgres: () => (healthy ? up() : down()),
      checkRedis: up,
      cacheMs: 2_000,
      now: () => now,
    });
    expect((await service.ready()).ready).toBe(false);
    healthy = true;
    now = 2_500;
    expect((await service.ready()).ready).toBe(true);
  });

  it("flips to unavailable while draining, before the process exits (rule 4)", async () => {
    const service = createHealthService({ checkPostgres: up, checkRedis: up });
    expect((await service.ready()).ready).toBe(true);
    service.startDraining();
    expect(await service.ready()).toMatchObject({
      ready: false,
      status: "unavailable",
    });
  });

  it("never returns error text from a failed dependency", async () => {
    const service = createHealthService({
      checkPostgres: down,
      checkRedis: down,
    });
    expect(JSON.stringify(await service.ready())).not.toContain("10.0.0.5");
  });

  it("emits dependency_up gauges through the Metrics port", async () => {
    const gauge = vi.fn();
    setMetrics({ ...noopMetrics, gauge });
    const service = createHealthService({
      checkPostgres: up,
      checkRedis: down,
    });
    await service.ready();
    expect(gauge).toHaveBeenCalledWith("dependency_up", 1, {
      dependency: "postgres",
    });
    expect(gauge).toHaveBeenCalledWith("dependency_up", 0, {
      dependency: "redis",
    });
  });
});
