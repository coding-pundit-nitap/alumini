"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nitap/ui/components/tooltip";

import { DawnMark, Wordmark } from "@/components/brand/dawn-mark";
import { cn } from "@/lib/utils";

import { CreateMenu } from "./create-menu";
import type { ShellUser } from "./load-shell";
import { activeHref, NavIcon } from "./nav-icon";
import type { NavModel } from "./nav-model";
import { UserMenu } from "./user-menu";

export function openCommandPalette() {
  window.dispatchEvent(new Event("open-command-palette"));
}

const FOCUS = "focus-visible:ring-ring outline-none focus-visible:ring-2";

/** Desktop/tablet rail: 248px with labels at lg, 72px icons with tooltips at md, hidden below. */
export function Rail({
  nav,
  user,
  bell,
}: {
  nav: NavModel;
  user: ShellUser;
  bell: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeHref(
    pathname,
    nav.groups.flatMap((g) => g.entries)
  );

  return (
    <aside className="bg-card/40 sticky top-0 hidden h-svh shrink-0 flex-col border-r md:flex md:w-[72px] lg:w-[248px]">
      <div className="flex flex-col gap-3 px-3 pt-4 pb-3 md:items-center lg:items-stretch">
        <Link
          href="/dashboard"
          aria-label="Home"
          className={cn("flex h-10 items-center rounded-md lg:px-2", FOCUS)}
        >
          <span className="hidden lg:block">
            <Wordmark compact />
          </span>
          <DawnMark className="lg:hidden" />
        </Link>
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Search"
          className={cn(
            "bg-background text-muted-foreground hover:text-foreground flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors duration-150 md:w-9 md:justify-center md:px-0 lg:w-full lg:justify-start lg:px-2.5",
            FOCUS
          )}
        >
          <Search aria-hidden="true" className="size-4" />
          <span className="hidden flex-1 text-left lg:inline">Search</span>
          <kbd className="bg-muted hidden rounded px-1.5 font-mono text-[11px] lg:inline">
            ⌘K
          </kbd>
        </button>
        <CreateMenu actions={nav.create} />
      </div>

      <nav
        aria-label="Primary"
        className="flex-1 scrollbar-none overflow-y-auto px-3 pb-4"
      >
        {nav.groups.map((group, i) => (
          <div key={group.label ?? i} className="mt-4 first:mt-1">
            {group.label && (
              <p className="text-muted-foreground mb-1 hidden px-2.5 text-xs tracking-wider uppercase lg:block">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5 md:items-center lg:items-stretch">
              {group.entries.map((entry) => {
                const current = entry.href === active;
                return (
                  <li key={entry.href}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Link
                            href={entry.href}
                            aria-current={current ? "page" : undefined}
                            className={cn(
                              "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors duration-150 md:w-10 md:justify-center md:px-0 lg:w-full lg:justify-start lg:px-2.5",
                              FOCUS,
                              current
                                ? "bg-brand/10 text-foreground before:bg-brand font-medium before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r-full"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          />
                        }
                      >
                        <NavIcon
                          name={entry.icon}
                          className={cn("size-[18px]", current && "text-brand")}
                        />
                        <span className="sr-only lg:not-sr-only">
                          {entry.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="lg:hidden">
                        {entry.label}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 border-t p-3 lg:flex-row-reverse lg:items-center">
        {bell}
        <div className="min-w-0 lg:flex-1">
          <UserMenu user={user} variant="rail" />
        </div>
      </div>
    </aside>
  );
}
