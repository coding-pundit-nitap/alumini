import Link from "next/link";
import { UserSearch } from "lucide-react";

import { Badge } from "@nitap/ui/components/badge";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";

import type { ActionResult } from "@/lib/action-result";

import type { PendingPage } from "../../application/list-pending-verification-requests";
import { DecisionForm } from "./decision-form";

const CROSS_CHECK_LABEL = {
  NOT_CHECKED: "Not checked against institute records",
  MATCH: "Matches institute records",
  MISMATCH: "Does not match institute records",
} as const;

const CROSS_CHECK_BADGE = {
  NOT_CHECKED: "secondary",
  MATCH: "success",
  MISMATCH: "destructive",
} as const;

/** The pending queue, oldest first. Each item carries its evidence, its cross-check result and a decision form. */
export function ReviewQueue({
  page,
  action,
  nextHref,
}: {
  page: PendingPage;
  action: (
    formData: FormData
  ) => Promise<ActionResult<{ outcome: "decided" | "already_decided" }>>;
  nextHref: string | null;
}) {
  // Module code may not import @/components/admin/*, so this empty state is inline markup that
  // matches AdminEmpty's shape rather than the shared component itself.
  if (page.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <UserSearch aria-hidden className="text-muted-foreground size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">
            No requests are waiting for review.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {page.items.map((item) => (
          <li
            key={item.id}
            data-testid={`request-${item.rollNumber}`}
            className="bg-card space-y-4 rounded-xl border p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <InitialsAvatar name={item.applicantName} seed={item.id} />
                <div>
                  <p className="font-medium">{item.applicantName}</p>
                  <p className="text-muted-foreground text-sm">
                    {item.applicantEmail}
                  </p>
                </div>
              </div>
              <Badge variant={CROSS_CHECK_BADGE[item.crossCheck]}>
                {CROSS_CHECK_LABEL[item.crossCheck]}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-xs">Roll number</dt>
                <dd className="text-sm font-medium">{item.rollNumber}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Department</dt>
                <dd className="text-sm font-medium">{item.departmentName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Degree</dt>
                <dd className="text-sm font-medium">{item.degreeName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  Graduation year
                </dt>
                <dd className="text-sm font-medium">{item.graduationYear}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Submitted</dt>
                <dd className="text-sm font-medium">
                  {item.submittedAt.toISOString().slice(0, 10)}
                </dd>
              </div>
            </dl>
            {item.supportingInfo ? (
              <p className="border-l-2 pl-3 text-sm">{item.supportingInfo}</p>
            ) : null}
            {item.history.length > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer">
                  {(() => {
                    const rejected = item.history.filter(
                      (h) => h.status === "REJECTED"
                    ).length;
                    return rejected > 0
                      ? `Previously rejected ×${rejected}`
                      : `${item.history.length} earlier request${item.history.length === 1 ? "" : "s"}`;
                  })()}
                </summary>
                <ul className="mt-2 space-y-1">
                  {item.history.map((h, i) => (
                    <li key={i}>
                      {h.status === "REJECTED" ? "Rejected" : "Approved"}
                      {h.decidedAt
                        ? ` on ${h.decidedAt.toISOString().slice(0, 10)}`
                        : ""}
                      {h.note ? `: ${h.note}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <div className="border-t pt-4">
              <DecisionForm requestId={item.id} action={action} />
            </div>
          </li>
        ))}
      </ul>
      {nextHref ? (
        <Link
          href={nextHref}
          className="bg-card hover:bg-accent hover:text-foreground inline-flex items-center rounded-full border px-3 py-1.5 text-sm"
        >
          Next
        </Link>
      ) : null}
    </div>
  );
}
