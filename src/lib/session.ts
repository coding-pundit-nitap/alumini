import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth";

/**
 * The only way server code obtains the current user/session (Data Access Layer).
 *
 * Reads the session row from the database on every request (Better Auth's cookie cache is
 * disabled), so a revoked or deleted session is rejected immediately. Memoised per request.
 * Returns null when signed out. This proves identity only; permissions are checked separately
 * by authorize() (docs/rbac-permission-matrix.md).
 */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);
