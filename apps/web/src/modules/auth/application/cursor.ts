import { ValidationError } from "@/lib/errors";

export type PageCursor = { createdAt: Date; id: string };

const toBase64Url = (text: string) =>
  btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
};

/** Opaque, URL-safe keyset cursor over (created_at, id). */
export function encodeCursor(cursor: PageCursor): string {
  return toBase64Url(
    JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.id })
  );
}

export function decodeCursor(raw: string): PageCursor {
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as {
      c?: unknown;
      i?: unknown;
    };
    const createdAt = new Date(String(parsed.c));
    if (
      typeof parsed.c !== "string" ||
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
