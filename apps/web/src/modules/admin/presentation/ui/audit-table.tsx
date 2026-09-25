import { ScrollText } from "lucide-react";

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

import { relativeTime } from "@/lib/relative-time";

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
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <ScrollText aria-hidden className="text-muted-foreground size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">No entries</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Nothing in the audit log matches these filters.
          </p>
        </div>
      </div>
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
              <time
                dateTime={r.createdAt.toISOString()}
                title={when.format(r.createdAt)}
              >
                {relativeTime(r.createdAt)}
              </time>
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-2">
                <InitialsAvatar
                  name={r.actor.name}
                  seed={r.actor.id}
                  size="sm"
                />
                <span className="flex flex-col">
                  <span>{r.actor.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {r.actor.email}
                  </span>
                </span>
              </span>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="font-mono text-[11px]">
                {r.action}
              </Badge>
            </TableCell>
            <TableCell
              className="max-w-[14rem] truncate font-mono text-xs"
              title={`${r.targetType}/${r.targetId}`}
            >
              {r.targetType}/{r.targetId}
            </TableCell>
            <TableCell>
              <details>
                <summary className="cursor-pointer text-sm">Metadata</summary>
                <pre className="bg-muted mt-2 rounded-lg p-3 text-[11px]">
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
