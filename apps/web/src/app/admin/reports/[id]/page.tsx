import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@nitap/ui/components/badge";

import { dismissReportAction, resolveReportAction } from "@/app/feed/actions";
import { readReportedMessage } from "@/composition/messaging";
import { getReport } from "@/composition/moderation";
import { AppError } from "@/lib/errors";
import { ConfirmButton, isUuid } from "@/modules/admin";
import { can, getActor, PERMISSIONS } from "@/modules/auth";
import {
  ReportedMessageContext,
  type ReportedMessageView,
} from "@/modules/messaging";
import {
  ReportDecisionDialog,
  STATUS_LABELS,
  TARGET_LABELS,
} from "@/modules/moderation";

import { claimReportFormAction } from "./actions";

export const metadata: Metadata = { title: "Report" };

const LIVE = new Set(["OPEN", "UNDER_REVIEW"]);

/** FR-MOD-002…004, spec C12-7. Viewing a MESSAGE report is the audited `message.read_reported` access. */
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const actor = await getActor();

  let view;
  try {
    view = await getReport({ actor, reportId: id });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  const { report, selfReview } = view;

  let context: ReportedMessageView | null = null;
  if (
    report.targetType === "MESSAGE" &&
    can(actor, PERMISSIONS.MESSAGE_READ_REPORTED)
  ) {
    try {
      context = await readReportedMessage({ actor, reportId: id });
    } catch (error) {
      if (!(error instanceof AppError && error.status === 404)) throw error;
    }
  }

  const blocked = selfReview
    ? "You filed this report or it is about you, so someone else must review it."
    : undefined;
  const live = LIVE.has(report.status);
  // "" disables every button without repeating the note under each (both components render the note only when truthy).
  const disabled = blocked === undefined ? undefined : "";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/reports" className="text-primary text-sm underline">
        All reports
      </Link>
      <h1 className="flex items-center gap-3 text-2xl font-semibold">
        {TARGET_LABELS[report.targetType]} report
        <Badge variant="secondary">{STATUS_LABELS[report.status]}</Badge>
      </h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Reporter</dt>
        <dd>{report.reporter.name}</dd>
        <dt className="text-muted-foreground">Reporter&apos;s reason</dt>
        <dd className="whitespace-pre-wrap">{report.reason}</dd>
        <dt className="text-muted-foreground">Filed</dt>
        <dd>
          {report.createdAt.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}
        </dd>
        {report.resolvedBy ? (
          <>
            <dt className="text-muted-foreground">Decided by</dt>
            <dd>{report.resolvedBy.name}</dd>
          </>
        ) : null}
      </dl>

      {report.targetType === "POST" || report.targetType === "COMMENT" ? (
        <p className="rounded-lg border p-3 text-sm whitespace-pre-wrap">
          {report.preview
            ? report.preview.text
            : "The reported content no longer exists."}
          {report.preview?.deleted ? (
            <Badge variant="outline" className="ml-2">
              Removed
            </Badge>
          ) : null}
        </p>
      ) : null}
      {report.targetType === "MESSAGE" ? (
        context ? (
          <ReportedMessageContext view={context} />
        ) : (
          <p className="text-muted-foreground text-sm">
            The reported message no longer exists.
          </p>
        )
      ) : null}
      {report.targetType === "USER" ? (
        <p className="text-sm">
          Reported user: {report.preview?.text ?? "no longer exists"}.{" "}
          {can(actor, PERMISSIONS.USER_READ_ADMIN) && report.preview ? (
            <Link
              href={`/admin/users/${report.targetId}`}
              className="text-primary underline"
            >
              Open their admin page to suspend them
            </Link>
          ) : null}
        </p>
      ) : null}

      {live && blocked ? (
        <p className="text-muted-foreground text-sm">{blocked}</p>
      ) : null}
      {live ? (
        <div className="flex flex-wrap items-start gap-2">
          {report.status === "OPEN" ? (
            <ConfirmButton
              label="Claim"
              title="Claim this report?"
              description="Other moderators will see it as under review."
              confirmLabel="Claim report"
              fields={{ reportId: report.id }}
              action={claimReportFormAction}
              disabledReason={disabled}
            />
          ) : null}
          <ReportDecisionDialog
            outcome="resolve"
            reportId={report.id}
            action={resolveReportAction}
            disabledReason={disabled}
          />
          <ReportDecisionDialog
            outcome="dismiss"
            reportId={report.id}
            action={dismissReportAction}
            disabledReason={disabled}
          />
        </div>
      ) : null}
    </div>
  );
}
