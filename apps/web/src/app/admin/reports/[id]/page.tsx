import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@nitap/ui/components/badge";

import {
  dismissReportAction,
  resolveReportAction,
} from "@/app/(app)/feed/actions";
import { AdminPageHeader, AdminPanel } from "@/components/admin/admin-surface";
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
  const canReadMessage = can(actor, PERMISSIONS.MESSAGE_READ_REPORTED);
  if (report.targetType === "MESSAGE" && canReadMessage) {
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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        back={{ href: "/admin/reports", label: "All reports" }}
        title={
          <>
            {TARGET_LABELS[report.targetType]} report
            <Badge variant="secondary">{STATUS_LABELS[report.status]}</Badge>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <AdminPanel title="Reported content">
          {report.targetType === "POST" || report.targetType === "COMMENT" ? (
            <p className="p-4 text-sm whitespace-pre-wrap">
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
            <div className="p-4">
              {context ? (
                <ReportedMessageContext view={context} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {canReadMessage
                    ? "The reported message no longer exists."
                    : "You cannot view private messages."}
                </p>
              )}
            </div>
          ) : null}
          {report.targetType === "USER" ? (
            <p className="p-4 text-sm">
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
        </AdminPanel>
        <div className="flex flex-col gap-6">
          <AdminPanel title="Report">
            <dl className="grid grid-cols-1 gap-y-3 p-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Reporter</dt>
                <dd>{report.reporter.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Reporter&apos;s reason
                </dt>
                <dd className="whitespace-pre-wrap">{report.reason}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Filed</dt>
                <dd>
                  {report.createdAt.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </dd>
              </div>
              {report.resolvedBy ? (
                <div>
                  <dt className="text-muted-foreground">Decided by</dt>
                  <dd>{report.resolvedBy.name}</dd>
                </div>
              ) : null}
            </dl>
          </AdminPanel>
          {live ? (
            <AdminPanel title="Actions">
              <div className="flex flex-col gap-3 p-4">
                {blocked ? (
                  <p className="text-muted-foreground text-sm">{blocked}</p>
                ) : null}
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
            </AdminPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
