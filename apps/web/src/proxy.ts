import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@/infrastructure/observability/request-id";

/**
 * Next.js 16 proxy (formerly middleware). Assigns the request id (reliability §6.2): a well-formed
 * incoming id is reused, anything else is replaced. It runs apart from the render code and must not
 * rely on shared modules or globals, so the id travels in headers; `routeHandler` reads it from there.
 *
 * Deliberately narrow for now. Security headers and the optimistic auth redirect land with Phase 2;
 * `/health/*` must stay excluded from that redirect (reliability §4.1 rule 5).
 */
export function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
