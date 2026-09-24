/**
 * Which paths anonymous users may load (TDS §7.5). Used by proxy.ts, which is optimistic only: it
 * never authorizes, it just saves rendering a gated page for someone with no session cookie.
 * Extend the list in the same change that adds a public page.
 *
 * `/api` is public HERE because handlers answer 401 themselves; redirecting a fetch() to an HTML login
 * page would only confuse API clients. `/health` must stay reachable for probes (reliability §4.1).
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/health",
  // Prometheus scrapes; the route gates itself (spec 13A A-6).
  "/metrics",
  "/api",
  // Guests may view a PUBLIC profile (FR-DIR-004); the page itself answers 404 for anything else.
  "/members",
] as const;

const FILE_EXTENSION = /\.[A-Za-z0-9]+$/;

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  // Static files (robots.txt, images); real pages have no extension.
  if (FILE_EXTENSION.test(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** H-3: where a signed-in person goes when `next` is absent or unsafe. */
const FALLBACK = "/dashboard";

/**
 * Validates a post-login `next` target. Only a same-origin absolute path is kept; anything a browser
 * could read as another origin (`//host`, `/\host`, a scheme, control characters that browsers strip
 * from URLs) becomes `FALLBACK`.
 */
export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate) return FALLBACK;
  if (!candidate.startsWith("/")) return FALLBACK;
  if (candidate.startsWith("//") || candidate.startsWith("/\\"))
    return FALLBACK;
  if ([...candidate].some((character) => character.charCodeAt(0) < 0x20)) {
    return FALLBACK;
  }
  return candidate;
}
