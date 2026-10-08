import { toNextJsHandler } from "better-auth/next-js";

import { auth, withSignInMetrics } from "@/modules/auth";

// Better Auth owns everything under /api/auth/*. It is deliberately outside /api/v1
// (docs/api/api-specification.md §4).
const handler = toNextJsHandler(auth);

export const { GET } = handler;
// Sign-ins are counted by outcome for the login-failure alert (R-9).
export const POST = withSignInMetrics(handler.POST);
