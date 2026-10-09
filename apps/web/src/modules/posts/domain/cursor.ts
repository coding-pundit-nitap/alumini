import { ValidationError } from "@/lib/errors";

export type FeedCursor = { createdAt: Date; id: string };

const toBase64Url = (text: string) =>
  btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
};

/** Opaque keyset cursor over (created_at DESC, id ASC), the feed's order. Not signed. */
export function encodeFeedCursor(cursor: FeedCursor): string {
  return toBase64Url(
    JSON.stringify({ t: cursor.createdAt.toISOString(), i: cursor.id })
  );
}

export function decodeFeedCursor(raw: string): FeedCursor {
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as {
      t?: unknown;
      i?: unknown;
    };
    const createdAt = new Date(String(parsed.t));
    if (
      typeof parsed.t !== "string" ||
      typeof parsed.i !== "string" ||
      Number.isNaN(createdAt.getTime())
    ) {
      throw new Error("bad shape");
    }
    return { createdAt, id: parsed.i };
  } catch (error) {
    throw new ValidationError({ code: "INVALID_CURSOR", cause: error });
  }
}
