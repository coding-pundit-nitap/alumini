/**
 * Central redaction for logs and the error tracker's `beforeSend` (reliability §6.4).
 * Enforced here, not by convention: anything under a secret-bearing key is masked at any depth.
 */
export const REDACTED = "[REDACTED]";

const MAX_DEPTH = 8;

// Compared against the lower-cased key with `-`/`_` removed, so `set-cookie`, `api_key` and `apiKey` all match.
const SENSITIVE_KEY =
  /(password|passwd|token|secret|authorization|cookie|apikey|credential|privatekey)|^(body|requestbody|messagebody)$|(reset|verification|verify|magic|invite)(link|url)$|^(to|recipient|recipients|email)$/;

function isSensitiveKey(key: string) {
  return SENSITIVE_KEY.test(key.toLowerCase().replace(/[-_]/g, ""));
}

function redactValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol")
    return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();

  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[Truncated]";
  seen.add(value);

  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map((item) => redactValue(item, depth + 1, seen));
  } else {
    const source: Record<string, unknown> = { ...value };
    if (value instanceof Error) {
      // name, message, stack and cause are non-enumerable on Error, so copy them explicitly.
      Object.assign(source, {
        name: value.name,
        message: value.message,
        stack: value.stack,
        ...(value.cause !== undefined ? { cause: value.cause } : {}),
      });
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      out[key] = isSensitiveKey(key)
        ? REDACTED
        : redactValue(item, depth + 1, seen);
    }
    result = out;
  }

  seen.delete(value);
  return result;
}

/** Returns a JSON-safe copy of `value` with secret-bearing keys masked. Never mutates the input. */
export function redact(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet());
}
