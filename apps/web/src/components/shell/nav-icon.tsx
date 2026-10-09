import {
  BadgeCheck,
  Bell,
  Briefcase,
  BriefcaseBusiness,
  CalendarDays,
  ChartColumn,
  CircleAlert,
  Flag,
  GraduationCap,
  HandCoins,
  HandHeart,
  Heart,
  House,
  Megaphone,
  MessageCircle,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavEntry, NavIconName } from "./nav-model";

const ICONS: Record<NavIconName, LucideIcon> = {
  home: House,
  messages: MessageCircle,
  notifications: Bell,
  directory: Search,
  connections: Users,
  mentorship: GraduationCap,
  jobs: Briefcase,
  "my-jobs": BriefcaseBusiness,
  events: CalendarDays,
  achievements: Trophy,
  admin: ShieldCheck,
  verification: BadgeCheck,
  reports: Flag,
  status: CircleAlert,
  users: UserCog,
  audit: ScrollText,
  analytics: ChartColumn,
  settings: Settings,
  campaigns: HandHeart,
  donations: HandCoins,
  donate: Heart,
  announcements: Megaphone,
};

export function NavIcon({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} />;
}

/** Longest matching href wins, so `/jobs/mine` lights "My job posts". `/dashboard` matches exactly. */
export function activeHref(
  pathname: string,
  entries: readonly NavEntry[]
): string | null {
  let best: string | null = null;
  for (const { href } of entries) {
    const hit =
      pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(`${href}/`));
    if (hit && (!best || href.length > best.length)) best = href;
  }
  return best;
}
