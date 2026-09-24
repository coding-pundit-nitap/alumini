import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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

import { listFailedDeliveries } from "@/composition/notifications";
import { AppError } from "@/lib/errors";
import { ConfirmButton } from "@/modules/admin";
import { getActor } from "@/modules/auth";
import type { EmailDeliveryRow } from "@/modules/notifications";

import { replayNotificationAction } from "./actions";

export const metadata: Metadata = { title: "Failed emails" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const when = (d: Date) =>
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
            <TableCell>{d.type}</TableCell>
            <TableCell>{d.recipient.email}</TableCell>
            <TableCell>{d.attempts}</TableCell>
            <TableCell className="text-muted-foreground max-w-xs break-all">
              {d.lastError}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {when(d.updatedAt)}
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

/** FR-N-13 admin replay screen (spec C12-11). 404 without notification.replay (concealed). */
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

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Failed emails</h1>
      {page.failed.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No failed emails</EmptyTitle>
            <EmptyDescription>Nothing needs a replay.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DeliveriesTable rows={page.failed} withAction={true} />
      )}
      {next ? (
        <Link
          href={`/admin/notifications?cursor=${encodeURIComponent(next)}`}
          className="text-sm underline"
        >
          Next
        </Link>
      ) : null}

      <h2 className="text-xl font-semibold">Stuck: not replayable</h2>
      <p className="text-muted-foreground text-sm">
        Pending for over an hour. Replay covers failed emails only.
      </p>
      {page.stuck.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing is stuck.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <DeliveriesTable rows={page.stuck} withAction={false} />
      )}
    </div>
  );
}
