import { ArrowUpRight, Clock, type LucideIcon } from "lucide-react";

import { buttonVariants } from "@nitap/ui/components/button";
import { avatarTone } from "@nitap/ui/lib/avatar-tone";
import { cn } from "@nitap/ui/lib/utils";

import { deadlineLabel } from "../labels";

// No "use client": the server-rendered detail page passes icon components into Meta.

/** The company's initials on a stable tint (there are no company logos). */
export function CompanyMark({
  company,
  className,
}: {
  company: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold uppercase",
        avatarTone(company.toLowerCase()),
        className
      )}
    >
      {company.trim().slice(0, 2)}
    </span>
  );
}

export function Meta({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** "Closes in 2 days", tinted when it is close. */
export function Deadline({ deadline }: { deadline: Date }) {
  const { text, soon } = deadlineLabel(deadline);
  return (
    <time
      dateTime={deadline.toISOString().slice(0, 10)}
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1",
        soon && "text-brand font-medium"
      )}
    >
      <Clock aria-hidden className="size-3.5" />
      {text}
    </time>
  );
}

export function ApplyLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({
        size: "sm",
        className: cn("rounded-full", className),
      })}
    >
      Apply
      <ArrowUpRight aria-hidden />
    </a>
  );
}
