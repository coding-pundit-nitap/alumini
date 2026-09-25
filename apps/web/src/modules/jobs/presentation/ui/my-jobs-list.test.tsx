import { describe, expect, it } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { ListedJob } from "../../application/job-queries";
import { MyJobsList } from "./my-jobs-list";

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
});
