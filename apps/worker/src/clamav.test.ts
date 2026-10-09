import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createClamdScanner, parseClamavUrl } from "./clamav.ts";

// The adapter is tested against an in-process clamd that speaks the real INSTREAM framing
// (z-prefixed command, 4-byte big-endian chunk lengths, a zero-length terminator, a NUL-terminated reply).

const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

type Behaviour =
  | "scan" // OK, or FOUND when the stream contains the EICAR string
  | "error" // clamd's own error reply
  | "hang" // accepts, never answers
  | "close"; // hangs up without a reply

const servers: net.Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null))))
  );
});

/** A fake clamd. Records what it reassembled so the framing itself is checked. */
async function fakeClamd(behaviour: Behaviour) {
  const received: { command: string; bytes: Buffer }[] = [];
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let command: string | null = null;
    const chunks: Buffer[] = [];
    socket.on("data", (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);
      if (command === null) {
        const end = buffer.indexOf(0);
        if (end < 0) return;
        command = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 1);
      }
      for (;;) {
        if (buffer.length < 4) return;
        const length = buffer.readUInt32BE(0);
        if (length === 0) {
          const bytes = Buffer.concat(chunks);
          received.push({ command, bytes });
          if (behaviour === "hang") return;
          if (behaviour === "close") return void socket.destroy();
          const reply =
            behaviour === "error"
              ? "INSTREAM size limit exceeded. ERROR"
              : bytes.includes(EICAR)
                ? "stream: Win.Test.EICAR_HDB-1 FOUND"
                : "stream: OK";
          socket.end(`${reply}\0`);
          return;
        }
        if (buffer.length < 4 + length) return;
        chunks.push(buffer.subarray(4, 4 + length));
        buffer = buffer.subarray(4 + length);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  return { port, received };
}

const scannerOn = (port: number, timeoutMs = 2_000) =>
  createClamdScanner({ host: "127.0.0.1", port, timeoutMs, chunkBytes: 1024 });

describe("clamd scanner (INSTREAM)", () => {
  it("passes clean bytes, sent in framed chunks and reassembled intact", async () => {
    const clamd = await fakeClamd("scan");
    const bytes = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));
    await expect(scannerOn(clamd.port).scan(bytes)).resolves.toEqual({
      ok: true,
    });
    expect(clamd.received).toHaveLength(1);
    expect(clamd.received[0]!.command).toBe("zINSTREAM");
    expect(clamd.received[0]!.bytes.equals(bytes)).toBe(true);
  });

  it("rejects bytes clamd flags, without echoing the signature to the member", async () => {
    const clamd = await fakeClamd("scan");
    const result = await scannerOn(clamd.port).scan(
      Buffer.concat([Buffer.from("prefix"), Buffer.from(EICAR)])
    );
    expect(result).toEqual({
      ok: false,
      reason: "This file was flagged by the malware scan.",
    });
  });

  it("throws on clamd's own error reply, so the job retries (fails closed)", async () => {
    const clamd = await fakeClamd("error");
    await expect(scannerOn(clamd.port).scan(Buffer.from("x"))).rejects.toThrow(
      /clamd/
    );
  });

  it("throws when clamd hangs up without a verdict", async () => {
    const clamd = await fakeClamd("close");
    await expect(
      scannerOn(clamd.port).scan(Buffer.from("x"))
    ).rejects.toThrow();
  });

  it("throws when clamd does not answer in time", async () => {
    const clamd = await fakeClamd("hang");
    const started = Date.now();
    await expect(
      scannerOn(clamd.port, 300).scan(Buffer.from("x"))
    ).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("throws when clamd is not running", async () => {
    const clamd = await fakeClamd("scan");
    const port = clamd.port;
    await new Promise((r) => servers.pop()!.close(() => r(null)));
    await expect(scannerOn(port).scan(Buffer.from("x"))).rejects.toThrow();
  });
});

describe("CLAMAV_URL", () => {
  it("reads tcp://host:port, defaulting the port to 3310", () => {
    expect(parseClamavUrl("tcp://clamav:3310")).toEqual({
      host: "clamav",
      port: 3310,
    });
    expect(parseClamavUrl("tcp://10.0.0.5")).toEqual({
      host: "10.0.0.5",
      port: 3310,
    });
  });

  it("refuses any other scheme", () => {
    expect(() => parseClamavUrl("http://clamav:3310")).toThrow(/tcp:/);
  });
});
