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

import type { AuditRow } from "../../application/admin-store";

const when = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/** The filtered audit read (FR-ADMIN-004). Metadata is ids only by the writer's contract. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No entries</EmptyTitle>
          <EmptyDescription>
            Nothing in the audit log matches these filters.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap">
              <time dateTime={r.createdAt.toISOString()}>
                {when.format(r.createdAt)}
              </time>
            </TableCell>
            <TableCell>
              <span className="flex flex-col">
                <span>{r.actor.name}</span>
                <span className="text-muted-foreground text-xs">
                  {r.actor.email}
                </span>
              </span>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{r.action}</Badge>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {r.targetType}/{r.targetId}
            </TableCell>
            <TableCell>
              <details>
                <summary className="cursor-pointer text-sm">Metadata</summary>
                <pre className="bg-muted mt-2 max-w-md overflow-x-auto rounded-md p-2 text-xs">
                  {JSON.stringify(
                    { ...r.metadata, requestId: r.requestId },
                    null,
                    2
                  )}
                </pre>
              </details>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
