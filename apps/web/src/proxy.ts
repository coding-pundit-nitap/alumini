import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@nitap/observability/request-id";
import { isPublicPath, safeNextPath } from "@/lib/route-access";

/**
 * Next.js 16 proxy (formerly middleware). Two jobs, both cheap:
 *
 * 1. Assigns the request id (reliability §6.2): a well-formed incoming id is reused, anything else is
 *    replaced. It runs apart from the render code and must not rely on shared modules or globals, so
 *    the id travels in headers; `routeHandler` reads it from there.
 * 2. Optimistic auth redirect (ADR-005 §2, TDS §7.5): an anonymous request for a gated page goes to
 *    /login. It checks that a session cookie is PRESENT and nothing more: no database, no signature
 *    check, no authorization. Every page and handler still calls getActor(), and every use case still
 *    calls authorize(). `/health/*` and `/api/*` are never redirected (see lib/route-access.ts).
 */
export function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const { pathname, search } = request.nextUrl;

  if (!isPublicPath(pathname) && !getSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", safeNextPath(`${pathname}${search}`));
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
