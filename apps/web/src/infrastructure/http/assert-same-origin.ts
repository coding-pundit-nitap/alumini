import { env } from "@/config/env";
import { AuthorizationError } from "@/lib/errors";

/**
 * CSRF guard for cookie-authenticated mutations on Route Handlers (Server Actions get Next.js's own
 * Origin check; Better Auth checks its own routes). A browser always sends `Origin` on a cross-site POST,
 * so a missing header is a non-browser client (no ambient cookie to abuse) and a foreign one is refused.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  const own = new URL(env.BETTER_AUTH_URL ?? request.url).origin;
  if (origin !== own) {
    throw new AuthorizationError({ code: "ORIGIN_NOT_ALLOWED" });
  }
}
