import {
  ADMIN_TIER_PERMISSIONS,
  PERMISSIONS,
  type Permission,
} from "@nitap/database/permissions";

/** "Does the actor hold this permission globally?" — `can(actor, p)` with no resource (RBAC §5). */
export type Can = (permission: Permission) => boolean;

/** Permissions that make someone an operator of the platform (spec A12-2); the list lives in the shared registry. */
export const ADMIN_PERMISSIONS: readonly Permission[] = ADMIN_TIER_PERMISSIONS;

export const hasAdminAccess = (can: Can): boolean =>
  ADMIN_PERMISSIONS.some((permission) => can(permission));

export type NavIcon =
  | "dashboard"
  | "users"
  | "audit"
  | "verification"
  | "reports"
  | "jobs"
  | "achievements"
  | "notifications";
export type NavItem = { href: string; label: string; icon: NavIcon };

const QUEUE_ITEMS: ReadonlyArray<NavItem & { permission: Permission }> = [
  {
    href: "/admin/users",
    label: "Users",
    icon: "users",
    permission: PERMISSIONS.USER_READ_ADMIN,
  },
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
    href: "/admin/reports",
    label: "Reports",
    icon: "reports",
    permission: PERMISSIONS.REPORT_REVIEW,
  },
  {
    href: "/admin/jobs",
    label: "Jobs",
    icon: "jobs",
    permission: PERMISSIONS.JOB_APPROVE,
  },
  {
    href: "/admin/achievements",
    label: "Achievements",
    icon: "achievements",
    permission: PERMISSIONS.ACHIEVEMENT_REVIEW,
  },
  {
    href: "/admin/notifications",
    label: "Failed emails",
    icon: "notifications",
    permission: PERMISSIONS.NOTIFICATION_REPLAY,
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
