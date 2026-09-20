import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { env } from "@/config/env";
import { logger } from "@/infrastructure/observability";
import { sendEmail } from "@/infrastructure/email/send-email";
import { prisma } from "@/infrastructure/database/client";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";

/**
 * Authentication only (who you are, is the session valid). Authorization - roles, permissions,
 * chapter scopes - is our own model and is deliberately NOT delegated to Better Auth's admin or
 * organization plugins. See docs/adr/ADR-005-authentication.md.
 */

const baseURL = env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL;

/** Log-and-continue: never await email delivery in a request (avoids timing-based account enumeration). */
function sendInBackground(email: Parameters<typeof sendEmail>[0]) {
  void sendEmail(email).catch((error: unknown) => {
    // No recipient address in the log line (reliability §6.4: identifiers and outcomes, not emails).
    logger.error("auth.email.send_failed", { error });
  });
}

export const auth = betterAuth({
  appName: "NIT Arunachal Pradesh Alumni Network",
  baseURL,
  trustedOrigins: [baseURL],

  // One Prisma 7 client for the whole app; Prisma Migrate owns the schema.
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  }),
  advanced: {
    database: { generateId: "uuid" },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      sendInBackground({
        to: user.email,
        subject: "Reset your alumni network password",
        text: `Reset your password using this link (valid for 1 hour):\n${url}\n\nIf you did not request this, ignore this email.`,
      });
    },
    // Enumeration protection: a sign-up with an existing email looks identical to a real one;
    // the real owner is told instead.
    onExistingUserSignUp: async ({ user }) => {
      sendInBackground({
        to: user.email,
        subject: "Someone tried to register with your email",
        text: "An account with this email already exists. If this was you, sign in or reset your password.",
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendInBackground({
        to: user.email,
        subject: "Verify your email for the alumni network",
        text: `Confirm your email address using this link (valid for 1 hour):\n${url}`,
      });
    },
  },

  user: {
    additionalFields: {
      // Set only by the server (verification workflow, admin actions), never by a client.
      accountState: {
        type: "string",
        required: false,
        defaultValue: "PENDING",
        input: false,
      },
      deactivatedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // absolute lifetime: 30 days
    updateAge: 60 * 60 * 24, // slide the expiry at most once a day
    freshAge: 60 * 15, // "recently signed in" window for sensitive actions
    // Off on purpose: a cached session cookie would keep working after suspension or revocation.
    cookieCache: { enabled: false },
  },

  // Enforced by default only in production. Counters live in Redis (atomic, shared by every instance);
  // if Redis is unreachable a stricter per-instance in-memory limiter takes over. Not in the database.
  rateLimit: {
    customStorage: redisRateLimitStorage,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60 * 60, max: 5 },
      "/request-password-reset": { window: 60 * 60, max: 5 },
      "/send-verification-email": { window: 60 * 60, max: 5 },
    },
  },

  databaseHooks: {
    session: {
      create: {
        // DEACTIVATED accounts cannot sign in (reactivation is a separate flow). PENDING, REJECTED
        // and SUSPENDED accounts can, so they can see their status; authorize() gates every action.
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { accountState: true },
          });

          if (user?.accountState === "DEACTIVATED") {
            throw APIError.from("FORBIDDEN", {
              message: "This account has been deactivated.",
              code: "ACCOUNT_DEACTIVATED",
            });
          }
        },
      },
    },
  },

  // Must be the last plugin: lets Server Actions set the session cookie.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
