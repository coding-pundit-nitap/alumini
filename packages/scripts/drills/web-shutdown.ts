#!/usr/bin/env node
// Web graceful-shutdown drill (Phase 14 RD-8; reliability §8.3 step 7; strategy §11.4 "SIGTERM with requests
// in flight"). Runs against a production build:
//
//   pnpm --filter @nitap/web build
//   pnpm docker:up && set -a && . ./.env && set +a
//   node packages/scripts/drills/web-shutdown.ts            # PORT=3100 by default
//
// It starts `next start`, signs in as the dev coordinator (DEV_COORDINATOR_EMAIL/PASSWORD) to hold a real
// message stream open, then drains and stops the instance the way a deploy does, and prints a pass/fail table
// for docs/operations/failure-scenarios.md. Exit code 1 if any check fails.
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";

import { startFaultProxy, upstreamOf } from "../../testing/src/fault-proxy.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const port = Number(process.env.PORT ?? 3100);
const origin = `http://localhost:${port}`;
const token = "drill-health-token-0000000000";
const results: { check: string; pass: boolean; detail: string }[] = [];
const record = (check: string, pass: boolean, detail: string) =>
  results.push({ check, pass, detail });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

// The database goes through a fault proxy so the drill can make requests slow on purpose: a request is only
// "in flight" if the server is still working on it when SIGTERM arrives.
const db = await startFaultProxy({
  upstream: upstreamOf(databaseUrl),
});

// The next binary itself, not through pnpm, so the signal and the exit are Next.js's own.
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--port", String(port)],
  {
    cwd: path.join(root, "apps/web"),
    env: {
      ...process.env,
      HEALTH_CHECK_TOKEN: token,
      DATABASE_URL: db.url(databaseUrl),
      BETTER_AUTH_URL: origin,
      LOG_LEVEL: "warn",
    },
    stdio: ["ignore", "inherit", "inherit"],
  }
);
type Exit = { code: number | null; signal: NodeJS.Signals | null; at: number };
const exited = new Promise<Exit>((resolve) =>
  server.once("exit", (code, signal) =>
    resolve({ code, signal, at: Date.now() })
  )
);

async function until(fn: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn().catch(() => false)) return true;
    await sleep(250);
  }
  return false;
}

const auth = { authorization: `Bearer ${token}` };
try {
  const up = await until(
    async () => (await fetch(`${origin}/health/ready`, { headers: auth })).ok,
    60_000
  );
  record("instance becomes ready", up, up ? "200" : "not ready in 60 s");
  if (!up) throw new Error("server never became ready");

  // A real, open message stream (needs a session).
  let stream: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const signIn = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      email: process.env.DEV_COORDINATOR_EMAIL,
      password: process.env.DEV_COORDINATOR_PASSWORD,
    }),
  }).catch(() => null);
  const cookie = signIn?.ok
    ? signIn.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ")
    : null;
  if (cookie) {
    const response = await fetch(`${origin}/api/v1/messages/stream`, {
      headers: { cookie },
    });
    if (response.ok && response.body) {
      const reader = response.body.getReader();
      await reader.read(); // preamble
      stream = reader;
    }
  }

  const drainAt = Date.now();
  const drain = await fetch(`${origin}/health/drain`, {
    method: "POST",
    headers: auth,
  });
  record(
    "POST /health/drain accepted",
    drain.status === 202,
    String(drain.status)
  );

  const ready = await fetch(`${origin}/health/ready`, { headers: auth });
  const live = await fetch(`${origin}/health/live`);
  record(
    "readiness 503, liveness 200 while draining",
    ready.status === 503 && live.status === 200,
    `ready ${ready.status}, live ${live.status}`
  );

  if (stream) {
    const ended = await Promise.race([
      stream.read().then(({ done }) => done),
      sleep(3_000).then(() => false),
    ]);
    record(
      "open message stream ends on drain",
      ended,
      ended ? `${Date.now() - drainAt} ms after drain` : "still open after 3 s"
    );
  } else {
    record(
      "open message stream ends on drain",
      true,
      "skipped: no dev session (seed the coordinator)"
    );
  }

  // Requests in flight when SIGTERM arrives must complete. Each is a signed-in page (session and data reads),
  // slowed by 100 ms per database round trip, on its own fresh connection (no keep-alive reuse).
  db.set({ latencyMs: 100 });
  const page = cookie ? "/dashboard" : "/login";
  const inFlight = Array.from(
    { length: 10 },
    () =>
      new Promise<{ status: number | string | undefined; ms: number }>(
        (resolve) => {
          const started = Date.now();
          const request = http.get(
            `${origin}${page}`,
            { agent: false, headers: cookie ? { cookie } : {} },
            (response) => {
              response.resume();
              response.on("end", () =>
                resolve({
                  status: response.statusCode,
                  ms: Date.now() - started,
                })
              );
            }
          );
          request.on("error", (e: NodeJS.ErrnoException) =>
            resolve({
              status: `error: ${e.code ?? e.message}`,
              ms: Date.now() - started,
            })
          );
        }
      )
  );
  await sleep(400); // all ten are accepted and waiting on the database
  const termAt = Date.now();
  server.kill("SIGTERM");
  const settled = await Promise.all(inFlight);
  db.clear();
  const ok = settled.filter((r) => r.status === 200);
  record(
    "in-flight requests complete after SIGTERM",
    ok.length === settled.length,
    `${ok.length}/${settled.length} answered 200 (${page}, slowest ${Math.max(...settled.map((r) => r.ms))} ms, SIGTERM at 400 ms)` +
      (ok.length === settled.length
        ? ""
        : `: ${[...new Set(settled.map((r) => r.status))].join(", ")}`)
  );

  const exit = await Promise.race([exited, sleep(30_000).then(() => null)]);
  record(
    "process exits within the 30 s grace",
    exit !== null,
    exit
      ? `${exit.at - termAt} ms, ${exit.signal ?? `code ${exit.code}`}`
      : "still running after 30 s"
  );
  const refused = await fetch(`${origin}/health/live`).then(
    () => false,
    () => true
  );
  record(
    "no new connections after exit",
    refused,
    refused ? "refused" : "still answering"
  );
} catch (error) {
  record(
    "drill ran to the end",
    false,
    error instanceof Error ? error.message : String(error)
  );
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGKILL");
  }
  await db.close();
}

const sha = await new Promise<string>((resolve) => {
  const git = spawn("git", ["rev-parse", "--short", "HEAD"], { cwd: root });
  let out = "";
  git.stdout.on("data", (d: Buffer) => (out += d));
  git.on("close", () => resolve(out.trim()));
});
console.log(
  `\nWeb shutdown drill — ${new Date().toISOString().slice(0, 10)} — ${sha}\n`
);
console.log("| Check | Result | Detail |\n| ----- | ------ | ------ |");
for (const r of results)
  console.log(`| ${r.check} | ${r.pass ? "pass" : "**FAIL**"} | ${r.detail} |`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
