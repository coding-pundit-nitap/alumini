import { afterEach, describe, expect, it } from "vitest";

import { emailSend } from "@nitap/jobs";
import { createPrometheusMetrics } from "@nitap/observability";
import { createBullQueuePort, createQueueAdmin } from "@nitap/queue";
import { createRedisNamespace } from "@nitap/testing";

import { registerQueueDepthCollector } from "../src/queue-depth.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  delete (globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for("nitap.metrics.prometheus")
  ];
});

describe("queue depth moves with the queue", () => {
  it("rises while no processor consumes the email queue", async () => {
    const ns = await createRedisNamespace();
    const port = createBullQueuePort({
      url: ns.url,
      prefix: ns.prefix,
      addTimeoutMs: 1_000,
    });
    const admin = createQueueAdmin({ url: ns.url, prefix: ns.prefix });
    cleanups.push(async () => {
      await port.close();
      await admin.close();
      await ns.cleanup();
    });
    const metrics = createPrometheusMetrics({
      service: "worker",
      version: "t",
    });
    registerQueueDepthCollector(metrics, admin);

    expect((await metrics.render()).body).toMatch(
      /queue_jobs\{queue="email",state="waiting",service="worker"\} 0/
    );

    for (const n of [1, 2, 3]) {
      await port.add(
        emailSend,
        {
          v: 1,
          to: `u${n}@example.test`,
          template: "notification",
          params: {
            title: "t",
            body: "b",
            actionUrl: "https://example.test/x",
          },
        },
        { jobId: `depth-${n}` }
      );
    }

    expect((await metrics.render()).body).toMatch(
      /queue_jobs\{queue="email",state="waiting",service="worker"\} 3/
    );
  });

  it("an unreachable queue Redis still renders, with the collector error counted", async () => {
    const admin = createQueueAdmin({
      url: "redis://127.0.0.1:1",
      prefix: "nope",
    });
    cleanups.push(() => admin.close());
    const metrics = createPrometheusMetrics({
      service: "worker",
      version: "t",
    });
    registerQueueDepthCollector(metrics, admin);

    const { body } = await metrics.render();

    expect(body).toMatch(
      /metrics_collect_errors_total\{collector="queue_depth",service="worker"\} 1/
    );
  });
});
