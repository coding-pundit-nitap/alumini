import { ValidationError } from "@/lib/errors";

export type ListCursor = { requestedAt: Date; id: string };

const toBase64Url = (text: string) =>
  btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
};

/** Opaque keyset cursor over (requested_at DESC, id ASC). Not signed: it only narrows the caller's own list. */
export function encodeCursor(cursor: ListCursor): string {
  return toBase64Url(
    JSON.stringify({ t: cursor.requestedAt.toISOString(), i: cursor.id })
  );
}

export function decodeCursor(raw: string): ListCursor {
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as {
      t?: unknown;
      i?: unknown;
    };
    const requestedAt = new Date(String(parsed.t));
    if (
      typeof parsed.t !== "string" ||
      typeof parsed.i !== "string" ||
      Number.isNaN(requestedAt.getTime())
    ) {
      throw new Error("bad shape");
    }
    return { requestedAt, id: parsed.i };
  } catch (error) {
    throw new ValidationError({ code: "INVALID_CURSOR", cause: error });
  }
}
