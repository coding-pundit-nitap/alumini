import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "@nitap/database";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { logger } from "@/infrastructure/observability";

import type { ApplyEmailVerification } from "../application/apply-email-verification";
import {
  AUTH_LINK_TTL_MINUTES,
  type AuthEmailSender,
} from "../application/auth-emails";
import type { ProvisionMember } from "../application/provision-member";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../domain/password-policy";

type RateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

export type AuthDeps = {
  prisma: PrismaClient;
  baseURL: string;
  /** Falls back to BETTER_AUTH_SECRET when omitted. Tests pass one. */
  secret?: string;
  authEmails: AuthEmailSender;
  provisionMember: ProvisionMember;
  applyEmailVerification: ApplyEmailVerification;
  /** Omitted: Better Auth's defaults (enforced only in production, in memory). */
  rateLimit?: { enabled?: boolean; storage: RateLimitStorage };
  /** Default true. Tests call `auth.api` outside a Next.js request, where cookies() is unavailable. */
  nextCookies?: boolean;
};

const LINK_TTL_SECONDS = AUTH_LINK_TTL_MINUTES * 60;

/**
 * The Better Auth endpoints this app uses. Every /api/auth path is public, so the rest are
 * switched off: change-email would skip the institutional policy, delete-user would hard-delete an
 * audited account, change-password lets the client keep other sessions alive, and the social/OAuth and
 * session-management endpoints back no feature. A test fails when Better Auth adds a path not classified here.
 */
export const ENABLED_AUTH_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-out",
  "/get-session",
  "/send-verification-email",
  "/verify-email",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/ok",
  "/error",
] as const;

export const DISABLED_AUTH_PATHS = [
  "/account-info",
  "/callback/:id",
  "/change-email",
  "/change-password",
  "/delete-user",
  "/delete-user/callback",
  "/get-access-token",
  "/link-social",
  "/list-accounts",
  "/list-sessions",
  "/refresh-token",
  "/revoke-other-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/sign-in/social",
  "/unlink-account",
  "/update-session",
  "/update-user",
  "/verify-password",
];

/**
 * Authentication only (who you are, is the session valid). Authorization is our own model and is
 * deliberately NOT delegated to Better Auth's admin or organization plugins. Every hook and
 * callback here delegates to a use case; the logic lives there and is tested there.
 *
 * Better Auth runs `create.after` hooks AFTER the user transaction commits, so provisioning is
 * idempotent and repaired by getActor() rather than atomic with the insert.
 */
export function createAuth(deps: AuthDeps) {
  const plugins = deps.nextCookies === false ? [] : [nextCookies()];

  return betterAuth({
    appName: "NIT Arunachal Pradesh Alumni Network",
    baseURL: deps.baseURL,
    trustedOrigins: [deps.baseURL],
    ...(deps.secret ? { secret: deps.secret } : {}),

    // One Prisma 7 client for the whole app; Prisma Migrate owns the schema.
    database: prismaAdapter(deps.prisma, {
      provider: "postgresql",
      transaction: true,
    }),
    advanced: {
      database: { generateId: "uuid" },
      // Origin and CSRF checks stay ON. Stated explicitly because Better Auth's default for the
      // origin check is `isTest()`, which would silently switch it off under NODE_ENV=test.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: LINK_TTL_SECONDS,
      // Each callback awaits exactly one outbox write, so the existing-account path takes the same
      // shape as the new-account path (enumeration protection).
      sendResetPassword: async ({ user, url }) => {
        await deps.authEmails.passwordReset(user.email, url);
      },
      // A sign-up with an existing email looks identical to a real one; the real owner is told instead.
      onExistingUserSignUp: async ({ user }) => {
        await deps.authEmails.existingAccount(user.email);
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: LINK_TTL_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await deps.authEmails.verification(user.email, url);
      },
      afterEmailVerification: async (user) => {
        // Better Auth does not call this again for an already-verified email, so a failure here is
        // repaired by getActor() for PENDING accounts. Never fail the confirmation itself.
        try {
          const result = await deps.applyEmailVerification(user.id);
          if (result.outcome === "verified") {
            logger.info("auth.member.verified", {
              metadata: { userId: user.id, role: result.role },
            });
          }
          await deps.provisionMember(user.id);
        } catch (error) {
          logger.error("auth.email_verification.apply_failed", {
            error,
            metadata: { userId: user.id },
          });
        }
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

    // Enforced by default only in production. Counters live in Redis (atomic, shared by every
    // instance); if Redis is unreachable a stricter per-instance limiter takes over.
    rateLimit: {
      ...(deps.rateLimit?.enabled !== undefined
        ? { enabled: deps.rateLimit.enabled }
        : {}),
      ...(deps.rateLimit ? { customStorage: deps.rateLimit.storage } : {}),
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60 * 60, max: 5 },
        "/request-password-reset": { window: 60 * 60, max: 5 },
        "/send-verification-email": { window: 60 * 60, max: 5 },
      },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // The user is already committed. A failure must not fail the sign-up: the profile is
            // created by the next getActor() (self-healing), and this line makes the gap visible.
            try {
              await deps.provisionMember(user.id);
            } catch (error) {
              logger.error("auth.provision.failed", {
                error,
                metadata: { userId: user.id },
              });
            }
          },
        },
      },
      session: {
        create: {
          // DEACTIVATED accounts cannot sign in (reactivation is a separate flow). PENDING, REJECTED
          // and SUSPENDED accounts can, so they can see their status; authorize() gates every action.
          before: async (session) => {
            const user = await deps.prisma.user.findUnique({
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

    disabledPaths: DISABLED_AUTH_PATHS,

    // Must be the last plugin: lets Server Actions set the session cookie.
    plugins,
  });
}
