import { ValidationError } from "@/lib/errors";

/** Keyset cursor over (createdAt desc, id) — same shape as connections/mentorship/messaging. */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString(
    "base64url"
  );
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const [iso, id] = decoded.split("|");
  const createdAt = iso ? new Date(iso) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
    throw new ValidationError({ code: "INVALID_CURSOR" });
  }
  return { createdAt, id };
}
