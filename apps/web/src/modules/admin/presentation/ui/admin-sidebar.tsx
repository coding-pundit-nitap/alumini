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

/** Sits under the 4rem sticky site header (shadcn block sidebar-16); a sheet on mobile. */
export function AdminSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <Sidebar className="top-16 h-[calc(100svh-4rem)]!">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarMenu>
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive(pathname, item.href)}
                    render={<Link href={item.href} />}
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
