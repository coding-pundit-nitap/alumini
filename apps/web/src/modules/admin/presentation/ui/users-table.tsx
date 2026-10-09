import Link from "next/link";
import { UserSearch } from "lucide-react";

import { Badge } from "@nitap/ui/components/badge";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nitap/ui/components/table";

import type { UserRow } from "../../application/admin-store";
import { STATE_LABEL } from "./labels";

// Module code may not import @/components/admin/*, so this empty state is inline markup that
// matches AdminEmpty's shape rather than the shared component itself.
const STATE_BADGE: Record<string, "success" | "brand" | "destructive"> = {
  VERIFIED: "success",
  PENDING: "brand",
  REJECTED: "destructive",
  SUSPENDED: "destructive",
  DEACTIVATED: "destructive",
};

/** The filtered user list; each name opens the user's page. */
export function UsersTable({ rows }: { rows: UserRow[] }) {
  if (rows.length === 0)
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <UserSearch aria-hidden className="text-muted-foreground size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">No users</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            No users match these filters.
          </p>
        </div>
      </div>
    );
  return (
    <Table>
      <TableHeader className="bg-muted/40 text-muted-foreground sticky top-0 text-xs tracking-wide uppercase">
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((u) => (
          <TableRow key={u.id}>
            <TableCell>
              <span className="flex items-center gap-2">
                <InitialsAvatar name={u.name} seed={u.id} size="sm" />
                <span className="flex flex-col">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="font-medium hover:underline"
                  >
                    {u.name}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {u.email}
                  </span>
                </span>
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={STATE_BADGE[u.accountState] ?? "secondary"}>
                {STATE_LABEL[u.accountState] ?? u.accountState}
              </Badge>
            </TableCell>
            <TableCell>
              <span className="flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <Badge
                    key={r}
                    variant="outline"
                    className="font-mono text-[11px]"
                  >
                    {r}
                  </Badge>
                ))}
              </span>
            </TableCell>
            <TableCell>
              {u.createdAt.toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
