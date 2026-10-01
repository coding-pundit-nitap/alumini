// TASK.md Phase 12, spec A12-10: every administrative action × every role × {allowed, denied, unauthenticated}.
// Composed with role-matrix.integration.test.ts (role → permission against the seeded database), this proves
// action × role. Each use case runs with the real authorize() and a tripwire store: reaching the store means
// authorization let the call through.
import { describe, expect, it } from "vitest";

import { PERMISSIONS, type Permission } from "@nitap/database/permissions";
import { ROLE_NAMES, ROLE_PERMISSIONS } from "@nitap/database/role-permissions";

import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";
import {
  ADMIN_PERMISSIONS,
  createAssignRole,
  createChangeAccountState,
  createGetAnalytics,
  createGetDashboard,
  createGetUser,
  createGrantPermission,
  createListAuditLog,
  createListUsers,
  createRevokeGrant,
  createRevokeRole,
} from "@/modules/admin";
import type { Actor } from "@/modules/auth";
import { createAuthorization } from "@/modules/auth/application/authorize";
import { createDecideVerificationRequest } from "@/modules/auth/application/decide-verification-request";
import { createListPendingVerificationRequests } from "@/modules/auth/application/list-pending-verification-requests";
import { createListPendingAchievements } from "@/modules/achievements/application/list-pending-achievements";
import { createReviewAchievement } from "@/modules/achievements/application/review-achievement";
import { createApproveJob } from "@/modules/jobs/application/approve-job";
import { createListPendingJobs } from "@/modules/jobs/application/list-pending-jobs";
import { createRejectJob } from "@/modules/jobs/application/reject-job";
import { createClaimReport } from "@/modules/moderation/application/claim-report";
import { createDismissReport } from "@/modules/moderation/application/dismiss-report";
import { createGetReport } from "@/modules/moderation/application/get-report";
import { createListReports } from "@/modules/moderation/application/list-reports";
import { createResolveReport } from "@/modules/moderation/application/resolve-report";
import { createReadReportedMessage } from "@/modules/messaging/application/read-reported-message";
import { createReplayNotifications } from "@/modules/notifications/application/replay-notifications";
import { createPublishAnnouncement } from "@/modules/posts/application/publish-announcement";
import { createRemoveAnnouncement } from "@/modules/posts/application/remove-announcement";
import { createListFailedDeliveries } from "@/modules/notifications/application/list-failed-deliveries";

import { readRoleMatrixFromDoc } from "../support/rbac-matrix-doc";

/** Thrown by any dependency the use case touches after authorization passed. */
class ReachedStore extends Error {}

/** Any property read or call throws ReachedStore. Typed `never` so it stands in for any dependency. */
const tripwire = (): never =>
  new Proxy(function () {}, {
    get: (_target, prop) => {
      if (prop === "then") return undefined; // not a thenable, so `await tripwire()` is not a read
      throw new ReachedStore(String(prop));
    },
    apply: () => {
      throw new ReachedStore("call");
    },
  }) as never;

const ID = "00000000-0000-4000-8000-000000000001";
const { authorize, can } = createAuthorization({
  observer: { record() {} },
  now: () => new Date(),
});
type Run = (actor: Actor | null) => Promise<unknown>;

/** Every admin action, the permission it needs, and how to invoke it. Later sub-phases append here. */
const ADMIN_ACTIONS: ReadonlyArray<{
  name: string;
  permission: Permission;
  run: Run;
}> = [
  {
    name: "approveJob",
    permission: PERMISSIONS.JOB_APPROVE,
    run: (actor) =>
      createApproveJob({ store: tripwire(), authorize })({ actor, jobId: ID }),
  },
  {
    name: "rejectJob",
    permission: PERMISSIONS.JOB_APPROVE,
    run: (actor) =>
      createRejectJob({ store: tripwire(), authorize })({
        actor,
        jobId: ID,
        input: { reviewNote: "Needs a salary range" },
      }),
  },
  {
    name: "listPendingJobs",
    permission: PERMISSIONS.JOB_APPROVE,
    run: (actor) =>
      createListPendingJobs({ queries: tripwire(), authorize })({ actor }),
  },
  {
    name: "reviewAchievement",
    permission: PERMISSIONS.ACHIEVEMENT_REVIEW,
    run: (actor) =>
      createReviewAchievement({ store: tripwire(), authorize })({
        actor,
        achievementId: ID,
        outcome: "approve",
      }),
  },
  {
    name: "listPendingAchievements",
    permission: PERMISSIONS.ACHIEVEMENT_REVIEW,
    run: (actor) =>
      createListPendingAchievements({ store: tripwire(), authorize })({
        actor,
      }),
  },
  {
    name: "claimReport",
    permission: PERMISSIONS.REPORT_REVIEW,
    run: (actor) =>
      createClaimReport({ store: tripwire(), authorize })({
        actor,
        reportId: ID,
      }),
  },
  {
    name: "resolveReport",
    permission: PERMISSIONS.REPORT_REVIEW,
    run: (actor) =>
      createResolveReport({ store: tripwire(), authorize })({
        actor,
        reportId: ID,
        input: { reason: "SPAM" },
      }),
  },
  {
    name: "dismissReport",
    permission: PERMISSIONS.REPORT_REVIEW,
    run: (actor) =>
      createDismissReport({ store: tripwire(), authorize })({
        actor,
        reportId: ID,
        input: { reason: "NO_VIOLATION" },
      }),
  },
  {
    name: "listReports",
    permission: PERMISSIONS.REPORT_REVIEW,
    run: (actor) =>
      createListReports({ store: tripwire(), authorize })({ actor, query: {} }),
  },
  {
    name: "getReport",
    permission: PERMISSIONS.REPORT_REVIEW,
    run: (actor) =>
      createGetReport({ store: tripwire(), authorize })({
        actor,
        reportId: ID,
      }),
  },
  {
    name: "readReportedMessage",
    permission: PERMISSIONS.MESSAGE_READ_REPORTED,
    run: (actor) =>
      createReadReportedMessage({ store: tripwire(), authorize })({
        actor,
        reportId: ID,
      }),
  },
  {
    name: "decideVerification",
    permission: PERMISSIONS.ALUMNI_VERIFY,
    run: (actor) =>
      createDecideVerificationRequest({
        store: tripwire(),
        authorize,
        now: () => new Date(),
        approvalRole: "ALUMNI",
      })({ actor, requestId: ID, decision: "APPROVED" }),
  },
  {
    name: "listPendingVerifications",
    permission: PERMISSIONS.ALUMNI_VERIFY,
    run: (actor) =>
      createListPendingVerificationRequests({ store: tripwire(), authorize })({
        actor,
      }),
  },
  {
    name: "replayNotification",
    permission: PERMISSIONS.NOTIFICATION_REPLAY,
    run: (actor) =>
      createReplayNotifications({
        authorize,
        queueAdmin: tripwire(),
        failedEmailJobId: tripwire(),
        audit: tripwire(),
      }).replay({ actor, notificationId: ID }),
  },
  {
    name: "listFailedDeliveries",
    permission: PERMISSIONS.NOTIFICATION_REPLAY,
    run: (actor) =>
      createListFailedDeliveries({
        store: tripwire(),
        authorize,
        now: () => new Date(),
      })({ actor }),
  },
  {
    name: "listAuditLog",
    permission: PERMISSIONS.AUDIT_READ,
    run: (actor) =>
      createListAuditLog({ store: tripwire(), authorize })({
        actor,
        query: {},
      }),
  },
  {
    name: "getAnalytics",
    permission: PERMISSIONS.ANALYTICS_VIEW,
    // Sections load under Promise.allSettled: rethrow from onSectionFailed so reaching the store is observed.
    run: (actor) =>
      createGetAnalytics({
        store: tripwire(),
        authorize,
        can,
        onSectionFailed: (_key, error) => {
          throw error;
        },
      })({ actor }),
  },
  {
    name: "publishAnnouncement",
    permission: PERMISSIONS.ANNOUNCEMENT_PUBLISH,
    run: (actor) =>
      createPublishAnnouncement({ store: tripwire(), authorize })({
        actor,
        input: { title: "Notice", content: "Body" },
      }),
  },
  {
    name: "removeAnnouncement",
    permission: PERMISSIONS.ANNOUNCEMENT_PUBLISH,
    run: (actor) =>
      createRemoveAnnouncement({ store: tripwire(), authorize })({
        actor,
        postId: ID,
      }),
  },
  ...(() => {
    const TARGET = "00000000-0000-4000-8000-0000000000bb";
    const CHAPTER = "00000000-0000-4000-8000-0000000000c1";
    const access = () => ({
      store: tripwire(),
      authorize,
      loadGrants: tripwire(),
    });
    const roleDeps = () => ({
      ...access(),
      roles: ROLE_PERMISSIONS,
      superAdminRole: "SUPER_ADMIN",
    });
    return [
      {
        name: "listUsers",
        permission: PERMISSIONS.USER_READ_ADMIN,
        run: (actor: Actor | null) =>
          createListUsers({ store: tripwire(), authorize })({
            actor,
            query: {},
          }),
      },
      {
        name: "getUser",
        permission: PERMISSIONS.USER_READ_ADMIN,
        run: (actor: Actor | null) =>
          createGetUser({ ...roleDeps() })({ actor, userId: TARGET }),
      },
      {
        name: "suspendUser",
        permission: PERMISSIONS.USER_SUSPEND,
        run: (actor: Actor | null) =>
          createChangeAccountState({
            ...access(),
            superAdminRole: "SUPER_ADMIN",
          })({
            actor,
            userId: TARGET,
            input: { accountState: "SUSPENDED", reason: "SPAM" },
          }),
      },
      {
        name: "deactivateUser",
        permission: PERMISSIONS.USER_SUSPEND,
        run: (actor: Actor | null) =>
          createChangeAccountState({
            ...access(),
            superAdminRole: "SUPER_ADMIN",
          })({
            actor,
            userId: TARGET,
            input: { accountState: "DEACTIVATED", reason: "OTHER" },
          }),
      },
      {
        name: "reactivateUser",
        permission: PERMISSIONS.USER_REACTIVATE,
        run: (actor: Actor | null) =>
          createChangeAccountState({
            ...access(),
            superAdminRole: "SUPER_ADMIN",
          })({
            actor,
            userId: TARGET,
            input: { accountState: "VERIFIED" },
          }),
      },
      {
        name: "assignRole",
        permission: PERMISSIONS.ROLE_ASSIGN,
        run: (actor: Actor | null) =>
          createAssignRole(roleDeps())({
            actor,
            userId: TARGET,
            input: { role: "STUDENT" },
          }),
      },
      {
        name: "revokeRole",
        permission: PERMISSIONS.ROLE_ASSIGN,
        run: (actor: Actor | null) =>
          createRevokeRole(roleDeps())({
            actor,
            userId: TARGET,
            role: "STUDENT",
          }),
      },
      {
        name: "grantPermission",
        permission: PERMISSIONS.PERMISSION_GRANT,
        run: (actor: Actor | null) =>
          createGrantPermission(access())({
            actor,
            userId: TARGET,
            input: {
              permission: "event.manage",
              scope: "CHAPTER",
              chapterId: CHAPTER,
            },
          }),
      },
      {
        name: "revokeGrant",
        permission: PERMISSIONS.PERMISSION_GRANT,
        run: (actor: Actor | null) =>
          createRevokeGrant(access())({
            actor,
            userId: TARGET,
            grantId: CHAPTER,
          }),
      },
    ];
  })(),
];

/** Admin-tier permissions with no action yet. The list may only shrink (spec A12-10). */
const NOT_YET_BUILT: readonly Permission[] = [];

const matrix = readRoleMatrixFromDoc();
const actorHolding = (held: ReadonlySet<string>): Actor => ({
  userId: "00000000-0000-4000-8000-0000000000aa",
  accountState: "VERIFIED",
  requestId: "matrix",
  grants: [...held].map((permission) => ({
    permission: permission as Permission,
    scope: "GLOBAL" as const,
    expiresAt: null,
  })),
});
const outcomeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => "returned",
    (error: unknown) => error
  );

describe("admin action × role matrix (RBAC §4)", () => {
  for (const action of ADMIN_ACTIONS) {
    describe(`${action.name} (${action.permission})`, () => {
      it.each(ROLE_NAMES)("%s", async (role) => {
        const held = matrix[role].has(action.permission);
        const outcome = await outcomeOf(action.run(actorHolding(matrix[role])));
        expect(outcome).toBeInstanceOf(
          held ? ReachedStore : AuthorizationError
        );
      });

      it("unauthenticated", async () => {
        await expect(action.run(null)).rejects.toBeInstanceOf(
          AuthenticationError
        );
      });
    });
  }

  describe("getDashboard (any admin-tier permission)", () => {
    // countTile runs under Promise.allSettled, so a thrown ReachedStore would be settled, not raised:
    // rethrow it from onTileFailed to observe that the store was reached.
    const run = (actor: Actor | null) =>
      createGetDashboard({
        store: {
          countTile: () => {
            throw new ReachedStore("countTile");
          },
          listAuditLog: tripwire(),
          listUsers: tripwire(),
          getUser: tripwire(),
          listChapters: tripwire(),
        },
        can,
        onTileFailed: (_key, error) => {
          throw error;
        },
      })({ actor });

    it.each(ROLE_NAMES)("%s", async (role) => {
      const admin = ADMIN_PERMISSIONS.some((p) => matrix[role].has(p));
      const outcome = await outcomeOf(run(actorHolding(matrix[role])));
      expect(outcome).toBeInstanceOf(admin ? ReachedStore : NotFoundError);
    });

    it("unauthenticated", async () => {
      await expect(run(null)).rejects.toBeInstanceOf(AuthenticationError);
    });
  });

  it("every admin-tier permission has a registered action or is explicitly not yet built", () => {
    const covered = new Set(ADMIN_ACTIONS.map((a) => a.permission));
    for (const permission of ADMIN_PERMISSIONS) {
      expect(
        covered.has(permission) !== NOT_YET_BUILT.includes(permission),
        `${permission}: registered=${covered.has(permission)}, notYetBuilt=${NOT_YET_BUILT.includes(permission)}`
      ).toBe(true);
    }
  });
});
