import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import type { ListedJob } from "../../application/job-queries";
import { MyJobsList, WithdrawButton } from "./my-jobs-list";

const row = (over: Partial<ListedJob> = {}): ListedJob => ({
  id: "job-1",
  postedBy: "u1",
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

describe("MyJobsList", () => {
  it("shows an empty state with a link to post a job", () => {
    render(<MyJobsList items={[]} />);
    expect(screen.getByRole("link", { name: /Post a job/ })).toHaveAttribute(
      "href",
      "/jobs/new"
    );
  });

  it("lists each job with its title, company and status, and an Edit link", () => {
    render(
      <MyJobsList
        items={[
          row(),
          row({ id: "job-2", title: "Frontend Engineer", status: "REJECTED" }),
        ]}
      />
    );
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getAllByText("Acme")[0]).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Edit" })[0]).toHaveAttribute(
      "href",
      "/jobs/job-1/edit"
    );
  });

  it("renders a Withdraw button on eligible rows when given a closeAction", () => {
    render(
      <MyJobsList
        items={[row({ status: "PUBLISHED" })]}
        closeAction={async () => ({ ok: true, data: {} })}
      />
    );
    expect(
      screen.getByRole("button", { name: "Withdraw" })
    ).toBeInTheDocument();
  });

  it("does not render Withdraw on a terminal-status row even with a closeAction", () => {
    render(
      <MyJobsList
        items={[row({ status: "CLOSED" })]}
        closeAction={async () => ({ ok: true, data: {} })}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Withdraw" })
    ).not.toBeInTheDocument();
  });

  it("hides Edit on closed postings and links older pages", () => {
    render(
      <MyJobsList
        items={[row({ status: "CLOSED" })]}
        nextHref="/jobs/mine?cursor=C"
      />
    );
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Older postings" })
    ).toHaveAttribute("href", "/jobs/mine?cursor=C");
  });

  it("withdraws after confirmation, keeps the job on Keep, and shows a refusal", async () => {
    const closeAction = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "X", message: "Already closed." },
        requestId: "q",
      })
      .mockResolvedValueOnce({ ok: true, data: {} });
    render(<WithdrawButton jobId="j1" closeAction={closeAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(closeAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Already closed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.queryByText("Already closed.")).toBeNull()
    );
    expect(closeAction).toHaveBeenCalledWith("j1");
  });
});
