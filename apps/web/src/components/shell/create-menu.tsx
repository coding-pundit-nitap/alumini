"use client";

import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nitap/ui/components/dropdown-menu";

import { cn } from "@/lib/utils";

import type { CreateAction } from "./nav-model";

const COMPOSE = "/dashboard#compose";

/** Post lives on Home: when already there, jump focus to the composer (adds `#compose`). */
export function useCreateClick() {
  const pathname = usePathname();
  return (href: string) => {
    if (href === COMPOSE && pathname === "/dashboard")
      document.getElementById("compose")?.focus();
  };
}

const TRIGGER = cn(
  buttonVariants({ variant: "brand", size: "lg" }),
  "w-full md:size-9 md:px-0 lg:h-9 lg:w-full lg:px-2.5"
);

/** The rail's primary action: nothing, one plain button, or a menu when there are several. */
export function CreateMenu({ actions }: { actions: CreateAction[] }) {
  const onCreate = useCreateClick();
  if (actions.length === 0) return null;

  if (actions.length === 1) {
    const [only] = actions as [CreateAction];
    return (
      <Link
        href={only.href}
        onClick={() => onCreate(only.href)}
        aria-label={`Create ${only.label.toLowerCase()}`}
        className={TRIGGER}
      >
        <Plus aria-hidden="true" />
        <span className="hidden lg:inline">
          Create {only.label.toLowerCase()}
        </span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Create" className={TRIGGER}>
        <Plus aria-hidden="true" />
        <span className="hidden lg:inline">Create</span>
        <ChevronDown aria-hidden="true" className="ml-auto hidden lg:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.href}
            render={<Link href={action.href} />}
            onClick={() => onCreate(action.href)}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
