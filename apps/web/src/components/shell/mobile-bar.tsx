"use client";

import { Menu, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@nitap/ui/components/sheet";

import { DawnMark } from "@/components/brand/dawn-mark";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { useCreateClick } from "./create-menu";
import type { ShellUser } from "./load-shell";
import { activeHref, NavIcon } from "./nav-icon";
import type { NavModel } from "./nav-model";
import { openCommandPalette } from "./rail";
import { UserMenu } from "./user-menu";

const FOCUS = "focus-visible:ring-ring outline-none focus-visible:ring-2";

/** Below md: a slim top bar and a bottom tab bar whose last tab ("More") opens the full nav. */
export function MobileBar({
  nav,
  user,
  bell,
}: {
  nav: NavModel;
  user: ShellUser;
  bell: ReactNode;
}) {
  const pathname = usePathname();
  const onCreate = useCreateClick();
  const [moreOpen, setMoreOpen] = useState(false);
  const entries = nav.groups.flatMap((g) => g.entries);
  const active = activeHref(pathname, entries);
  const inTabs = nav.tabs.some((t) => t.href === active);

  return (
    <>
      <header className="bg-background/85 sticky top-0 z-40 flex h-14 items-center gap-1 border-b px-4 backdrop-blur md:hidden">
        <Link
          href="/dashboard"
          aria-label={`${siteConfig.shortName} home`}
          className={cn("mr-auto rounded-md", FOCUS)}
        >
          <DawnMark />
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
          onClick={openCommandPalette}
        >
          <Search />
        </Button>
        {bell}
        <UserMenu user={user} variant="compact" />
      </header>

      <nav
        aria-label="Mobile"
        className="bg-background/95 fixed inset-x-0 bottom-0 z-40 grid border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{
          gridTemplateColumns: `repeat(${nav.tabs.length + 1}, minmax(0, 1fr))`,
        }}
      >
        {nav.tabs.map((tab) => {
          const current = tab.href === active;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 transition-colors duration-150",
                FOCUS,
                current ? "text-brand" : "text-muted-foreground"
              )}
            >
              <NavIcon name={tab.icon} className="size-5" />
              <span className="max-w-full truncate px-1 text-[11px]">
                {tab.label}
              </span>
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-0.5 transition-colors duration-150",
              FOCUS,
              active && !inTabs ? "text-brand" : "text-muted-foreground"
            )}
          >
            <Menu aria-hidden="true" className="size-5" />
            <span className="text-[11px]">More</span>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[80svh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4">
              {nav.create.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {nav.create.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      onClick={() => {
                        setMoreOpen(false);
                        onCreate(action.href);
                      }}
                      className={buttonVariants({ variant: "brand" })}
                    >
                      <Plus aria-hidden="true" />
                      {action.label}
                    </Link>
                  ))}
                </div>
              )}
              {nav.groups.map((group, i) => (
                <section key={group.label ?? i}>
                  {group.label && (
                    <h2 className="text-muted-foreground mb-1 px-2 text-xs tracking-wider uppercase">
                      {group.label}
                    </h2>
                  )}
                  <ul className="flex flex-col">
                    {group.entries.map((entry) => {
                      const current = entry.href === active;
                      return (
                        <li key={entry.href}>
                          <Link
                            href={entry.href}
                            onClick={() => setMoreOpen(false)}
                            aria-current={current ? "page" : undefined}
                            className={cn(
                              "flex h-11 items-center gap-3 rounded-lg px-2 text-sm",
                              FOCUS,
                              current
                                ? "bg-brand/10 font-medium"
                                : "hover:bg-accent"
                            )}
                          >
                            <NavIcon
                              name={entry.icon}
                              className={cn(
                                "size-[18px]",
                                current ? "text-brand" : "text-muted-foreground"
                              )}
                            />
                            {entry.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}
