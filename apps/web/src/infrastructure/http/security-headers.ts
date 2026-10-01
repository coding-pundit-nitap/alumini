/**
 * Response security headers (strategy §10.1 "Headers", spec 16 SD-1…SD-3). Dependency-free on purpose:
 * both the proxy (per request) and next.config.ts (static headers, read at build and start) import it.
 */

/** The request header the proxy uses to hand the nonce to the root layout. */
export const NONCE_HEADER = "x-nonce";

/** A fresh, unguessable nonce for one response (128 random bits, base64). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The page policy. Scripts run only with this response's nonce, or when loaded by a script that had it
 * ('strict-dynamic'); `unsafe-eval` is added under `next dev` only, where React needs it for error stacks.
 * Styles allow inline (SD-2): server-rendered `style` attributes cannot carry a nonce.
 */
export function buildPageCsp(options: {
  nonce: string;
  dev: boolean;
  /** The object store's origin when the browser talks to it directly (presigned uploads and photos). */
  storageOrigin?: string | null;
}): string {
  const storage = options.storageOrigin ? [options.storageOrigin] : [];
  const scriptSrc = [
    "'self'",
    `'nonce-${options.nonce}'`,
    "'strict-dynamic'",
    ...(options.dev ? ["'unsafe-eval'"] : []),
  ];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' blob: data:", ...storage].join(" "),
    "font-src 'self'",
    ["connect-src 'self'", ...storage].join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Where the browser reaches the object store. None when S3_PUBLIC_PATH proxies it through this origin
 * (next.config rewrites); otherwise S3_ENDPOINT's origin, with the bucket as a subdomain unless path-style.
 */
export function storageOriginFor(
  source: Record<string, string | undefined>
): string | null {
  const { S3_ENDPOINT, S3_PUBLIC_PATH, S3_BUCKET, S3_FORCE_PATH_STYLE } =
    source;
  if (S3_PUBLIC_PATH || !S3_ENDPOINT) return null;
  try {
    const endpoint = new URL(S3_ENDPOINT);
    if (S3_FORCE_PATH_STYLE === "true" || !S3_BUCKET) return endpoint.origin;
    return `${endpoint.protocol}//${S3_BUCKET}.${endpoint.host}`;
  } catch {
    return null;
  }
}

/** API, health and metrics responses never render HTML, so nothing may load from them (SD-1). */
export const NON_PAGE_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Paths whose responses are data, not pages. */
export function isNonPagePath(pathname: string): boolean {
  return /^\/(api|health|metrics)(\/|$)/.test(pathname);
}

/** Sent on every response, static assets included (SD-3). HSTS only in production (NFR-SEC-003). */
export function staticSecurityHeaders(options: {
  production: boolean;
}): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    // For browsers that predate CSP frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(options.production
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ]
      : []),
  ];
}
