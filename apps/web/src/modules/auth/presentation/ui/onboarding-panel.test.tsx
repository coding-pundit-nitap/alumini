import { describe, expect, it } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { OwnVerification } from "../../application/get-own-verification";
import { OnboardingPanel } from "./onboarding-panel";

const base: OwnVerification = {
  track: "EVIDENCE",
  locked: false,
  rejectedCount: 0,
  latest: null,
};
const form = <div data-testid="form">the form</div>;
const latest = (
  over: Partial<NonNullable<OwnVerification["latest"]>>
): OwnVerification["latest"] => ({
  status: "PENDING",
  rollNumber: "NITAP-2019-042",
  graduationYear: 2019,
  reviewNote: null,
  submittedAt: new Date("2026-09-20T10:00:00Z"),
  reviewedAt: null,
  ...over,
});

describe("OnboardingPanel", () => {
  it("shows the form to a new applicant", () => {
    render(<OnboardingPanel own={base} form={form} />);
    expect(screen.getByTestId("form")).toBeInTheDocument();
  });

  it("shows a request in review read-only, promises no turnaround, and hides the form", () => {
    render(
      <OnboardingPanel own={{ ...base, latest: latest({}) }} form={form} />
    );
    expect(screen.getByText(/in review/i)).toBeInTheDocument();
    expect(screen.getByText(/NITAP-2019-042/)).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/\b(hour|day|week)s?\b/i)
    ).not.toBeInTheDocument();
  });

  it("shows the reviewer's note and the form again after a rejection", () => {
    render(
      <OnboardingPanel
        own={{
          ...base,
          rejectedCount: 1,
          latest: latest({
            status: "REJECTED",
            reviewNote: "Roll number not found.",
            reviewedAt: new Date(),
          }),
        }}
        form={form}
      />
    );
    expect(screen.getByText("Roll number not found.")).toBeInTheDocument();
    expect(screen.getByTestId("form")).toBeInTheDocument();
  });

  it("tells a locked account to contact the alumni office, with no form", () => {
    render(
      <OnboardingPanel
        own={{
          ...base,
          locked: true,
          rejectedCount: 3,
          latest: latest({
            status: "REJECTED",
            reviewNote: "No.",
            reviewedAt: new Date(),
          }),
        }}
        form={form}
      />
    );
    expect(screen.getByText(/contact the alumni office/i)).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

  it("tells a staff-track account it awaits the institute, with no form", () => {
    render(
      <OnboardingPanel
        own={{ ...base, track: "AWAITING_STAFF_CONFIRMATION" }}
        form={form}
      />
    );
    expect(
      screen.getByText(/awaiting confirmation by the institute/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });
});
