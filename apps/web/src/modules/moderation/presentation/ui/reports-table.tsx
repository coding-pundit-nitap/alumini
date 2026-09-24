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

import type { ReportView } from "../../application/moderation-store";
import { STATUS_LABELS, TARGET_LABELS } from "./labels";

function Preview({ row }: { row: ReportView }) {
  if (row.targetType === "MESSAGE")
    return (
      <span className="text-muted-foreground italic">
        Private message: open the report to read the message.
      </span>
    );
  if (!row.preview)
    return (
      <span className="text-muted-foreground italic">No longer exists.</span>
    );
  return (
    <span className="flex items-center gap-2">
      <span className="line-clamp-2">{row.preview.text}</span>
      {row.preview.deleted ? <Badge variant="outline">Removed</Badge> : null}
    </span>
  );
}

/** FR-MOD-002: the reports queue. Message text never appears here (spec C12-5). */
export function ReportsTable({ rows }: { rows: ReportView[] }) {
  if (rows.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No reports</EmptyTitle>
          <EmptyDescription>No reports match these filters.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Content</TableHead>
          <TableHead>Reporter&apos;s reason</TableHead>
          <TableHead>Reporter</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Filed</TableHead>
          <TableHead>
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{TARGET_LABELS[r.targetType]}</TableCell>
            <TableCell className="max-w-xs">
              <Preview row={r} />
            </TableCell>
            <TableCell className="max-w-xs">
              <span className="line-clamp-2">{r.reason}</span>
            </TableCell>
            <TableCell>{r.reporter.name}</TableCell>
            <TableCell>
              <Badge variant={r.status === "OPEN" ? "default" : "secondary"}>
                {STATUS_LABELS[r.status]}
              </Badge>
            </TableCell>
            <TableCell>
              {r.createdAt.toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}
            </TableCell>
            <TableCell>
              <Link
                href={`/admin/reports/${r.id}`}
                className="text-primary underline"
              >
                View<span className="sr-only"> report {r.id}</span>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
