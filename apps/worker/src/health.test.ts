import { afterEach, describe, expect, it } from "vitest";

import { startHealthServer } from "./health.ts";
import type { MetricsEndpoint, Readiness } from "./health.ts";

const servers: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

const readiness = (over: Partial<Readiness["checks"]> = {}): Readiness => {
  const checks = {
    database: true,
    queueRedis: true,
    relay: true,
    draining: false,
    ...over,
  };
  return {
    ok:
      checks.database && checks.queueRedis && checks.relay && !checks.draining,
    checks,
  };
};

async function start(
  ready: () => Promise<Readiness>,
  metrics?: MetricsEndpoint
) {
  const server = await startHealthServer({ port: 0, ready, metrics });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
}

describe("worker health server", () => {
  it("/health/live answers 200 as long as the process runs", async () => {
    const base = await start(async () => readiness({ database: false }));
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
  });

  it("/health/ready answers 200 with the checks when everything is fine", async () => {
    const base = await start(async () => readiness());
    const response = await fetch(`${base}/health/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      checks: {
        database: true,
        queueRedis: true,
        relay: true,
        draining: false,
      },
    });
  });

  it.each([["database"], ["queueRedis"], ["relay"]] as const)(
    "/health/ready answers 503 when %s is unhealthy",
    async (check) => {
      const base = await start(async () => readiness({ [check]: false }));
      expect((await fetch(`${base}/health/ready`)).status).toBe(503);
    }
  );

  it("/health/ready answers 503 while draining", async () => {
    const base = await start(async () => readiness({ draining: true }));
    expect((await fetch(`${base}/health/ready`)).status).toBe(503);
  });

  it("answers 404 for anything else", async () => {
    const base = await start(async () => readiness());
    expect((await fetch(`${base}/`)).status).toBe(404);
  });
});

describe("worker /metrics (spec 13A A-7)", () => {
  const render = async () => ({
    contentType: "text/plain; version=0.0.4",
    body: "up 1\n",
  });

  it("is 404 when no metrics option is given", async () => {
    const base = await start(async () => readiness());
    expect((await fetch(`${base}/metrics`)).status).toBe(404);
  });

  it("serves the exposition text when authorized", async () => {
    const base = await start(async () => readiness(), {
      authorize: () => true,
      render,
    });
    const response = await fetch(`${base}/metrics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; version=0.0.4"
    );
    expect(await response.text()).toBe("up 1\n");
  });

  it("is 404 when refused", async () => {
    const base = await start(async () => readiness(), {
      authorize: () => false,
      render,
    });
    expect((await fetch(`${base}/metrics`)).status).toBe(404);
  });

  it("is 500 when rendering throws", async () => {
    const base = await start(async () => readiness(), {
      authorize: () => true,
      render: async () => {
        throw new Error("boom");
      },
    });
    expect((await fetch(`${base}/metrics`)).status).toBe(500);
  });
});
