import { describe, it, expect } from "vitest";
import { createLogger } from "./logger.ts";
import { runWithRequestContext, setRequestUser } from "./request-context.ts";

function setup(options: Partial<Parameters<typeof createLogger>[0]> = {}) {
  const lines: { stream: "out" | "err"; entry: Record<string, unknown> }[] = [];
  const logger = createLogger({
    level: "debug",
    service: "web",
    env: "test",
    version: "1.2.3",
    now: () => new Date("2026-09-20T12:00:00.000Z"),
    write: (stream, line) => {
      lines.push({ stream, entry: JSON.parse(line) });
    },
    ...options,
  });
  return { logger, lines };
}

describe("logger (reliability §6.1)", () => {
  it("writes one JSON object per line with the fixed fields", () => {
    const { logger, lines } = setup();
    logger.info("connection.request.created", { metadata: { count: 1 } });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.entry).toEqual({
      timestamp: "2026-09-20T12:00:00.000Z",
      level: "info",
      service: "web",
      env: "test",
      version: "1.2.3",
      event: "connection.request.created",
      metadata: { count: 1 },
    });
  });

  it("adds request_id and user_id from the request context", () => {
    const { logger, lines } = setup();
    runWithRequestContext({ requestId: "req-aaaaaaaa" }, () => {
      logger.info("a.b.c");
      setRequestUser("user-1");
      logger.info("a.b.d");
    });
    expect(lines[0]?.entry).toMatchObject({ request_id: "req-aaaaaaaa" });
    expect(lines[0]?.entry).not.toHaveProperty("user_id");
    expect(lines[1]?.entry).toMatchObject({
      request_id: "req-aaaaaaaa",
      user_id: "user-1",
    });
  });

  it("routes warn and above to stderr, the rest to stdout", () => {
    const { logger, lines } = setup();
    logger.debug("a.b.c");
    logger.info("a.b.c");
    logger.warn("a.b.c");
    logger.error("a.b.c");
    logger.fatal("a.b.c");
    expect(lines.map((l) => l.stream)).toEqual([
      "out",
      "out",
      "err",
      "err",
      "err",
    ]);
  });

  it("drops lines below the configured level", () => {
    const { logger, lines } = setup({ level: "warn" });
    logger.debug("a.b.c");
    logger.info("a.b.c");
    logger.warn("a.b.c");
    expect(lines).toHaveLength(1);
  });

  it("logs nothing at level silent", () => {
    const { logger, lines } = setup({ level: "silent" });
    logger.fatal("a.b.c");
    expect(lines).toHaveLength(0);
  });

  it("serialises errors without losing the class or code", () => {
    // A local stand-in for an application error: a named subclass with its own `code` property.
    class CodedError extends Error {
      readonly code: string;
      constructor(message: string, code: string) {
        super(message);
        this.name = "CodedError";
        this.code = code;
      }
    }
    const { logger, lines } = setup();
    logger.error("http.request.failed", {
      error: new CodedError("boom", "SOME_CODE"),
    });
    expect(lines[0]?.entry.error).toMatchObject({
      name: "CodedError",
      message: "boom",
      code: "SOME_CODE",
    });
  });

  it("masks secrets in metadata and errors (central redaction, not convention)", () => {
    const { logger, lines } = setup();
    logger.info("auth.login.failed", {
      metadata: {
        email_hash: "h",
        password: "hunter2",
        headers: { cookie: "s=1" },
      },
      error: Object.assign(new Error("x"), { token: "tok" }),
    });
    const json = JSON.stringify(lines[0]?.entry);
    expect(json).not.toMatch(/hunter2|s=1|tok"/);
    expect(json).toContain("email_hash");
  });

  it("neutralises newline injection because output is JSON, not concatenation", () => {
    const { logger, lines } = setup();
    logger.info("a.b.c", { metadata: { input: 'x\n{"level":"fatal"}' } });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.entry.level).toBe("info");
  });

  it("never throws, even for unserialisable metadata", () => {
    const { logger } = setup();
    const value = { big: BigInt(1) };
    expect(() => logger.info("a.b.c", { metadata: value })).not.toThrow();
  });
});
