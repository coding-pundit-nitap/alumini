import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@nitap/ui/components/badge";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@nitap/ui/components/tabs";

import { AdminPageHeader, AdminPanel } from "@/components/admin/admin-surface";
import { getUser, listAuditLog } from "@/composition/admin";
import { SUPER_ADMIN_ROLE } from "@/infrastructure/role-permissions";
import { AppError } from "@/lib/errors";
import {
  AccountStateDialog,
  AssignRoleDialog,
  AuditTable,
  ESCALATION_MESSAGES,
  GrantPermissionDialog,
  GrantsTable,
  LAST_SUPER_ADMIN_NOTE,
  RolesTable,
  STATE_LABEL,
  TARGET_STATES,
  canTransition,
  isUuid,
  type AccountStateValue,
} from "@/modules/admin";
import { can, getActor, PERMISSIONS } from "@/modules/auth";

import {
  assignRoleAction,
  changeAccountStateAction,
  grantPermissionAction,
  revokeGrantAction,
  revokeRoleAction,
} from "./actions";

export const metadata: Metadata = { title: "User" };

const SELF_NOTE = "You can't change your own access.";

const STATE_BADGE: Record<string, "success" | "brand" | "destructive"> = {
  VERIFIED: "success",
  PENDING: "brand",
  REJECTED: "destructive",
  SUSPENDED: "destructive",
  DEACTIVATED: "destructive",
};

const date = (d: Date) =>
  d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });

/** One user's state, roles, grants and history, with the actions the viewer may take. */
export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getActor();
  if (!isUuid(id)) notFound();

  let view;
  try {
    view = await getUser({ actor, userId: id });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  const { user, options, isSelf, chapters } = view;
  const allowed = (p: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) =>
    can(actor, p);
  const activity = allowed(PERMISSIONS.AUDIT_READ)
    ? (await listAuditLog({ actor, query: { targetId: id, limit: "20" } })).data
    : null;

  const blocked = isSelf
    ? SELF_NOTE
    : options.target
      ? ESCALATION_MESSAGES[options.target]
      : undefined;
  const lastSuper = user.isLastSuperAdmin ? LAST_SUPER_ADMIN_NOTE : undefined;
  const transitions = TARGET_STATES.filter(
    (to) =>
      canTransition(user.accountState as AccountStateValue, to) &&
      allowed(
        to === "VERIFIED"
          ? PERMISSIONS.USER_REACTIVATE
          : PERMISSIONS.USER_SUSPEND
      )
  );
  const canRoles = allowed(PERMISSIONS.ROLE_ASSIGN);
  const canGrants = allowed(PERMISSIONS.PERMISSION_GRANT);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        back={{ href: "/admin/users", label: "All users" }}
        title={
          <>
            {user.name}
            <Badge variant={STATE_BADGE[user.accountState] ?? "secondary"}>
              {STATE_LABEL[user.accountState] ?? user.accountState}
            </Badge>
          </>
        }
        description={user.email}
      >
        <div className="mt-3 flex items-center gap-3">
          <InitialsAvatar name={user.name} seed={user.id} size="lg" />
          <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
            <span className="bg-muted rounded-full border px-2.5 py-1">
              Joined {date(user.createdAt)}
            </span>
            {user.deactivatedAt ? (
              <span className="bg-muted rounded-full border px-2.5 py-1">
                Deactivated {date(user.deactivatedAt)}
              </span>
            ) : null}
          </div>
        </div>
      </AdminPageHeader>
      <Tabs defaultValue="overview">
        <TabsList className="bg-muted/70 rounded-full border p-0.5">
          <TabsTrigger
            value="overview"
            className="h-7 rounded-full px-3.5 text-xs"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="access"
            className="h-7 rounded-full px-3.5 text-xs"
          >
            Roles &amp; access
          </TabsTrigger>
          {activity ? (
            <TabsTrigger
              value="activity"
              className="h-7 rounded-full px-3.5 text-xs"
            >
              Activity
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="overview" className="flex flex-col gap-4 pt-4">
          <AdminPanel
            title="Account state"
            description="Suspend, deactivate or reinstate this account."
          >
            <div className="p-4">
              {isSelf ? (
                <p className="text-muted-foreground text-sm">{SELF_NOTE}</p>
              ) : transitions.length > 0 ? (
                <div className="flex flex-wrap items-start gap-3">
                  {transitions.map((to) => (
                    <AccountStateDialog
                      key={to}
                      userId={user.id}
                      userName={user.name}
                      to={to}
                      action={changeAccountStateAction}
                      disabledReason={
                        blocked ?? (to !== "VERIFIED" ? lastSuper : undefined)
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </AdminPanel>
        </TabsContent>
        <TabsContent value="access" className="flex flex-col gap-4 pt-4">
          {isSelf ? (
            <p className="text-muted-foreground text-sm">{SELF_NOTE}</p>
          ) : (
            <>
              <AdminPanel
                title="Roles"
                actions={
                  canRoles ? (
                    <AssignRoleDialog
                      userId={user.id}
                      current={user.roles.map((r) => r.name)}
                      options={options}
                      disabledReason={blocked}
                      action={assignRoleAction}
                    />
                  ) : null
                }
              >
                <RolesTable
                  user={user}
                  options={options}
                  superAdminRole={SUPER_ADMIN_ROLE}
                  blocked={blocked}
                  {...(canRoles ? { revokeRole: revokeRoleAction } : {})}
                />
              </AdminPanel>
              <AdminPanel
                title="Permission grants"
                actions={
                  canGrants ? (
                    <GrantPermissionDialog
                      userId={user.id}
                      options={options}
                      chapters={chapters}
                      disabledReason={blocked}
                      action={grantPermissionAction}
                    />
                  ) : null
                }
              >
                <GrantsTable
                  user={user}
                  options={options}
                  blocked={blocked}
                  now={new Date()}
                  {...(canGrants ? { revokeGrant: revokeGrantAction } : {})}
                />
              </AdminPanel>
            </>
          )}
        </TabsContent>
        {activity ? (
          <TabsContent value="activity" className="pt-4">
            <AdminPanel>
              <AuditTable rows={activity} />
            </AdminPanel>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
