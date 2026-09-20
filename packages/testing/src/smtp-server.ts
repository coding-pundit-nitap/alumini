import { SMTPServer } from "smtp-server";

export type SmtpMode =
  | "accept"
  | "reject-transient" // 451: the sender should retry
  | "reject-permanent" // 550: the sender should give up
  | "hang"; // never answers RCPT TO, to prove timeouts

export type ReceivedMail = { from: string; to: string[]; raw: string };

export type SmtpTestServer = {
  /** `smtp://127.0.0.1:<port>`; no TLS, no auth. */
  url: string;
  received: ReceivedMail[];
  setMode(mode: SmtpMode): void;
  close(): Promise<void>;
};

/** A real in-process SMTP server whose behaviour tests can switch, so email failures are deterministic. */
export async function startSmtpTestServer(
  initial: SmtpMode = "accept"
): Promise<SmtpTestServer> {
  let mode: SmtpMode = initial;
  const received: ReceivedMail[] = [];
  const hung: Array<() => void> = [];

  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS", "AUTH"],
    onRcptTo(_address, _session, callback) {
      if (mode === "reject-transient") {
        return callback(
          Object.assign(new Error("Try again later"), { responseCode: 451 })
        );
      }
      if (mode === "reject-permanent") {
        return callback(
          Object.assign(new Error("Mailbox unavailable"), {
            responseCode: 550,
          })
        );
      }
      if (mode === "hang") {
        hung.push(() => callback());
        return;
      }
      callback();
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        received.push({
          from: session.envelope.mailFrom
            ? session.envelope.mailFrom.address
            : "",
          to: session.envelope.rcptTo.map((r) => r.address),
          raw: Buffer.concat(chunks).toString("utf8"),
        });
        callback();
      });
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `smtp://127.0.0.1:${port}`,
    received,
    setMode(next) {
      mode = next;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const release of hung.splice(0)) release();
        server.close(() => resolve());
      }),
  };
}
