import "server-only";

import { env } from "@/config/env";
import { prisma } from "@/infrastructure/database/client";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";

import { createAuth } from "./auth-factory";
import {
  applyEmailVerification,
  authEmails,
  provisionMember,
} from "./composition";

export const auth = createAuth({
  prisma,
  baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL,
  authEmails,
  provisionMember,
  applyEmailVerification,
  rateLimit: { storage: redisRateLimitStorage },
});

export type Session = typeof auth.$Infer.Session;
