import { PERMISSIONS as P } from "@nitap/database/permissions";
import {
  adminNavigation,
  hasAdminAccess,
  type Can,
  type NavIcon,
} from "@/modules/admin";

/**
 * Role-aware navigation model (spec U-2, "Information architecture and role-aware navigation").
 * A pure function: it only reads `can()` and `accountState`, never a role name
 * (`tests/architecture/no-role-names.test.ts`). Layouts stay out of the authorization business —
 * this only decides what to *show*; every page keeps its own `getActor()` redirect.
 */

export type NavIconName =
  | "home"
  | "messages"
  | "notifications"
  | "directory"
  | "connections"
  | "mentorship"
  | "jobs"
  | "my-jobs"
  | "events"
  | "achievements"
  | "admin"
  | "verification"
  | "reports"
  | "status"
  | "users"
  | "audit"
  | "announcements";

export type NavEntry = { href: string; label: string; icon: NavIconName };
export type NavGroup = { label: string | null; entries: NavEntry[] };
export type CreateAction = { href: string; label: string };
export type NavModel = {
  groups: NavGroup[];
  create: CreateAction[];
  /** Up to 4 entries for the mobile bottom bar; "More" is added by the UI. */
  tabs: NavEntry[];
};
export type NavInput = {
  accountState:
    "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED" | "DEACTIVATED";
  can: Can;
  isMentor: boolean;
};

const ADMIN_ICON_MAP: Record<NavIcon, NavIconName> = {
  dashboard: "admin",
  users: "users",
  audit: "audit",
  verification: "verification",
  reports: "reports",
  jobs: "jobs",
  achievements: "achievements",
  notifications: "notifications",
  announcements: "announcements",
};

function soloGroup(entry: NavEntry): NavModel {
  return {
    groups: [{ label: null, entries: [entry] }],
    create: [],
    tabs: [entry],
  };
}

export function buildNav(input: NavInput): NavModel {
  const { accountState, can, isMentor } = input;

  if (accountState === "PENDING" || accountState === "REJECTED") {
    return soloGroup({
      href: "/onboarding",
      label: "Verification",
      icon: "verification",
    });
  }
  if (accountState === "SUSPENDED" || accountState === "DEACTIVATED") {
    return soloGroup({
      href: "/account/status",
      label: "Account status",
      icon: "status",
    });
  }

  const home: NavEntry[] = [
    { href: "/dashboard", label: "Home", icon: "home" },
  ];
  if (can(P.MESSAGE_SEND))
    home.push({ href: "/messages", label: "Messages", icon: "messages" });
  if (can(P.NOTIFICATION_READ))
    home.push({
      href: "/notifications",
      label: "Notifications",
      icon: "notifications",
    });

  const network: NavEntry[] = [];
  if (can(P.DIRECTORY_SEARCH))
    network.push({ href: "/directory", label: "Directory", icon: "directory" });
  if (can(P.CONNECTION_MANAGE))
    network.push({
      href: "/connections",
      label: "Connections",
      icon: "connections",
    });
  if (
    can(P.MENTOR_SEARCH) ||
    can(P.MENTOR_OPT_IN) ||
    can(P.MENTORSHIP_REQUEST)
  ) {
    const label = isMentor
      ? "Mentoring"
      : can(P.MENTORSHIP_REQUEST)
        ? "Find a mentor"
        : "Mentorship";
    network.push({ href: "/mentorship", label, icon: "mentorship" });
  }

  const opportunities: NavEntry[] = [];
  if (can(P.JOB_READ))
    opportunities.push({ href: "/jobs", label: "Jobs", icon: "jobs" });
  if (can(P.JOB_CREATE))
    opportunities.push({
      href: "/jobs/mine",
      label: "My job posts",
      icon: "my-jobs",
    });
  if (can(P.EVENT_READ))
    opportunities.push({ href: "/events", label: "Events", icon: "events" });
  if (can(P.ACHIEVEMENT_SUBMIT) || can(P.ACHIEVEMENT_REVIEW))
    opportunities.push({
      href: "/achievements",
      label: "Achievements",
      icon: "achievements",
    });

  const manage: NavEntry[] = [];
  if (hasAdminAccess(can)) {
    manage.push({ href: "/admin", label: "Admin", icon: "admin" });
    const links = adminNavigation(can)
      .filter((item) => item.href !== "/admin")
      .slice(0, 3);
    for (const item of links)
      manage.push({
        href: item.href,
        label: item.label,
        icon: ADMIN_ICON_MAP[item.icon],
      });
  }

  const groups: NavGroup[] = [
    { label: null, entries: home },
    { label: "Network", entries: network },
    { label: "Opportunities", entries: opportunities },
    { label: "Manage", entries: manage },
  ].filter((g) => g.entries.length > 0);

  const create: CreateAction[] = [];
  if (can(P.POST_CREATE))
    create.push({ href: "/dashboard#compose", label: "Post" });
  if (can(P.JOB_CREATE)) create.push({ href: "/jobs/new", label: "Job" });
  if (can(P.EVENT_CREATE)) create.push({ href: "/events/new", label: "Event" });
  if (can(P.ACHIEVEMENT_SUBMIT))
    create.push({ href: "/achievements#share", label: "Achievement" });

  const allEntries = groups.flatMap((g) => g.entries);
  const tabOrder = ["/dashboard", "/directory", "/messages", "/jobs"];
  const tabs = tabOrder
    .map((href) => allEntries.find((e) => e.href === href))
    .filter((e): e is NavEntry => e !== undefined);

  return { groups, create, tabs };
}
