"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  BellRing,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserPen,
} from "lucide-react";

import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@nitap/ui/components/dropdown-menu";

import {
  applyTheme,
  parseTheme,
  THEME_COOKIE,
  type ThemePref,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import { authClient } from "@/modules/auth/client";

import type { ShellUser } from "./load-shell";

const LINKS = [
  { href: "/profile/details", label: "Edit details", icon: UserPen },
  { href: "/profile/privacy", label: "Privacy", icon: ShieldCheck },
  {
    href: "/settings/notifications",
    label: "Notification settings",
    icon: BellRing,
  },
];

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function readTheme(): ThemePref {
  if (typeof document === "undefined") return "system";
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`)
  );
  return parseTheme(match?.[1]);
}

export function UserMenu({
  user,
  variant = "rail",
}: {
  user: ShellUser;
  variant?: "rail" | "compact";
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemePref>(readTheme);

  const [signOutState, setSignOutState] = useState<
    "idle" | "pending" | "failed"
  >("idle");

  async function signOut() {
    if (signOutState === "pending") return;
    setSignOutState("pending");
    try {
      const { error } = await authClient.signOut();
      if (error) throw error;
    } catch (error) {
      // Stay put: pushing to /login with a live session would just bounce back.
      console.error("Sign-out failed", error);
      setSignOutState("failed");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "group/account hover:bg-accent data-popup-open:bg-accent focus-visible:ring-ring flex items-center gap-3 rounded-xl text-left transition-colors duration-150 outline-none focus-visible:ring-2",
          variant === "rail"
            ? "w-full p-2 md:justify-center lg:justify-start"
            : "rounded-full p-1"
        )}
      >
        <InitialsAvatar
          name={user.name}
          seed={user.id}
          src={user.photoUrl}
          className="size-8"
        />
        {variant === "rail" && (
          <>
            <span className="hidden min-w-0 flex-1 lg:block">
              <span className="block truncate text-sm font-medium">
                {user.name}
              </span>
              {user.headline && (
                <span className="text-muted-foreground block truncate text-xs">
                  {user.headline}
                </span>
              )}
            </span>
            <ChevronsUpDown
              aria-hidden
              className="text-muted-foreground group-hover/account:text-foreground hidden size-4 shrink-0 transition-colors lg:block"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "rail" ? "start" : "end"}
        side={variant === "rail" ? "top" : "bottom"}
        sideOffset={8}
        className="w-72 rounded-xl p-1.5"
      >
        {/* The profile card is the "View profile" item: one big target instead of a header plus a link. */}
        <DropdownMenuItem
          aria-label="View profile"
          render={<Link href="/profile" />}
          className="gap-3 rounded-lg p-2"
        >
          <InitialsAvatar
            name={user.name}
            seed={user.id}
            src={user.photoUrl}
            size="lg"
            className="size-10"
          />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate font-medium">{user.name}</span>
            {user.headline && (
              <span className="text-muted-foreground block truncate text-xs">
                {user.headline}
              </span>
            )}
            <span className="text-brand mt-0.5 block text-xs font-medium">
              View profile
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuGroup>
          {LINKS.map(({ href, label, icon: Icon }) => (
            <DropdownMenuItem
              key={href}
              render={<Link href={href} />}
              className="gap-2.5 rounded-lg px-2 py-1.5"
            >
              <Icon aria-hidden className="text-muted-foreground" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 pt-0.5 pb-1.5 text-xs">
            Theme
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => {
              const pref = parseTheme(value as string);
              setTheme(pref);
              applyTheme(pref);
            }}
            className="bg-muted mx-1 mb-1 grid grid-cols-3 gap-1 rounded-lg p-1"
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                closeOnClick={false}
                className="text-muted-foreground data-checked:bg-background data-checked:text-foreground justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs data-checked:shadow-xs [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden"
              >
                <Icon aria-hidden className="size-3.5" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1.5" />
        {/* closeOnClick off so the pending and failed states stay visible in the open menu. */}
        <DropdownMenuItem
          variant="destructive"
          closeOnClick={false}
          onClick={() => void signOut()}
          className="gap-2.5 rounded-lg px-2 py-1.5"
        >
          <LogOut aria-hidden />
          {signOutState === "pending"
            ? "Signing out…"
            : signOutState === "failed"
              ? "Couldn't sign out. Try again"
              : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
