import fs from "node:fs";
import path from "node:path";

import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

/**
 * Every Route Handler × method, classified. The file system is the source of truth for what
 * exists; this table is the source of truth for who may call it. `api-inventory.test.ts` fails when they
 * differ, so a new endpoint cannot ship unclassified, and `api-matrix.security.integration.test.ts`
 * generates the role × account-state × action matrix from it.
 */

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export type Access =
  /** No session needed (liveness, readiness). */
  | { kind: "public" }
  /** Open outside production; the monitoring bearer token in production, else a bare 404. */
  | { kind: "monitoring" }
  /** Better Auth's own handler, with its own origin, CSRF and rate-limit checks (tested in 16C). */
  | { kind: "better-auth" }
  /**
   * No session needed: a resource's visibility decides (a profile photo follows the profile's level), and
   * anything not visible, unknown or not — signed in or not — is the same 404.
   */
  | { kind: "visibility" }
  /**
   * A signed-in member. A caller holding none of `anyOf` is refused by `authorize()`; holding one is
   * necessary, not sufficient (ownership, party and visibility rules decide the rest).
   */
  | { kind: "session"; anyOf: readonly Permission[] };

/**
 * A schema-valid request, for routes that validate input before the use case authorizes: without
 * it the matrix would see a 400 and never reach authorize(). Ids are placeholders for unknown rows.
 */
export type Sample = { body?: unknown; query?: string };

export type Entry = { access: Access; mutates: boolean; sample?: Sample };

const P = PERMISSIONS;
const session = (...anyOf: Permission[]): Access => ({
  kind: "session",
  anyOf,
});
const read = (access: Access, sample?: Sample): Entry => ({
  access,
  mutates: false,
  ...(sample ? { sample } : {}),
});
const write = (access: Access, sample?: Sample): Entry => ({
  access,
  mutates: true,
  ...(sample ? { sample } : {}),
});
const SOME_ID = "4f9e3a52-7d1b-4c6e-9a2f-0b8d5e1c3a77";

export const API_INVENTORY: Record<string, Partial<Record<Method, Entry>>> = {
  "/api/auth/[...all]": {
    GET: read({ kind: "better-auth" }),
    POST: write({ kind: "better-auth" }),
  },
  "/api/photos/[userId]": { GET: read({ kind: "visibility" }) },
  "/api/uploads/[id]": { GET: read(session(P.POST_INTERACT)) },

  "/api/v1/admin/audit-log": { GET: read(session(P.AUDIT_READ)) },
  "/api/v1/admin/notifications/replay": {
    POST: write(session(P.NOTIFICATION_REPLAY)),
  },
  "/api/v1/admin/users": { GET: read(session(P.USER_READ_ADMIN)) },
  "/api/v1/admin/users/[id]": {
    GET: read(session(P.USER_READ_ADMIN)),
    PATCH: write(session(P.USER_SUSPEND, P.USER_REACTIVATE)),
  },
  "/api/v1/admin/users/[id]/permission-grants": {
    POST: write(session(P.PERMISSION_GRANT)),
  },
  "/api/v1/admin/users/[id]/permission-grants/[grantId]": {
    DELETE: write(session(P.PERMISSION_GRANT)),
  },
  "/api/v1/admin/users/[id]/roles": { POST: write(session(P.ROLE_ASSIGN)) },
  "/api/v1/admin/users/[id]/roles/[role]": {
    DELETE: write(session(P.ROLE_ASSIGN)),
  },

  "/api/v1/alumni": { GET: read(session(P.DIRECTORY_SEARCH)) },
  "/api/v1/blocks": {
    POST: write(session(P.CONNECTION_MANAGE), { body: { userId: SOME_ID } }),
  },
  "/api/v1/connections": {
    GET: read(session(P.CONNECTION_MANAGE)),
    POST: write(session(P.CONNECTION_MANAGE), {
      body: { recipientId: SOME_ID },
    }),
  },
  "/api/v1/connections/[id]": {
    PATCH: write(session(P.CONNECTION_MANAGE), {
      body: { state: "ACCEPTED" },
    }),
    DELETE: write(session(P.CONNECTION_MANAGE)),
  },

  "/api/v1/conversations": {
    GET: read(session(P.MESSAGE_SEND)),
    POST: write(session(P.MESSAGE_SEND), { body: { recipientId: SOME_ID } }),
  },
  "/api/v1/conversations/[id]": { GET: read(session(P.MESSAGE_SEND)) },
  "/api/v1/conversations/[id]/messages": {
    GET: read(session(P.MESSAGE_SEND)),
    POST: write(session(P.MESSAGE_SEND)),
  },
  "/api/v1/conversations/[id]/participants": {
    POST: write(session(P.MESSAGE_SEND), { body: { userId: SOME_ID } }),
  },
  "/api/v1/conversations/[id]/participants/[userId]": {
    DELETE: write(session(P.MESSAGE_SEND)),
  },
  "/api/v1/conversations/[id]/read": { POST: write(session(P.MESSAGE_SEND)) },
  "/api/v1/messages/stream": {
    GET: read(session(P.MESSAGE_SEND, P.NOTIFICATION_READ)),
  },

  "/api/v1/events": {
    GET: read(session(P.EVENT_READ)),
    POST: write(session(P.EVENT_CREATE)),
  },
  "/api/v1/events/[id]": { GET: read(session(P.EVENT_READ, P.EVENT_MANAGE)) },
  "/api/v1/events/[id]/cancel": {
    POST: write(session(P.EVENT_READ, P.EVENT_MANAGE)),
  },
  "/api/v1/events/[id]/registrations": {
    GET: read(session(P.EVENT_READ, P.EVENT_MANAGE)),
    POST: write(session(P.EVENT_REGISTER)),
  },
  "/api/v1/events/[id]/registrations/me": {
    DELETE: write(session(P.EVENT_REGISTER)),
  },
  "/api/v1/events/[id]/registrations/[registrationId]": {
    PATCH: write(session(P.EVENT_READ, P.EVENT_MANAGE), {
      body: { state: "ATTENDED" },
    }),
  },

  "/api/v1/jobs": {
    GET: read(session(P.JOB_READ)),
    POST: write(session(P.JOB_CREATE)),
  },
  "/api/v1/jobs/[id]": {
    GET: read(session(P.JOB_READ, P.JOB_MANAGE, P.JOB_APPROVE)),
    PATCH: write(session(P.JOB_READ, P.JOB_MANAGE)),
  },
  "/api/v1/jobs/[id]/approve": { POST: write(session(P.JOB_APPROVE)) },
  "/api/v1/jobs/[id]/reject": { POST: write(session(P.JOB_APPROVE)) },
  "/api/v1/jobs/[id]/close": { POST: write(session(P.JOB_READ, P.JOB_MANAGE)) },

  "/api/v1/mentors": { GET: read(session(P.MENTOR_SEARCH)) },
  "/api/v1/mentors/me": {
    GET: read(session(P.MENTOR_OPT_IN)),
    PUT: write(session(P.MENTOR_OPT_IN)),
  },
  "/api/v1/mentorships": {
    GET: read(session(P.MENTORSHIP_REQUEST, P.MENTORSHIP_RESPOND), {
      query: "role=mentee",
    }),
    POST: write(session(P.MENTORSHIP_REQUEST), {
      body: { mentorId: SOME_ID, message: "Hello" },
    }),
  },
  "/api/v1/mentorships/[id]": {
    PATCH: write(
      session(P.MENTORSHIP_REQUEST, P.MENTORSHIP_RESPOND, P.MENTOR_SEARCH),
      { body: { action: "cancel" } }
    ),
  },

  "/api/v1/notifications": { GET: read(session(P.NOTIFICATION_READ)) },
  "/api/v1/notifications/[id]/read": {
    POST: write(session(P.NOTIFICATION_READ)),
  },
  "/api/v1/notifications/preferences": {
    GET: read(session(P.NOTIFICATION_READ)),
    PATCH: write(session(P.NOTIFICATION_READ)),
  },
  "/api/v1/notifications/read-all": {
    POST: write(session(P.NOTIFICATION_READ)),
  },
  "/api/v1/notifications/unread-count": {
    GET: read(session(P.NOTIFICATION_READ)),
  },

  "/api/v1/posts": { GET: read(session(P.POST_INTERACT)) },
  "/api/v1/posts/[id]/comments": { GET: read(session(P.POST_INTERACT)) },
  "/api/v1/reports": {
    GET: read(session(P.REPORT_REVIEW)),
    POST: write(session(P.REPORT_CREATE), {
      body: { targetType: "MESSAGE", targetId: SOME_ID, reason: "spam" },
    }),
  },
  "/api/v1/reports/[id]": { PATCH: write(session(P.REPORT_REVIEW)) },

  "/health/live": { GET: read({ kind: "public" }) },
  "/health/ready": { GET: read({ kind: "public" }) },
  "/health/startup": { GET: read({ kind: "public" }) },
  "/health/drain": { POST: write({ kind: "monitoring" }) },
  "/metrics": { GET: read({ kind: "monitoring" }) },
  // Same-origin path to object storage: the store checks each presigned signature, the app checks nothing.
  "/storage/[...path]": {
    GET: read({ kind: "public" }),
    POST: write({ kind: "public" }),
    PUT: write({ kind: "public" }),
  },
};

const EXPORT =
  /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+\{([^}]*)\}/g;

/** Every `route.ts` under `appRoot` as "/url/path" → its exported HTTP methods. Route groups `(x)` are dropped. */
export function routesOnDisk(appRoot: string): Record<string, Method[]> {
  const found: Record<string, Method[]> = {};
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name === "route.ts") {
        const url =
          "/" +
          path
            .relative(appRoot, dir)
            .split(path.sep)
            .filter((part) => !/^\(.*\)$/.test(part))
            .join("/");
        const source = fs.readFileSync(full, "utf8");
        const methods = new Set<Method>();
        for (const match of source.matchAll(EXPORT)) {
          const names = match[1] ? [match[1]] : (match[2] ?? "").split(",");
          for (const name of names.map((n) => n.trim())) {
            if ((METHODS as readonly string[]).includes(name))
              methods.add(name as Method);
          }
        }
        found[url] = [...methods].sort();
      }
    }
  };
  visit(appRoot);
  return found;
}
