import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Clock, MailCheck } from "lucide-react";

import { Badge } from "@nitap/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nitap/ui/components/table";

import {
  AdminEmpty,
  AdminPager,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-surface";
import { listFailedDeliveries } from "@/composition/notifications";
import { AppError } from "@/lib/errors";
import { relativeTime } from "@/lib/relative-time";
import { ConfirmButton } from "@/modules/admin";
import { getActor } from "@/modules/auth";
import type { EmailDeliveryRow } from "@/modules/notifications";

import { replayNotificationAction } from "./actions";

export const metadata: Metadata = { title: "Failed emails" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const fullTime = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

function DeliveriesTable({
  rows,
  withAction,
}: {
  rows: EmailDeliveryRow[];
  withAction: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Attempts</TableHead>
          <TableHead>Last error</TableHead>
          <TableHead>Updated</TableHead>
          {withAction ? (
            <TableHead>
              <span className="sr-only">Replay</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => (
          <TableRow key={d.id}>
            <TableCell>
              <Badge variant="outline" className="font-mono text-[11px]">
                {d.type}
              </Badge>
            </TableCell>
            <TableCell>{d.recipient.email}</TableCell>
            <TableCell>
              <Badge variant="secondary" className="tabular-nums">
                {d.attempts}
              </Badge>
            </TableCell>
            <TableCell
              className="text-muted-foreground line-clamp-2 max-w-xs truncate font-mono text-[11px] break-all"
              title={d.lastError ?? undefined}
            >
              {d.lastError}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <time
                dateTime={d.updatedAt.toISOString()}
                title={fullTime(d.updatedAt)}
              >
                {relativeTime(d.updatedAt)}
              </time>
            </TableCell>
            {withAction ? (
              <TableCell>
                <ConfirmButton
                  label="Replay"
                  title="Replay this email?"
                  description="The email job is queued again. The delivery updates when the worker runs it."
                  confirmLabel="Replay email"
                  fields={{ notificationId: d.notificationId }}
                  action={replayNotificationAction}
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Admin replay screen. 404 without notification.replay (concealed). */
export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const cursor = first((await searchParams).cursor);

  let page;
  try {
    page = await listFailedDeliveries({ actor: await getActor(), cursor });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.code === "INVALID_CURSOR")
      redirect("/admin/notifications");
    throw error;
  }

  const next = page.nextCursor;
  const nextHref = next
    ? `/admin/notifications?cursor=${encodeURIComponent(next)}`
    : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <AdminPageHeader
        title="Failed emails"
        description="Emails that could not be delivered, and ones stuck in the queue."
      />
      <AdminPanel title="Failed" description="Replay queues the email again.">
        {page.failed.length === 0 ? (
          <AdminEmpty
            icon={MailCheck}
            title="No failed emails"
            description="Nothing needs a replay."
          />
        ) : (
          <DeliveriesTable rows={page.failed} withAction={true} />
        )}
      </AdminPanel>
      <AdminPager href={nextHref} label="Next" />

      <AdminPanel
        title="Stuck: not replayable"
        description="Pending for over an hour. Replay covers failed emails only."
      >
        {page.stuck.length === 0 ? (
          <AdminEmpty icon={Clock} title="Nothing is stuck." />
        ) : (
          <DeliveriesTable rows={page.stuck} withAction={false} />
        )}
      </AdminPanel>
    </div>
  );
}
