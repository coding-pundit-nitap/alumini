import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@nitap/ui/components/button";

import { Wordmark } from "@/components/brand/dawn-mark";
import { siteConfig } from "@/config/site";

const NAV_LINK =
  "text-muted-foreground hover:text-foreground rounded-sm text-sm font-medium transition-colors duration-150 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

const FOOTER_LINK =
  "text-muted-foreground hover:text-foreground rounded-sm transition-colors duration-150 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";

const NETWORK = [
  { label: "Directory", href: "/directory" },
  { label: "Mentorship", href: "/mentorship" },
  { label: "Jobs", href: "/jobs" },
  { label: "Events", href: "/events" },
];

const ABOUT = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Privacy", href: "/#privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "/contact" },
];

const ACCOUNT = [
  { label: "Log in", href: "/login" },
  { label: "Create account", href: "/register" },
  { label: "Forgot password", href: "/forgot-password" },
];

/**
 * Takes `signedIn` instead of calling getActor so client pages (error.tsx) can
 * use it.
 */
export function PublicShell({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background/80 border-border/60 sticky top-0 z-50 w-full border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link
            href="/"
            className="focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <Wordmark />
          </Link>
          <nav aria-label="Site" className="flex items-center gap-5">
            {signedIn ? (
              <Link
                href="/post-login"
                className={buttonVariants({ size: "sm" })}
              >
                Open app
              </Link>
            ) : (
              <>
                <Link
                  href="/#how-it-works"
                  className={`${NAV_LINK} hidden sm:inline`}
                >
                  About
                </Link>
                <Link
                  href="/#privacy"
                  className={`${NAV_LINK} hidden sm:inline`}
                >
                  Privacy
                </Link>
                <Link href="/login" className={NAV_LINK}>
                  Log in
                </Link>
                <Link
                  href="/register"
                  className={buttonVariants({ size: "sm" })}
                >
                  Join
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-border/60 border-t">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-8 md:grid-cols-[minmax(0,2fr)_repeat(3,1fr)]">
          <div className="max-w-sm space-y-3">
            <Wordmark />
            <p className="font-display text-foreground text-xl italic">
              Where the dawn-lit mountains keep in touch.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {siteConfig.description}
            </p>
          </div>
          <FooterColumn
            title="Network"
            links={NETWORK.map((l) => ({
              ...l,
              href: signedIn ? l.href : "/register",
            }))}
          />
          <FooterColumn title="About" links={ABOUT} />
          {signedIn ? null : <FooterColumn title="Account" links={ACCOUNT} />}
        </div>
        <div className="border-border/60 border-t">
          <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-xs sm:flex-row sm:justify-between sm:px-8">
            {/* oxlint-disable-next-line react/purity */}
            {/* oxlint-disable-next-line react/purity -- server component */}
            <p>&copy; {new Date().getFullYear()} NIT Arunachal Pradesh</p>
            <p>Made by the NIT AP Coding Club</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <nav aria-label={title} className="text-sm">
      <h2 className="text-foreground mb-3 font-medium">{title}</h2>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className={FOOTER_LINK}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
