import { redact } from "./redact.ts";
import { getRequestContext } from "./request-context.ts";

/**
 * JSON lines to stdout/stderr. `event` is `domain.subject.outcome`, e.g.
 * `auth.login.failed`. Secrets are masked in redact.ts.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type LogThreshold = LogLevel | "silent";

const SEVERITY: Record<LogThreshold, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
  silent: Infinity,
};

export type LogData = {
  error?: unknown;
  metadata?: Record<string, unknown>;
};

export type LoggerOptions = {
  level: LogThreshold;
  service: "web" | "worker";
  env: string;
  version: string;
  /** `pretty` is for local development only; production is always JSON. */
  format?: "json" | "pretty";
  now?: () => Date;
  write?: (stream: "out" | "err", line: string) => void;
};

export type Logger = Record<LogLevel, (event: string, data?: LogData) => void>;

const defaultWrite: NonNullable<LoggerOptions["write"]> = (stream, line) => {
  (stream === "err" ? process.stderr : process.stdout).write(`${line}\n`);
};

function pretty(entry: Record<string, unknown>) {
  const { timestamp, level, event, error, ...rest } = entry;
  const time = String(timestamp).slice(11, 23);
  const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
  const errorText = error ? `\n${JSON.stringify(error, null, 2)}` : "";
  return `${time} ${String(level).toUpperCase().padEnd(5)} ${event}${extra}${errorText}`;
}

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());
  const write = options.write ?? defaultWrite;
  const threshold = SEVERITY[options.level];

  function log(level: LogLevel, event: string, data: LogData = {}) {
    if (SEVERITY[level] < threshold) return;

    // Logging must never break the request it describes.
    try {
      const context = getRequestContext();
      const entry: Record<string, unknown> = {
        timestamp: now().toISOString(),
        level,
        service: options.service,
        env: options.env,
        version: options.version,
        request_id: context?.requestId,
        user_id: context?.userId,
        event,
        error: data.error === undefined ? undefined : redact(data.error),
        metadata:
          data.metadata === undefined ? undefined : redact(data.metadata),
      };
      const line =
        options.format === "pretty"
          ? pretty(JSON.parse(JSON.stringify(entry)))
          : JSON.stringify(entry);
      write(SEVERITY[level] >= SEVERITY.warn ? "err" : "out", line);
    } catch {
      // Swallowed on purpose: there is nowhere safe left to report a logging failure.
    }
  }

  return {
    debug: (event, data) => log("debug", event, data),
    info: (event, data) => log("info", event, data),
    warn: (event, data) => log("warn", event, data),
    error: (event, data) => log("error", event, data),
    fatal: (event, data) => log("fatal", event, data),
  };
}
