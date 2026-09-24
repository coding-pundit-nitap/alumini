import Link from "next/link";
import { siteConfig } from "@/config/site";
import { buttonVariants } from "@nitap/ui/components/button";
import { hasAdminAccess } from "@/modules/admin";
import { can, getActor } from "@/modules/auth";
import { NotificationBell } from "@/modules/notifications";

const NAV_LINK =
  "text-muted-foreground hover:text-foreground text-sm font-medium transition-colors";

export async function Header() {
  const actor = await getActor();
  return (
    <header className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg font-extrabold shadow-sm">
              AP
            </span>
            <span className="sm:hidden">{siteConfig.shortName}</span>
            <span className="hidden sm:inline">{siteConfig.name}</span>
          </Link>
        </div>

        <nav className="flex items-center gap-4">
          {actor ? (
            <Link href="/dashboard" className={NAV_LINK}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/#how-it-works" className={NAV_LINK}>
                About
              </Link>
              <Link href="/login" className={NAV_LINK}>
                Log in
              </Link>
              <Link href="/register" className={buttonVariants({ size: "sm" })}>
                Join
              </Link>
            </>
          )}
          {actor && hasAdminAccess((permission) => can(actor, permission)) ? (
            <Link href="/admin" className={NAV_LINK}>
              Admin
            </Link>
          ) : null}
          {actor ? <NotificationBell /> : null}
        </nav>
      </div>
    </header>
  );
}
