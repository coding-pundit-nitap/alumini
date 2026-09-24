import {
  CHAPTER_SCOPABLE_PERMISSIONS,
  PERMISSIONS,
  type Permission,
} from "@nitap/database/permissions";

/** Structurally the auth module's `Grant` (the domain may not import another module). */
export type HeldGrant =
  | { permission: string; scope: "GLOBAL"; expiresAt: Date | null }
  | {
      permission: string;
      scope: "CHAPTER";
      chapterId: string;
      expiresAt: Date | null;
    };

export type GrantRequest = {
  permission: string;
  scope: "GLOBAL" | "CHAPTER";
  chapterId: string | null;
};

/** Shown in the UI next to a disabled option and returned as the 403 message (spec B12-3). */
export const ESCALATION_MESSAGES = {
  ADMIN_ROLE:
    "Only a Super Admin (system.configure) can assign or remove an admin role.",
  NOT_HELD: "You can only grant a permission you hold, in a scope you hold.",
  CHAPTER_ONLY:
    "You can only grant chapter-scoped permissions from the chapter bundle.",
  ACCESS_ADMIN:
    "Only a Super Admin (system.configure) can grant this permission.",
  PROTECTED_TARGET:
    "Only a Super Admin (system.configure) can change this account.",
} as const;
export type EscalationReason = keyof typeof ESCALATION_MESSAGES;

const live = (g: HeldGrant, now: Date) =>
  g.expiresAt === null || g.expiresAt > now;
const holdsGlobal = (grants: readonly HeldGrant[], p: string, now: Date) =>
  grants.some(
    (g) => g.permission === p && g.scope === "GLOBAL" && live(g, now)
  );
const covers = (grants: readonly HeldGrant[], r: GrantRequest, now: Date) =>
  grants.some(
    (g) =>
      g.permission === r.permission &&
      live(g, now) &&
      (g.scope === "GLOBAL" ||
        (r.scope === "CHAPTER" && g.chapterId === r.chapterId))
  );
const SCOPABLE: ReadonlySet<string> = new Set(CHAPTER_SCOPABLE_PERMISSIONS);
const ACCESS_ADMIN_PERMISSIONS: ReadonlySet<string> = new Set([
  PERMISSIONS.ROLE_ASSIGN,
  PERMISSIONS.SYSTEM_CONFIGURE,
]);

/** E1 (RBAC §6.1): a role that can itself assign roles needs system.configure to assign or remove. */
export function checkRoleChange(
  actor: readonly HeldGrant[],
  rolePermissions: readonly Permission[],
  now: Date
): EscalationReason | undefined {
  return rolePermissions.includes(PERMISSIONS.ROLE_ASSIGN) &&
    !holdsGlobal(actor, PERMISSIONS.SYSTEM_CONFIGURE, now)
    ? "ADMIN_ROLE"
    : undefined;
}

/** E2 (RBAC §6.1, §8.1): grant only what you hold, in a scope you hold; a non-role-manager only in a chapter. */
export function checkGrantChange(
  actor: readonly HeldGrant[],
  request: GrantRequest,
  now: Date
): EscalationReason | undefined {
  if (
    ACCESS_ADMIN_PERMISSIONS.has(request.permission) &&
    !holdsGlobal(actor, PERMISSIONS.SYSTEM_CONFIGURE, now)
  )
    return "ACCESS_ADMIN";
  if (!covers(actor, request, now)) return "NOT_HELD";
  if (
    !holdsGlobal(actor, PERMISSIONS.ROLE_ASSIGN, now) &&
    (request.scope !== "CHAPTER" || !SCOPABLE.has(request.permission))
  )
    return "CHAPTER_ONLY";
  return undefined;
}

/** E3: a target who can assign roles is changed only by a system.configure holder. */
export function checkTarget(
  actor: readonly HeldGrant[],
  target: readonly HeldGrant[],
  now: Date
): EscalationReason | undefined {
  return target.some(
    (g) => g.permission === PERMISSIONS.ROLE_ASSIGN && live(g, now)
  )
    ? holdsGlobal(actor, PERMISSIONS.SYSTEM_CONFIGURE, now)
      ? undefined
      : "PROTECTED_TARGET"
    : undefined;
}

export type AccessOptions = {
  target: EscalationReason | undefined;
  roles: { name: string; reason: EscalationReason | undefined }[];
  permissions: {
    permission: Permission;
    global: EscalationReason | undefined;
    /** Checked against "some chapter the actor holds it in"; the server re-checks the exact chapter. */
    chapter: EscalationReason | "NOT_SCOPABLE" | undefined;
  }[];
};

/** What the detail page may offer, computed by the same rules the server enforces (spec B12-3, B12-14). */
export function accessOptions(args: {
  actor: readonly HeldGrant[];
  target: readonly HeldGrant[];
  roles: Readonly<Record<string, readonly Permission[]>>;
  permissions: readonly Permission[];
  now: Date;
}): AccessOptions {
  const { actor, now } = args;
  const anyChapter = (permission: string) =>
    actor.find(
      (g): g is Extract<HeldGrant, { scope: "CHAPTER" }> =>
        g.permission === permission && g.scope === "CHAPTER" && live(g, now)
    )?.chapterId ?? "(any)";
  return {
    target: checkTarget(actor, args.target, now),
    roles: Object.entries(args.roles).map(([name, perms]) => ({
      name,
      reason: checkRoleChange(actor, perms, now),
    })),
    permissions: args.permissions.map((permission) => ({
      permission,
      global: checkGrantChange(
        actor,
        { permission, scope: "GLOBAL", chapterId: null },
        now
      ),
      chapter: SCOPABLE.has(permission)
        ? checkGrantChange(
            actor,
            { permission, scope: "CHAPTER", chapterId: anyChapter(permission) },
            now
          )
        : "NOT_SCOPABLE",
    })),
  };
}
