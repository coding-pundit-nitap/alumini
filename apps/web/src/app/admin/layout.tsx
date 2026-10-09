import { notFound, redirect } from "next/navigation";

import { AdminRail } from "@/components/admin/admin-rail";
import { adminNavigation, groupAdminNav } from "@/modules/admin";
import { can, getActor } from "@/modules/auth";

/**
 * Not a security boundary: every page authorizes through its own use case. This
 * only hides the shell (404) from anyone without an admin permission.
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
    <div className="flex min-h-svh flex-col md:flex-row">
      <AdminRail groups={groupAdminNav(items)} />
      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
