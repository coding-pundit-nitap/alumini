import { notFound, redirect } from "next/navigation";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@nitap/ui/components/sidebar";

import { AdminSidebar, adminNavigation } from "@/modules/admin";
import { can, getActor } from "@/modules/auth";

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
    <SidebarProvider className="min-h-[calc(100svh-4rem)]">
      <AdminSidebar items={items} />
      <SidebarInset>
        <div className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-medium">Administration</span>
        </div>
        <div className="w-full px-4 py-8 sm:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
