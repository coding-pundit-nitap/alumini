import { ValidationError } from "@/lib/errors";

const toBase64Url = (text: string) =>
  btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
};

/**
 * Opaque keyset cursor over `seq` (descending). Not signed: it only narrows
 * what the caller may already read.
 */
export const encodeSeqCursor = (seq: string) =>
  toBase64Url(JSON.stringify({ s: seq }));

export function decodeSeqCursor(raw: string): string {
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as { s?: unknown };
    if (typeof parsed.s !== "string" || !/^\d{1,18}$/.test(parsed.s)) {
      throw new Error("bad shape");
    }
    return parsed.s;
  } catch (error) {
    throw new ValidationError({ code: "INVALID_CURSOR", cause: error });
  }
}
