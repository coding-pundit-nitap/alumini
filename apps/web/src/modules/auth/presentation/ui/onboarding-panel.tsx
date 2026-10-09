import type { ReactNode } from "react";

import type { OwnVerification } from "../../application/get-own-verification";
import { AuthCard } from "./auth-card";

/**
 * Which panel of /onboarding applies. Pure presentation of an OwnVerification: the
 * form arrives as a slot so this stays testable. It promises no turnaround.
 */
export function OnboardingPanel({
  own,
  form,
}: {
  own: OwnVerification;
  form: ReactNode;
}) {
  if (own.track === "AWAITING_STAFF_CONFIRMATION") {
    return (
      <AuthCard
        title="Awaiting confirmation by the institute"
        description="Your institute email was recognised. The institute confirms this kind of account itself, so there is nothing for you to submit."
      >
        <p className="text-muted-foreground text-sm">
          You will be able to use the network once that confirmation is done.
        </p>
      </AuthCard>
    );
  }

  const latest = own.latest;

  if (own.locked) {
    return (
      <AuthCard
        title="Please contact the alumni office"
        description="We are not able to accept another verification request from this account."
      >
        {latest?.reviewNote ? (
          <p className="text-sm">
            Last note from the reviewer: {latest.reviewNote}
          </p>
        ) : null}
      </AuthCard>
    );
  }

  if (latest?.status === "PENDING") {
    return (
      <AuthCard
        title="Your request is in review"
        description="A person from the alumni team reviews every request."
      >
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Roll number</dt>
            <dd>{latest.rollNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Graduation year</dt>
            <dd>{latest.graduationYear}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Submitted</dt>
            <dd>{latest.submittedAt.toISOString().slice(0, 10)}</dd>
          </div>
        </dl>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={
        latest?.status === "REJECTED"
          ? "Your request was not approved"
          : "Verify your affiliation"
      }
      description="Tell us how you are connected to NIT Arunachal Pradesh."
    >
      {latest?.status === "REJECTED" ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Note from the reviewer</p>
          <p>{latest.reviewNote}</p>
          <p className="text-muted-foreground">
            You can submit again with corrected details.
          </p>
        </div>
      ) : null}
      {form}
    </AuthCard>
  );
}
