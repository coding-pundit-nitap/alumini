import { timingSafeEqual } from "node:crypto";

/**
 * Gates health details and `/metrics`. The `checks` detail and the metrics exposition
 * are returned only to the private network or a request carrying the monitoring token.
 * Private-network detection belongs to Nginx and lands with the production proxy config; until
 * then the token, or a non-production environment, is the gate.
 */
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
