import net from "node:net";

import type { ScannerPort } from "./scanner.ts";

/**
 * ClamAV over clamd's INSTREAM protocol: length-prefixed chunks, then a zero length. FOUND rejects the
 * file; anything else throws so the job retries and the upload stays PENDING_SCAN.
 */
export function createClamdScanner(options: {
  host: string;
  port: number;
  /** The whole exchange, connect to verdict. */
  timeoutMs?: number;
  chunkBytes?: number;
}): ScannerPort {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const chunkBytes = options.chunkBytes ?? 64 * 1024;

  return {
    scan(bytes) {
      return new Promise((resolve, reject) => {
        const socket = net.connect({ host: options.host, port: options.port });
        let reply = "";
        let settled = false;
        const finish = (outcome: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          socket.destroy();
          outcome();
        };
        const timer = setTimeout(
          () =>
            finish(() =>
              reject(new Error(`clamd scan timed out after ${timeoutMs} ms`))
            ),
          timeoutMs
        );

        socket.on("connect", () => {
          socket.write("zINSTREAM\0");
          for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
            const chunk = bytes.subarray(offset, offset + chunkBytes);
            const length = Buffer.alloc(4);
            length.writeUInt32BE(chunk.length);
            socket.write(length);
            socket.write(chunk);
          }
          socket.write(Buffer.alloc(4)); // zero length: end of stream
        });
        socket.on("data", (data) => {
          reply += data.toString("utf8");
          const end = reply.indexOf("\0");
          if (end < 0) return;
          const line = reply.slice(0, end).trim();
          finish(() => {
            if (line.endsWith(" OK")) resolve({ ok: true });
            else if (line.endsWith(" FOUND"))
              // The signature name stays in the logs; the member sees a plain reason.
              resolve({
                ok: false,
                reason: "This file was flagged by the malware scan.",
              });
            else reject(new Error(`clamd could not scan: ${line}`));
          });
        });
        socket.on("error", (error) =>
          finish(() => reject(new Error(`clamd unreachable: ${error.message}`)))
        );
        socket.on("close", () =>
          finish(() => reject(new Error("clamd closed without a verdict")))
        );
      });
    },
  };
}

/** `tcp://host[:port]`; clamd's default port is 3310. */
export function parseClamavUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  if (parsed.protocol !== "tcp:")
    throw new Error("CLAMAV_URL must look like tcp://host:3310");
  return { host: parsed.hostname, port: Number(parsed.port || 3310) };
}
