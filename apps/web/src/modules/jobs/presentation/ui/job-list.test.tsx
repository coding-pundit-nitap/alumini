import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { PublishedJobCard } from "../../application/job-queries";
import { jobsHref } from "./job-filters";
import { JobList } from "./job-list";

const card = (over: Partial<PublishedJobCard> = {}): PublishedJobCard => ({
  id: "job-1",
  title: "Backend Engineer",
  company: "Acme",
  description: "Build things",
  employmentType: "FULL_TIME",
  location: "Remote",
  workMode: "REMOTE",
  experience: "2+ years",
  skills: ["node"],
  applicationUrl: "https://acme.example/apply",
  deadline: new Date("2099-12-01"),
  createdAt: new Date("2026-09-01"),
  ...over,
});

describe("JobList", () => {
  it("shows an empty state, offering to clear filters or post a job", () => {
    const { rerender } = render(<JobList items={[]} />);
    expect(screen.getByText("No open postings match yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    rerender(<JobList items={[]} canCreate />);
    expect(screen.getByRole("link", { name: "Post a job" })).toHaveAttribute(
      "href",
      "/jobs/new"
    );
    rerender(<JobList items={[]} canCreate clearHref="/jobs" />);
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/jobs"
    );
  });

  it("renders each job with a detail link and an external, safely-relled application link", () => {
    render(<JobList items={[card()]} />);
    expect(
      screen.getByRole("link", { name: "Backend Engineer" })
    ).toHaveAttribute("href", "/jobs/job-1");
    expect(screen.getByText("Full-time · Remote")).toBeInTheDocument();
    expect(screen.getByText("Apply by 1 Dec 2099")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Apply" });
    expect(link).toHaveAttribute("href", "https://acme.example/apply");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows five skills and counts the rest", () => {
    render(
      <JobList
        items={[card({ skills: ["a", "b", "c", "d", "e", "f", "g"] })]}
      />
    );
    expect(screen.getByText("e")).toBeInTheDocument();
    expect(screen.queryByText("f")).toBeNull();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("without in-place loading, Load more is a plain link to the next page", () => {
    render(
      <JobList
        items={[card()]}
        nextCursor="CUR"
        nextHref="/jobs?workMode=REMOTE&cursor=CUR"
      />
    );
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
      "href",
      "/jobs?workMode=REMOTE&cursor=CUR"
    );
  });

  it("loads the next page in place with the same filters, and offers a retry when it fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(
        Response.json({
          data: [card(), card({ id: "job-2", title: "Data Intern" })],
          page: { limit: 20, nextCursor: null, hasMore: false },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <JobList
        items={[card()]}
        query="workMode=REMOTE"
        nextCursor="CUR"
        nextHref="/jobs?workMode=REMOTE&cursor=CUR"
      />
    );

    await userEvent.click(screen.getByRole("link", { name: "Load more" }));
    await userEvent.click(
      await screen.findByRole("link", { name: "Try again" })
    );

    expect(
      await screen.findByRole("link", { name: "Data Intern" })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/jobs?workMode=REMOTE&cursor=CUR"
    );
    // Dates come back as strings and are revived.
    expect(screen.getAllByText("Apply by 1 Dec 2099")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Apply" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Load more" })).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("jobsHref", () => {
  it("keeps the set filters and drops empty ones", () => {
    expect(jobsHref({})).toBe("/jobs");
    expect(
      jobsHref({
        employmentType: "INTERNSHIP",
        workMode: undefined,
        location: "Pune",
      })
    ).toBe("/jobs?employmentType=INTERNSHIP&location=Pune");
  });
});
