import {
  ADMIN_TIER_PERMISSIONS,
  PERMISSIONS,
  type Permission,
} from "@nitap/database/permissions";

/** "Does the actor hold this permission globally?" — `can(actor, p)` with no resource. */
export type Can = (permission: Permission) => boolean;

/** Permissions that make someone an operator of the platform; the list lives in the shared registry. */
export const ADMIN_PERMISSIONS: readonly Permission[] = ADMIN_TIER_PERMISSIONS;

export const hasAdminAccess = (can: Can): boolean =>
  ADMIN_PERMISSIONS.some((permission) => can(permission));

export type NavIcon =
  | "dashboard"
  | "analytics"
  | "settings"
  | "campaigns"
  | "donations"
  | "users"
  | "audit"
  | "verification"
  | "reports"
  | "jobs"
  | "achievements"
  | "notifications"
  | "announcements";
export type NavItem = { href: string; label: string; icon: NavIcon };

const QUEUE_ITEMS: ReadonlyArray<NavItem & { permission: Permission }> = [
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: "analytics",
    permission: PERMISSIONS.ANALYTICS_VIEW,
  },
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
  {
    href: "/admin/announcements",
    label: "Announcements",
    icon: "announcements",
    permission: PERMISSIONS.ANNOUNCEMENT_PUBLISH,
  },
  {
    href: "/admin/campaigns",
    label: "Campaigns",
    icon: "campaigns",
    permission: PERMISSIONS.CAMPAIGN_MANAGE,
  },
  {
    href: "/admin/donations",
    label: "Donations",
    icon: "donations",
    permission: PERMISSIONS.CAMPAIGN_MANAGE,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: "settings",
    permission: PERMISSIONS.SYSTEM_CONFIGURE,
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
  | "pendingPledges"
  | "members";

/** Each tile shows only to holders of the permission for its queue. */
export const TILE_PERMISSIONS: Record<TileKey, Permission> = {
  pendingVerifications: PERMISSIONS.ALUMNI_VERIFY,
  openReports: PERMISSIONS.REPORT_REVIEW,
  pendingJobs: PERMISSIONS.JOB_APPROVE,
  pendingAchievements: PERMISSIONS.ACHIEVEMENT_REVIEW,
  failedEmails: PERMISSIONS.NOTIFICATION_REPLAY,
  pendingPledges: PERMISSIONS.CAMPAIGN_MANAGE,
  members: PERMISSIONS.USER_READ_ADMIN,
};

export const dashboardTiles = (can: Can): TileKey[] =>
  (Object.keys(TILE_PERMISSIONS) as TileKey[]).filter((key) =>
    can(TILE_PERMISSIONS[key])
  );

export type NavGroup = {
  label:
    "Overview" | "Queues" | "Content" | "Fundraising" | "People" | "System";
  items: NavItem[];
};

const GROUP_OF: Record<string, NavGroup["label"]> = {
  "/admin": "Overview",
  "/admin/analytics": "Overview",
  "/admin/verification": "Queues",
  "/admin/reports": "Queues",
  "/admin/jobs": "Queues",
  "/admin/achievements": "Queues",
  "/admin/announcements": "Content",
  "/admin/campaigns": "Fundraising",
  "/admin/donations": "Fundraising",
  "/admin/users": "People",
  "/admin/audit": "System",
  "/admin/notifications": "System",
  "/admin/settings": "System",
};
const GROUP_ORDER: NavGroup["label"][] = [
  "Overview",
  "Queues",
  "Content",
  "Fundraising",
  "People",
  "System",
];

/** The rail's sections, in a fixed order; only entries the actor was given, so empty groups vanish. */
export function groupAdminNav(items: NavItem[]): NavGroup[] {
  return GROUP_ORDER.map((label) => ({
    label,
    items: items.filter((i) => (GROUP_OF[i.href] ?? "System") === label),
  })).filter((g) => g.items.length > 0);
}
