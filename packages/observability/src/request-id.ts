/**
 * Request-id validation. No Node imports: `proxy.ts` uses this too.
 * A client-supplied id is accepted only if it cannot inject text into logs or traces.
 */
export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export function isValidRequestId(value: string): boolean {
  return REQUEST_ID_PATTERN.test(value);
}

/** Reuses a well-formed incoming id, otherwise generates a UUID. */
export function resolveRequestId(incoming?: string | null): string {
  return incoming && isValidRequestId(incoming)
    ? incoming
    : crypto.randomUUID();
}
