"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Award,
  Briefcase,
  Flag,
  LayoutDashboard,
  MailWarning,
  Menu,
  ScrollText,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@nitap/ui/components/badge";
import { Button } from "@nitap/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@nitap/ui/components/sheet";

import { Wordmark } from "@/components/brand/dawn-mark";
import { cn } from "@/lib/utils";
import type { NavGroup, NavIcon } from "@/modules/admin";

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

function Nav({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Administration" className="flex-1 px-3 pb-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-muted-foreground px-3 pt-4 pb-1 text-[11px] font-medium tracking-wider uppercase">
            {group.label}
          </p>
          {group.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm",
                  active
                    ? "bg-brand/10 text-foreground before:bg-brand font-medium before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon aria-hidden className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminRail({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside
        aria-label="Administration"
        className="bg-background sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r md:flex"
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <Link href="/admin">
            <Wordmark compact />
          </Link>
          <Badge variant="brand">Admin</Badge>
        </div>
        <Nav groups={groups} pathname={pathname} />
        <div className="mt-auto border-t p-3">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground flex h-9 items-center gap-3 rounded-lg px-3 text-sm"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to app
          </Link>
        </div>
      </aside>

      <header className="bg-background/80 sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4 backdrop-blur-md md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open admin menu"
              />
            }
          >
            <Menu aria-hidden />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader>
              <SheetTitle>Administration</SheetTitle>
            </SheetHeader>
            <div className="flex h-full flex-col">
              <Nav
                groups={groups}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
              />
              <div className="mt-auto border-t p-3">
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground flex h-9 items-center gap-3 rounded-lg px-3 text-sm"
                >
                  <ArrowLeft aria-hidden className="size-4" />
                  Back to app
                </Link>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <Link href="/admin" className="flex items-center gap-2">
          <Wordmark compact />
          <Badge variant="brand">Admin</Badge>
        </Link>
      </header>
    </>
  );
}
