import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

/** "Does the actor hold this permission globally?" — `can(actor, p)` with no resource (RBAC §5). */
export type Can = (permission: Permission) => boolean;

/** Permissions that make someone an operator of the platform (spec A12-2). */
export const ADMIN_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.ALUMNI_VERIFY,
  PERMISSIONS.USER_READ_ADMIN,
  PERMISSIONS.USER_SUSPEND,
  PERMISSIONS.USER_REACTIVATE,
  PERMISSIONS.ROLE_ASSIGN,
  PERMISSIONS.PERMISSION_GRANT,
  PERMISSIONS.JOB_APPROVE,
  PERMISSIONS.ACHIEVEMENT_REVIEW,
  PERMISSIONS.REPORT_REVIEW,
  PERMISSIONS.NOTIFICATION_REPLAY,
  PERMISSIONS.AUDIT_READ,
  PERMISSIONS.ANALYTICS_VIEW,
];

export const hasAdminAccess = (can: Can): boolean =>
  ADMIN_PERMISSIONS.some((permission) => can(permission));

export type NavIcon =
  "dashboard" | "audit" | "verification" | "jobs" | "achievements";
export type NavItem = { href: string; label: string; icon: NavIcon };

// Queues keep their current pages until 12C moves them under /admin (overview AD-3).
const QUEUE_ITEMS: ReadonlyArray<NavItem & { permission: Permission }> = [
  {
    href: "/admin/audit",
    label: "Audit log",
    icon: "audit",
    permission: PERMISSIONS.AUDIT_READ,
  },
  {
    href: "/admin/verification",
    label: "Verification",
    icon: "verification",
    permission: PERMISSIONS.ALUMNI_VERIFY,
  },
  {
    href: "/jobs/moderation",
    label: "Jobs",
    icon: "jobs",
    permission: PERMISSIONS.JOB_APPROVE,
  },
  {
    href: "/achievements",
    label: "Achievements",
    icon: "achievements",
    permission: PERMISSIONS.ACHIEVEMENT_REVIEW,
  },
];

export function adminNavigation(can: Can): NavItem[] {
  if (!hasAdminAccess(can)) return [];
  return [
    { href: "/admin", label: "Dashboard", icon: "dashboard" },
    ...QUEUE_ITEMS.filter((item) => can(item.permission)).map(
      ({ href, label, icon }) => ({ href, label, icon })
    ),
  ];
}

export type TileKey =
  | "pendingVerifications"
  | "openReports"
  | "pendingJobs"
  | "pendingAchievements"
  | "failedEmails"
  | "members";

/** Each tile shows only to holders of the permission for its queue (spec A12-5). */
export const TILE_PERMISSIONS: Record<TileKey, Permission> = {
  pendingVerifications: PERMISSIONS.ALUMNI_VERIFY,
  openReports: PERMISSIONS.REPORT_REVIEW,
  pendingJobs: PERMISSIONS.JOB_APPROVE,
  pendingAchievements: PERMISSIONS.ACHIEVEMENT_REVIEW,
  failedEmails: PERMISSIONS.NOTIFICATION_REPLAY,
  members: PERMISSIONS.USER_READ_ADMIN,
};

export const dashboardTiles = (can: Can): TileKey[] =>
  (Object.keys(TILE_PERMISSIONS) as TileKey[]).filter((key) =>
    can(TILE_PERMISSIONS[key])
  );
