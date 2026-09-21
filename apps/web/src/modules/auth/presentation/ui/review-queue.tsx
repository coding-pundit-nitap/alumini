import Link from "next/link";

import type { ActionResult } from "@/lib/action-result";

import type { PendingPage } from "../../application/list-pending-verification-requests";
import { DecisionForm } from "./decision-form";

const CROSS_CHECK_LABEL = {
  NOT_CHECKED: "Not checked against institute records",
  MATCH: "Matches institute records",
  MISMATCH: "Does not match institute records",
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
  if (page.items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No requests are waiting for review.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {page.items.map((item) => (
          <li
            key={item.id}
            data-testid={`request-${item.rollNumber}`}
            className="border-border space-y-3 rounded-lg border p-4"
          >
            <div>
              <p className="font-medium">{item.applicantName}</p>
              <p className="text-muted-foreground text-sm">
                {item.applicantEmail}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Roll number</dt>
              <dd>{item.rollNumber}</dd>
              <dt className="text-muted-foreground">Department</dt>
              <dd>{item.departmentName}</dd>
              <dt className="text-muted-foreground">Degree</dt>
              <dd>{item.degreeName}</dd>
              <dt className="text-muted-foreground">Graduation year</dt>
              <dd>{item.graduationYear}</dd>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd>{item.submittedAt.toISOString().slice(0, 10)}</dd>
              <dt className="text-muted-foreground">Cross-check</dt>
              <dd>{CROSS_CHECK_LABEL[item.crossCheck]}</dd>
            </dl>
            {item.supportingInfo ? (
              <p className="text-sm">{item.supportingInfo}</p>
            ) : null}
            <DecisionForm requestId={item.id} action={action} />
          </li>
        ))}
      </ul>
      {nextHref ? (
        <Link href={nextHref} className="text-sm underline">
          Next
        </Link>
      ) : null}
    </div>
  );
}
