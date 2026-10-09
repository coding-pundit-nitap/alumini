import Link from "next/link";
import {
  FileText,
  Flag,
  MessageCircle,
  MessageSquareText,
  User,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@nitap/ui/components/badge";
import { buttonVariants } from "@nitap/ui/components/button";
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

const TARGET_ICON: Record<ReportView["targetType"], LucideIcon> = {
  POST: FileText,
  COMMENT: MessageSquareText,
  MESSAGE: MessageCircle,
  USER: User,
};

const STATUS_BADGE: Record<
  ReportView["status"],
  "brand" | "secondary" | "success" | "outline"
> = {
  OPEN: "brand",
  UNDER_REVIEW: "secondary",
  RESOLVED: "success",
  DISMISSED: "outline",
};

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

// Module code may not import @/components/admin/*, so this empty state is inline markup that
// matches AdminEmpty's shape rather than the shared component itself.
/** The reports queue. Message text never appears here. */
export function ReportsTable({ rows }: { rows: ReportView[] }) {
  if (rows.length === 0)
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <Flag aria-hidden className="text-muted-foreground size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">No reports</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            No reports match these filters.
          </p>
        </div>
      </div>
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
        {rows.map((r) => {
          const TargetIcon = TARGET_ICON[r.targetType];
          return (
            <TableRow key={r.id}>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <TargetIcon
                    aria-hidden
                    className="text-muted-foreground size-3.5"
                  />
                  {TARGET_LABELS[r.targetType]}
                </span>
              </TableCell>
              <TableCell className="max-w-xs">
                <Preview row={r} />
              </TableCell>
              <TableCell className="max-w-xs">
                <span className="line-clamp-2">{r.reason}</span>
              </TableCell>
              <TableCell>{r.reporter.name}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE[r.status]}>
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
                  className={buttonVariants({
                    variant: "ghost",
                    size: "sm",
                    className: "rounded-full",
                  })}
                >
                  View<span className="sr-only"> report {r.id}</span>
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
