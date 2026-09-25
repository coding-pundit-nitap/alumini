import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import type { ListedJob } from "../../application/job-queries";
import { ModerationQueue } from "./moderation-queue";

const row = (over: Partial<ListedJob> = {}): ListedJob => ({
  id: "job-1",
  postedBy: "poster-1",
  title: "Backend Engineer",
  company: "Acme",
  description: "Build things",
  employmentType: "FULL_TIME",
  location: "Remote",
  workMode: "REMOTE",
  experience: "2+ years",
  skills: ["node"],
  applicationUrl: "https://acme.example/apply",
  deadline: new Date("2026-12-01"),
  status: "PENDING_REVIEW",
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: new Date("2026-09-01"),
  updatedAt: new Date("2026-09-01"),
  ...over,
});

describe("ModerationQueue", () => {
  it("shows an empty state", () => {
    render(
      <ModerationQueue
        items={[]}
        approveAction={vi.fn()}
        rejectAction={vi.fn()}
      />
    );
    expect(screen.getByText("Nothing waiting for review.")).toBeInTheDocument();
  });

  it("approves a row", async () => {
    const approveAction = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { status: "PUBLISHED" } });
    render(
      <ModerationQueue
        items={[row()]}
        approveAction={approveAction}
        rejectAction={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve job" }));
    await waitFor(() => expect(approveAction).toHaveBeenCalledWith("job-1"));
  });

  it("does not approve until confirmed", async () => {
    const approve = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(
      <ModerationQueue
        items={[row()]}
        approveAction={approve}
        rejectAction={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(approve).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(approve).not.toHaveBeenCalled();
  });

  it("the Reject dialog's submit is disabled until a note is entered, then submits", async () => {
    const rejectAction = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { status: "REJECTED" } });
    render(
      <ModerationQueue
        items={[row()]}
        approveAction={vi.fn()}
        rejectAction={rejectAction}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    const submit = screen.getByRole("button", { name: "Submit rejection" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Reason"), "Add a salary range");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() =>
      expect(rejectAction).toHaveBeenCalledWith("job-1", "Add a salary range")
    );
  });
});
