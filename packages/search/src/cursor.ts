import type { Sort } from "./query.ts";

/** A tampered, foreign or stale cursor. The web layer maps it to `400 INVALID_CURSOR`. */
export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid pagination cursor");
    this.name = "InvalidCursorError";
  }
}

/** The position after the last row of a page: its sort key (always text on the wire) and its id. */
export type CursorPosition = { value: string; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALUE_SHAPE: Record<Sort, RegExp> = {
  relevance: /^\d{1,3}(\.\d{1,6})?$/,
  name: /^.{0,200}$/s,
  graduationYear: /^-?\d{1,5}$/,
  "-graduationYear": /^-?\d{1,5}$/,
};

/** Not signed: visibility is already applied, so a forged cursor can only skip rows, never reveal them. */
export function encodeCursor(sort: Sort, position: CursorPosition): string {
  return Buffer.from(
    JSON.stringify({ s: sort, v: position.value, i: position.id })
  ).toString("base64url");
}

export function decodeCursor(raw: string, sort: Sort): CursorPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError();
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidCursorError();
  }
  const { s, v, i } = parsed as Record<string, unknown>;
  if (
    s !== sort ||
    typeof v !== "string" ||
    typeof i !== "string" ||
    !UUID.test(i) ||
    !VALUE_SHAPE[sort].test(v)
  ) {
    throw new InvalidCursorError();
  }
  return { value: v, id: i };
}
