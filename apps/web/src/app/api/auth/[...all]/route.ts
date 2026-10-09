import { toNextJsHandler } from "better-auth/next-js";

import { auth, withSignInMetrics } from "@/modules/auth";

// Better Auth owns everything under /api/auth/*. It is deliberately outside /api/v1.
const handler = toNextJsHandler(auth);

export const { GET } = handler;
export const POST = withSignInMetrics(handler.POST);
