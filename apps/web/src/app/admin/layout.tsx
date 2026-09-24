import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@nitap/ui/components/badge";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@nitap/ui/components/sidebar";

import { Wordmark } from "@/components/brand/dawn-mark";
import { AdminSidebar, adminNavigation } from "@/modules/admin";
import { can, getActor } from "@/modules/auth";

const FOCUS_RING =
  "focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none";

/**
 * The admin shell. NOT a security boundary (spec A12-4): layouts do not re-render on navigation, so every
 * page and route under it authorizes through its own use case. This only hides the shell from anyone
 * holding no admin-tier permission (404, never 403: RBAC §8 rule 6).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fadmin");
  const items = adminNavigation((permission) => can(actor, permission));
  if (items.length === 0) notFound();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-card/80 sticky top-0 z-40 h-14 border-b backdrop-blur">
        <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Link href="/admin" className={FOCUS_RING}>
              <Wordmark compact />
            </Link>
            <Badge variant="brand">Admin</Badge>
          </div>
          <Link
            href="/dashboard"
            className={`text-muted-foreground hover:text-foreground text-sm font-medium transition-colors duration-150 ${FOCUS_RING}`}
          >
            Back to app
          </Link>
        </div>
      </header>
      <SidebarProvider className="min-h-[calc(100svh-3.5rem)]">
        <AdminSidebar items={items} />
        <SidebarInset>
          <div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
            <SidebarTrigger />
            <span className="text-sm font-medium">Administration</span>
          </div>
          <div className="w-full px-4 py-8 sm:px-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
