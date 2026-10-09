/** Dependency-free: imported by both the proxy and next.config.ts. */

/** The request header the proxy uses to hand the nonce to the root layout. */
export const NONCE_HEADER = "x-nonce";

/** A fresh, unguessable nonce for one response (128 random bits, base64). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Scripts run only with this response's nonce or via 'strict-dynamic'. `unsafe-eval` is dev-only.
 * Inline styles are allowed because server-rendered `style` attributes cannot carry a nonce.
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

/** None when S3_PUBLIC_PATH proxies storage through this origin; otherwise S3_ENDPOINT's origin. */
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

/** API, health and metrics responses never render HTML, so nothing may load from them. */
export const NON_PAGE_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Paths whose responses are data, not pages. */
export function isNonPagePath(pathname: string): boolean {
  return /^\/(api|health|metrics)(\/|$)/.test(pathname);
}

/** Sent on every response, static assets included. HSTS only in production. */
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
