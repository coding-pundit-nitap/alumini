import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@nitap/observability/request-id";
import {
  NON_PAGE_CSP,
  NONCE_HEADER,
  buildPageCsp,
  createNonce,
  isNonPagePath,
  storageOriginFor,
} from "@/infrastructure/http/security-headers";
import { isPublicPath, safeNextPath } from "@/lib/route-access";

/**
 * Next.js 16 proxy (formerly middleware). Three jobs, all cheap:
 *
 * 1. Assigns the request id: a well-formed incoming id is reused, anything else is
 *    replaced. It runs apart from the render code and must not rely on shared modules or globals, so
 *    the id travels in headers; `routeHandler` reads it from there.
 * 2. Optimistic auth redirect: an anonymous request for a gated page goes to
 *    /login. It checks that a session cookie is PRESENT and nothing more: no database, no signature
 *    check, no authorization. Every page and handler still calls getActor(), and every use case still
 *    calls authorize(). `/health/*` and `/api/*` are never redirected (see lib/route-access.ts).
 * 3. Content Security Policy: a page gets a policy with a fresh nonce, which Next.js reads
 *    from the forwarded request header and stamps on its own scripts (the root layout passes it to the
 *    theme script). Data paths get a policy that loads nothing. The static headers are in next.config.ts.
 */
export function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const { pathname, search } = request.nextUrl;
  const nonce = isNonPagePath(pathname) ? null : createNonce();
  const csp =
    nonce === null
      ? NON_PAGE_CSP
      : buildPageCsp({
          nonce,
          dev: process.env.NODE_ENV === "development",
          storageOrigin: storageOriginFor(process.env),
        });

  if (!isPublicPath(pathname) && !getSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", safeNextPath(`${pathname}${search}`));
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  // Never a client's: the nonce and policy the render sees are the ones generated here.
  headers.delete(NONCE_HEADER);
  headers.set("Content-Security-Policy", csp);
  if (nonce !== null) headers.set(NONCE_HEADER, nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
