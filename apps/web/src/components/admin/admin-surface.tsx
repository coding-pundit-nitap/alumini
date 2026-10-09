import Link from "next/link";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { buttonVariants } from "@nitap/ui/components/button";

import { cn } from "@/lib/utils";

export function AdminPageHeader({
  title,
  description,
  actions,
  back,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div>
        {back && (
          <Link
            href={back.href}
            className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            {back.label}
          </Link>
        )}
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AdminPanel({
  title,
  description,
  actions,
  toolbar,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("bg-card overflow-hidden rounded-xl border", className)}
    >
      {(title || description || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="text-muted-foreground mt-0.5 text-sm">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {toolbar && (
        <div className="bg-muted/30 border-b px-4 py-3">{toolbar}</div>
      )}
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export function AdminEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="bg-muted flex size-12 items-center justify-center rounded-full">
        <Icon aria-hidden className="text-muted-foreground size-5" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function AdminPager({
  href,
  label,
}: {
  href: string | null;
  label: string;
}) {
  if (!href) return null;
  return (
    <div className="flex justify-end">
      <Link
        href={href}
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "rounded-full",
        })}
      >
        {label}
        <ChevronRight aria-hidden />
      </Link>
    </div>
  );
}
