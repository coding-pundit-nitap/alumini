/**
 * Paths anonymous users may load. proxy.ts only uses this to skip rendering gated pages; it never
 * authorizes. `/api` handlers answer 401 themselves, and `/health` must stay reachable for probes.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/health",
  // Prometheus scrapes; the route gates itself.
  "/metrics",
  "/api",
  // Supporting pages; the footer links them for everyone.
  "/terms",
  "/contact",
  // Guests may view a PUBLIC profile; the page itself answers 404 for anything else.
  "/members",
  // Social crawlers fetch this with no session cookie when a link is shared.
  "/opengraph-image",
  // S3_PUBLIC_PATH, proxied to object storage (app/storage/[...path]); every URL there is presigned.
  "/storage",
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

/** Where a signed-in person goes when `next` is absent or unsafe. */
const FALLBACK = "/dashboard";

/** Keeps only same-origin absolute paths; anything a browser could read as another origin becomes `FALLBACK`. */
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
