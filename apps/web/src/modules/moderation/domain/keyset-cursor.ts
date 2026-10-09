import { z } from "zod";

/**
 * A keyset position over (created_at DESC, id DESC). Copied from admin, which
 * moderation may not import.
 */
export type KeysetCursor = { createdAt: Date; id: string };

const toBase64Url = (text: string) =>
  btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Opaque, URL-safe. */
export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return toBase64Url(
    JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.id })
  );
}

const cursorShape = z.object({ c: z.iso.datetime(), i: z.uuid() });

/** Null for anything that is not a cursor this module issued. */
export function decodeKeysetCursor(raw: string): KeysetCursor | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const parsed = cursorShape.safeParse(JSON.parse(json));
    return parsed.success
      ? { createdAt: new Date(parsed.data.c), id: parsed.data.i }
      : null;
  } catch {
    return null;
  }
}
