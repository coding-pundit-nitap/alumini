import { ValidationError } from "@/lib/errors";

export type ListCursor = { key: string; id: string };

const toBase64Url = (text: string) =>
  btoa(unescape(encodeURIComponent(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(
    escape(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)))
  );
};

/**
 * Opaque keyset cursor: a sort key (an ISO time, for events) and the row id.
 * Not signed: it only narrows a list already filtered by visibility.
 */
export function encodeCursor(cursor: ListCursor): string {
  return toBase64Url(JSON.stringify({ k: cursor.key, i: cursor.id }));
}

export function decodeCursor(raw: string): ListCursor {
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as {
      k?: unknown;
      i?: unknown;
    };
    if (typeof parsed.k !== "string" || typeof parsed.i !== "string") {
      throw new Error("bad shape");
    }
    return { key: parsed.k, id: parsed.i };
  } catch (error) {
    throw new ValidationError({ code: "INVALID_CURSOR", cause: error });
  }
}
