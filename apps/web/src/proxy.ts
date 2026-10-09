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
 * 1. Sets the request id, reusing a well-formed incoming one.
 * 2. Redirects anonymous requests for gated pages to /login. Checks only that a session cookie
 *    exists; pages and use cases still authorize.
 * 3. Sets the CSP with a fresh nonce for pages and a load-nothing policy for data paths.
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
