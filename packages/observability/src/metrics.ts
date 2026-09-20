/**
 * Metrics port (decision D10). Every phase emits metric calls; Phase 13 installs a real adapter
 * (Prometheus/OpenTelemetry) with `setMetrics` without touching a call site.
 * Names follow Prometheus conventions (`http_requests_total`, `..._seconds`); labels stay low-cardinality
 * (never user ids or raw URLs).
 */
export type MetricLabels = Record<string, string | number | boolean>;

export interface Metrics {
  /** Adds `value` (default 1) to a monotonic counter. */
  increment(name: string, labels?: MetricLabels, value?: number): void;
  /** Records one observation (latency, size) into a histogram. */
  observe(name: string, value: number, labels?: MetricLabels): void;
  /** Sets a point-in-time value (queue depth, backlog). */
  gauge(name: string, value: number, labels?: MetricLabels): void;
}

export const noopMetrics: Metrics = {
  increment() {},
  observe() {},
  gauge() {},
};

let current: Metrics = noopMetrics;

export function getMetrics(): Metrics {
  return current;
}

export function setMetrics(metrics: Metrics): void {
  current = metrics;
}
