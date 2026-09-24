import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@nitap/ui/components/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@nitap/ui/components/tabs";

import { getUser, listAuditLog } from "@/composition/admin";
import { SUPER_ADMIN_ROLE } from "@/infrastructure/role-permissions";
import { AppError } from "@/lib/errors";
import {
  AccessList,
  AccountStateDialog,
  AssignRoleDialog,
  AuditTable,
  ESCALATION_MESSAGES,
  GrantPermissionDialog,
  LAST_SUPER_ADMIN_NOTE,
  STATE_LABEL,
  TARGET_STATES,
  canTransition,
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

/** FR-ADMIN-003: one user's state, roles, grants and history, with the actions the viewer may take. */
export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getActor();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

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
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          {user.name}
          <Badge
            variant={
              user.accountState === "SUSPENDED" ||
              user.accountState === "DEACTIVATED"
                ? "destructive"
                : "secondary"
            }
          >
            {STATE_LABEL[user.accountState] ?? user.accountState}
          </Badge>
        </h1>
        <p className="text-muted-foreground text-sm">{user.email}</p>
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="access">Roles &amp; access</TabsTrigger>
          {activity ? (
            <TabsTrigger value="activity">Activity</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="overview" className="flex flex-col gap-4 pt-4">
          <p className="text-sm">
            Joined{" "}
            {user.createdAt.toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}
            {user.deactivatedAt
              ? ` · deactivated ${user.deactivatedAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`
              : ""}
          </p>
          {transitions.length > 0 ? (
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
        </TabsContent>
        <TabsContent value="access" className="flex flex-col gap-4 pt-4">
          {isSelf ? (
            <p className="text-muted-foreground text-sm">{SELF_NOTE}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start gap-3">
                {canRoles ? (
                  <AssignRoleDialog
                    userId={user.id}
                    current={user.roles.map((r) => r.name)}
                    options={options}
                    disabledReason={blocked}
                    action={assignRoleAction}
                  />
                ) : null}
                {canGrants ? (
                  <GrantPermissionDialog
                    userId={user.id}
                    options={options}
                    chapters={chapters}
                    disabledReason={blocked}
                    action={grantPermissionAction}
                  />
                ) : null}
              </div>
              <AccessList
                user={user}
                options={options}
                superAdminRole={SUPER_ADMIN_ROLE}
                blocked={blocked}
                now={new Date()}
                {...(canRoles ? { revokeRole: revokeRoleAction } : {})}
                {...(canGrants ? { revokeGrant: revokeGrantAction } : {})}
              />
            </>
          )}
        </TabsContent>
        {activity ? (
          <TabsContent value="activity" className="pt-4">
            <AuditTable rows={activity} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
