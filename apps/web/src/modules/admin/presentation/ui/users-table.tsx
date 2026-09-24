import Link from "next/link";

import { Badge } from "@nitap/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@nitap/ui/components/empty";
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

const REMOVED = new Set(["SUSPENDED", "DEACTIVATED"]);

/** FR-ADMIN-002: the filtered user list; each name opens the user's page. */
export function UsersTable({ rows }: { rows: UserRow[] }) {
  if (rows.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No users</EmptyTitle>
          <EmptyDescription>No users match these filters.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((u) => (
          <TableRow key={u.id}>
            <TableCell>
              <Link
                href={`/admin/users/${u.id}`}
                className="font-medium hover:underline"
              >
                {u.name}
              </Link>
            </TableCell>
            <TableCell>{u.email}</TableCell>
            <TableCell>
              <Badge
                variant={
                  REMOVED.has(u.accountState) ? "destructive" : "secondary"
                }
              >
                {STATE_LABEL[u.accountState] ?? u.accountState}
              </Badge>
            </TableCell>
            <TableCell>
              <span className="flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <Badge key={r} variant="outline">
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
