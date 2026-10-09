import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "@prometheus-io/client";

import type { MetricLabels, Metrics } from "./metrics.ts";

/**
 * Served on `/metrics`. A later call with different label keys or a conflicting type is dropped and
 * counted, never thrown.
 */
export type PrometheusMetrics = Metrics & {
  readonly registry: Registry;
  /** A scrape-time sampler (queue depth, pool). Runs before every render with a 1 s timeout. */
  onCollect(name: string, hook: () => Promise<void> | void): void;
  render(): Promise<{ contentType: string; body: string }>;
};

const SLOT = Symbol.for("nitap.metrics.prometheus");
const slot = globalThis as unknown as Record<
  symbol,
  PrometheusMetrics | undefined
>;

const SECONDS_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 120,
];
const COLLECT_TIMEOUT_MS = 1_000;

type Kind = "counter" | "histogram" | "gauge";
type Values = Record<string, string | number>;
type Entry =
  | { kind: "counter"; metric: Counter<string> }
  | { kind: "histogram"; metric: Histogram<string> }
  | { kind: "gauge"; metric: Gauge<string> };

const toValues = (labels: MetricLabels = {}): Values =>
  Object.fromEntries(
    Object.entries(labels).map(([key, value]) => [
      key,
      typeof value === "boolean" ? String(value) : value,
    ])
  );

function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("collect timeout")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export function getPrometheusMetrics(): PrometheusMetrics | undefined {
  return slot[SLOT];
}

export function createPrometheusMetrics(options: {
  service: "web" | "worker";
  version: string;
}): PrometheusMetrics {
  const existing = slot[SLOT];
  if (existing) return existing;

  const registry = new Registry();
  registry.setDefaultLabels({ service: options.service });
  collectDefaultMetrics({ register: registry });
  new Gauge({
    name: "app_build_info",
    help: "Build of the running process; always 1.",
    labelNames: ["version"],
    registers: [registry],
  }).set({ version: options.version }, 1);
  const adapterErrors = new Counter({
    name: "metrics_adapter_errors_total",
    help: "Metric calls dropped because of a label or type mismatch.",
    labelNames: ["name"],
    registers: [registry],
  });
  const collectErrors = new Counter({
    name: "metrics_collect_errors_total",
    help: "Scrape-time collectors that failed or timed out.",
    labelNames: ["collector"],
    registers: [registry],
  });

  const entries = new Map<string, Entry>();
  const hooks = new Map<string, () => Promise<void> | void>();

  function create(kind: Kind, name: string, labelNames: string[]): Entry {
    const config = { name, help: name, labelNames, registers: [registry] };
    if (kind === "counter") return { kind, metric: new Counter(config) };
    if (kind === "gauge") return { kind, metric: new Gauge(config) };
    return {
      kind,
      metric: new Histogram({
        ...config,
        ...(name.endsWith("_seconds") ? { buckets: SECONDS_BUCKETS } : {}),
      }),
    };
  }

  function use(
    kind: Kind,
    name: string,
    labels: MetricLabels | undefined,
    apply: (entry: Entry, values: Values) => void
  ) {
    try {
      const values = toValues(labels);
      let entry = entries.get(name);
      if (!entry) {
        entry = create(kind, name, Object.keys(values));
        entries.set(name, entry);
      }
      if (entry.kind !== kind) throw new Error(`${name} is a ${entry.kind}`);
      apply(entry, values);
    } catch {
      adapterErrors.inc({ name });
    }
  }

  const metrics: PrometheusMetrics = {
    registry,
    increment: (name, labels, value = 1) =>
      use("counter", name, labels, (entry, values) =>
        (entry.metric as Counter<string>).inc(values, value)
      ),
    observe: (name, value, labels) =>
      use("histogram", name, labels, (entry, values) =>
        (entry.metric as Histogram<string>).observe(values, value)
      ),
    gauge: (name, value, labels) =>
      use("gauge", name, labels, (entry, values) =>
        (entry.metric as Gauge<string>).set(values, value)
      ),
    onCollect: (name, hook) => void hooks.set(name, hook),
    async render() {
      await Promise.all(
        [...hooks].map(([name, hook]) =>
          withTimeout(Promise.resolve().then(hook), COLLECT_TIMEOUT_MS).catch(
            () => collectErrors.inc({ collector: name })
          )
        )
      );
      return {
        contentType: registry.contentType,
        body: await registry.metrics(),
      };
    },
  };
  slot[SLOT] = metrics;
  return metrics;
}

/** Point-in-time `pg.Pool` usage; called by each process just before rendering. */
export function recordPoolStats(
  metrics: Metrics,
  pool: { totalCount: number; idleCount: number; waitingCount: number }
): void {
  metrics.gauge("db_pool_connections", pool.totalCount, { state: "total" });
  metrics.gauge("db_pool_connections", pool.idleCount, { state: "idle" });
  metrics.gauge("db_pool_connections", pool.waitingCount, { state: "waiting" });
}
