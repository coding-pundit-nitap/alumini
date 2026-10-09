import { env } from "@/config/env";
import { AuthorizationError } from "@/lib/errors";

/**
 * CSRF guard for cookie-authenticated Route Handlers. Browsers always send
 * `Origin` cross-site, so a missing header means a non-browser client.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  const own = new URL(env.BETTER_AUTH_URL ?? request.url).origin;
  if (origin !== own) {
    throw new AuthorizationError({ code: "ORIGIN_NOT_ALLOWED" });
  }
}
