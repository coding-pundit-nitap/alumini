"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@nitap/ui/components/avatar";
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
  { href: "/profile", label: "View profile" },
  { href: "/profile/details", label: "Edit details" },
  { href: "/profile/privacy", label: "Privacy" },
  { href: "/settings/notifications", label: "Notification settings" },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

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

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const avatar = (
    <Avatar className="size-8">
      {user.photoUrl && <AvatarImage src={user.photoUrl} alt="" />}
      <AvatarFallback>{initials(user.name)}</AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "hover:bg-accent focus-visible:ring-ring flex items-center gap-3 rounded-lg text-left transition-colors duration-150 outline-none focus-visible:ring-2",
          variant === "rail"
            ? "w-full p-2 md:justify-center lg:justify-start"
            : "p-1"
        )}
      >
        {avatar}
        {variant === "rail" && (
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
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "rail" ? "start" : "end"}
        side={variant === "rail" ? "top" : "bottom"}
        className="w-60"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-foreground">
            <span className="block truncate text-sm font-medium">
              {user.name}
            </span>
            {user.headline && (
              <span className="text-muted-foreground block truncate text-xs font-normal">
                {user.headline}
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {LINKS.map((link) => (
            <DropdownMenuItem
              key={link.href}
              render={<Link href={link.href} />}
            >
              {link.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => {
              const pref = parseTheme(value as string);
              setTheme(pref);
              applyTheme(pref);
            }}
          >
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
