import { timingSafeEqual } from "node:crypto";

/** Health details and `/metrics` require the monitoring token in production. */
export function canSeeHealthDetails(
  request: Request,
  options: { nodeEnv: string; token?: string }
): boolean {
  if (options.nodeEnv !== "production") return true;
  if (!options.token) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(options.token);
  return a.length === b.length && timingSafeEqual(a, b);
}
