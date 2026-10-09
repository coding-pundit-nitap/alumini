import net from "node:net";

/**
 * - `down`: drops connections and refuses new ones.
 * - `stall`: accepts but holds every byte until `clear()`.
 * - `reset`: resets every connection.
 * - `{ latencyMs }`: forwards with a delay per chunk.
 */
export type Fault = "down" | "stall" | "reset" | { latencyMs: number };

export type FaultProxy = {
  host: string;
  port: number;
  /** `upstreamUrl` with its host and port replaced by the proxy's. */
  url(upstreamUrl: string): string;
  set(fault: Fault): void;
  clear(): void;
  close(): Promise<void>;
};

type Pair = { client: net.Socket; server: net.Socket | null };

/** Each test file owns its proxies on ephemeral ports, so faults never leak between files. */
export async function startFaultProxy(options: {
  upstream: { host: string; port: number };
}): Promise<FaultProxy> {
  let fault: Fault | null = null;
  const pairs = new Set<Pair>();

  const destroy = (pair: Pair, reset: boolean) => {
    for (const socket of [pair.client, pair.server]) {
      if (!socket) continue;
      if (reset) socket.resetAndDestroy();
      else socket.destroy();
    }
    pairs.delete(pair);
  };

  // A stalled pipe holds its bytes, like TCP during a partition, and releases them in order on clear():
  // dropping them would leave a protocol (Redis, PostgreSQL) desynchronised after the fault ends.
  const held = new Set<() => void>();
  const pipe = (from: net.Socket, to: net.Socket) => {
    from.on("data", (chunk) => {
      const current = fault;
      if (current === "stall") {
        from.pause();
        held.add(() => {
          if (!to.destroyed) to.write(chunk);
          from.resume();
        });
        return;
      }
      if (current && typeof current === "object") {
        from.pause();
        setTimeout(() => {
          if (!to.destroyed) to.write(chunk);
          from.resume();
        }, current.latencyMs);
        return;
      }
      if (!to.destroyed) to.write(chunk);
    });
  };

  const server = net.createServer((client) => {
    const pair: Pair = { client, server: null };
    pairs.add(pair);
    client.on("error", () => destroy(pair, false));
    client.on("close", () => destroy(pair, false));
    if (fault === "down") return destroy(pair, false);
    if (fault === "reset") return destroy(pair, true);

    const upstream = net.connect(options.upstream.port, options.upstream.host);
    pair.server = upstream;
    upstream.on("error", () => destroy(pair, false));
    upstream.on("close", () => destroy(pair, false));
    pipe(client, upstream);
    pipe(upstream, client);
  });

  // `down` must refuse at the TCP level, so the listener itself closes and reopens on the same port.
  let listening = false;
  const listen = (port: number) =>
    new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        listening = true;
        resolve();
      });
    });
  const unlisten = () =>
    new Promise<void>((resolve) => {
      if (!listening) return resolve();
      listening = false;
      server.close(() => resolve());
    });

  await listen(0);
  const port = (server.address() as net.AddressInfo).port;
  let pending: Promise<void> = Promise.resolve();

  return {
    host: "127.0.0.1",
    port,
    url(upstreamUrl) {
      const url = new URL(upstreamUrl);
      url.hostname = "127.0.0.1";
      url.port = String(port);
      return url.toString();
    },
    set(next) {
      fault = next;
      if (next === "down" || next === "reset") {
        for (const pair of [...pairs]) destroy(pair, next === "reset");
      }
      if (next === "down") pending = pending.then(unlisten);
    },
    clear() {
      fault = null;
      for (const release of [...held]) release();
      held.clear();
      pending = pending.then(() => (listening ? undefined : listen(port)));
    },
    async close() {
      fault = null;
      for (const pair of [...pairs]) destroy(pair, false);
      await pending;
      await unlisten();
    },
  };
}

/** Runs `fn` with `fault` applied and always removes it afterwards, even when `fn` throws. */
export async function withFault<T>(
  proxy: FaultProxy,
  fault: Fault,
  fn: () => Promise<T>
): Promise<T> {
  proxy.set(fault);
  try {
    return await fn();
  } finally {
    proxy.clear();
    await settled(proxy);
  }
}

/** Resolves once the proxy accepts connections again (after `clear()` reopens a `down` listener). */
export async function settled(proxy: FaultProxy, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect(proxy.port, proxy.host);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (ok) return;
    if (Date.now() > deadline)
      throw new Error(`fault proxy on ${proxy.port} did not reopen`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Host and port of a service URL (`postgresql://…`, `redis://…`, `http://…`). */
export function upstreamOf(serviceUrl: string): { host: string; port: number } {
  const url = new URL(serviceUrl);
  const defaults: Record<string, number> = {
    "postgresql:": 5432,
    "postgres:": 5432,
    "redis:": 6379,
    "http:": 80,
    "https:": 443,
    "smtp:": 25,
  };
  return {
    host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
    port: url.port ? Number(url.port) : (defaults[url.protocol] ?? 0),
  };
}
