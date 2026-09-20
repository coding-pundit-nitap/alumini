import { createServer } from "node:http";

export type Readiness = {
  ok: boolean;
  checks: {
    database: boolean;
    queueRedis: boolean;
    /** The relay completed a poll recently. */
    relay: boolean;
    draining: boolean;
  };
};

export type HealthServer = { port: number; close(): Promise<void> };

/** Internal health port (TDS §12.2). Not exposed publicly; probes call it directly. */
export async function startHealthServer(options: {
  port: number;
  ready: () => Promise<Readiness>;
}): Promise<HealthServer> {
  const server = createServer((request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(body));
    };
    if (request.url === "/health/live") return send(200, { status: "live" });
    if (request.url === "/health/ready") {
      options.ready().then(
        (readiness) =>
          send(readiness.ok ? 200 : 503, {
            status: readiness.ok ? "ready" : "not-ready",
            checks: readiness.checks,
          }),
        () => send(503, { status: "not-ready" })
      );
      return;
    }
    return send(404, { status: "not-found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, () => resolve());
  });
  const address = server.address();
  const port =
    typeof address === "object" && address ? address.port : options.port;

  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
