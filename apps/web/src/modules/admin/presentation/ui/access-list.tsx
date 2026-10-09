import { Badge } from "@nitap/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nitap/ui/components/table";

import type { UserDetail } from "../../application/admin-store";
import {
  ESCALATION_MESSAGES,
  type AccessOptions,
} from "../../domain/escalation";
import { ConfirmButton, type AccessAction } from "./confirm-button";
import { LAST_SUPER_ADMIN_NOTE } from "./labels";

const date = (d: Date) =>
  d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });

/** The user's roles. A remove action is passed only when the viewer may use it; a blocked one is
 * disabled with its reason. */
export function RolesTable(props: {
  user: UserDetail;
  options: AccessOptions;
  superAdminRole: string;
  blocked: string | undefined;
  revokeRole?: AccessAction;
}) {
  const { user } = props;
  const names = user.roles.map((r) => r.name);

  const roleBlock = (role: string) => {
    if (props.blocked) return props.blocked;
    const reason = props.options.roles.find((r) => r.name === role)?.reason;
    if (reason) return ESCALATION_MESSAGES[reason];
    return role === props.superAdminRole && user.isLastSuperAdmin
      ? LAST_SUPER_ADMIN_NOTE
      : undefined;
  };

  if (user.roles.length === 0)
    return <p className="text-muted-foreground p-4 text-sm">No roles.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Role</TableHead>
          <TableHead>Granted by</TableHead>
          <TableHead>Since</TableHead>
          {props.revokeRole ? <TableHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {user.roles.map((r) => (
          <TableRow key={r.name}>
            <TableCell>{r.name}</TableCell>
            <TableCell>{r.grantedBy.name}</TableCell>
            <TableCell>{date(r.grantedAt)}</TableCell>
            {props.revokeRole ? (
              <TableCell>
                <ConfirmButton
                  label="Remove"
                  variant="destructive"
                  title={`Remove ${r.name}?`}
                  description={`Roles: ${names.join(", ")} → ${
                    names.filter((n) => n !== r.name).join(", ") || "none"
                  }`}
                  confirmLabel="Remove"
                  fields={{ userId: user.id, role: r.name }}
                  disabledReason={roleBlock(r.name)}
                  action={props.revokeRole}
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The user's direct permission grants. Same revoke/blocked contract as {@link RolesTable}. */
export function GrantsTable(props: {
  user: UserDetail;
  options: AccessOptions;
  blocked: string | undefined;
  now: Date;
  revokeGrant?: AccessAction;
}) {
  const { user } = props;

  // E2 applies to revoking as to granting: the same scope the grant sits in.
  const grantBlock = (g: UserDetail["grants"][number]) => {
    if (props.blocked) return props.blocked;
    const opt = props.options.permissions.find(
      (p) => p.permission === g.permission
    );
    const reason = g.scope === "GLOBAL" ? opt?.global : opt?.chapter;
    return reason === undefined || reason === "NOT_SCOPABLE"
      ? undefined
      : ESCALATION_MESSAGES[reason];
  };

  if (user.grants.length === 0)
    return (
      <p className="text-muted-foreground p-4 text-sm">No direct grants.</p>
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Permission</TableHead>
          <TableHead>Scope</TableHead>
          <TableHead>Granted by</TableHead>
          <TableHead>Expires</TableHead>
          {props.revokeGrant ? <TableHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {user.grants.map((g) => (
          <TableRow key={g.id}>
            <TableCell className="font-mono text-xs">{g.permission}</TableCell>
            <TableCell>
              {g.scope === "GLOBAL" ? "Global" : `Chapter: ${g.chapterSlug}`}
            </TableCell>
            <TableCell>{g.grantedBy.name}</TableCell>
            <TableCell>
              <span className="flex items-center gap-2">
                {g.expiresAt ? date(g.expiresAt) : "Never"}
                {g.expiresAt && g.expiresAt <= props.now ? (
                  <Badge variant="destructive">Expired</Badge>
                ) : null}
              </span>
            </TableCell>
            {props.revokeGrant ? (
              <TableCell>
                <ConfirmButton
                  label="Revoke"
                  variant="destructive"
                  title={`Revoke ${g.permission}?`}
                  description="They lose this permission on their next request."
                  confirmLabel="Revoke"
                  fields={{ userId: user.id, grantId: g.id }}
                  disabledReason={grantBlock(g)}
                  action={props.revokeGrant}
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The user's roles and grants together. A remove/revoke action is passed only when the viewer may
 * use it; a blocked one is disabled with its reason. Kept as a thin wrapper over
 * {@link RolesTable} and {@link GrantsTable} for callers that want both without separate panels.
 */
export function AccessList(props: {
  user: UserDetail;
  options: AccessOptions;
  superAdminRole: string;
  blocked: string | undefined;
  now: Date;
  revokeRole?: AccessAction;
  revokeGrant?: AccessAction;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Roles</h2>
        <RolesTable
          user={props.user}
          options={props.options}
          superAdminRole={props.superAdminRole}
          blocked={props.blocked}
          {...(props.revokeRole ? { revokeRole: props.revokeRole } : {})}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Permission grants</h2>
        <GrantsTable
          user={props.user}
          options={props.options}
          blocked={props.blocked}
          now={props.now}
          {...(props.revokeGrant ? { revokeGrant: props.revokeGrant } : {})}
        />
      </section>
    </div>
  );
}
