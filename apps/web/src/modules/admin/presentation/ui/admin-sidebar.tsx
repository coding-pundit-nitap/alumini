"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Briefcase,
  Flag,
  LayoutDashboard,
  MailWarning,
  ScrollText,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@nitap/ui/components/sidebar";

import type { NavIcon, NavItem } from "../../domain/access";

// The domain names icons as strings so it stays React-free; the UI maps them to components here.
const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  users: Users,
  audit: ScrollText,
  verification: UserCheck,
  reports: Flag,
  jobs: Briefcase,
  achievements: Award,
  notifications: MailWarning,
};

const isActive = (pathname: string, href: string) =>
  href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);

// Ember left indicator on the active item. Base UI sets a bare `data-active` attribute (no "true"
// value), so this uses Tailwind's `data-active:` variant.
const ACTIVE_ITEM =
  "relative before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand before:opacity-0 before:transition-opacity data-active:bg-brand/10 data-active:text-foreground data-active:before:opacity-100";

/** Sits under the 3.5rem sticky admin top bar (shadcn block sidebar-16); a sheet on mobile. */
export function AdminSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <Sidebar className="top-14 h-[calc(100svh-3.5rem)]!">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarMenu>
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={active}
                    className={ACTIVE_ITEM}
                    render={
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                      />
                    }
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
