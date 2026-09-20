import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Better Auth owns everything under /api/auth/*. It is deliberately outside /api/v1
// (docs/api-specification.md §4).
export const { GET, POST } = toNextJsHandler(auth);
