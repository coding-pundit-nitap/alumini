import { describe, expect, it } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { PublishedJobCard } from "../../application/job-queries";
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
  deadline: new Date("2026-12-01"),
  createdAt: new Date("2026-09-01"),
  ...over,
});

describe("JobList", () => {
  it("shows an empty state", () => {
    render(<JobList items={[]} />);
    expect(screen.getByText("No open postings match yet.")).toBeInTheDocument();
  });

  it("renders each card with an external, safely-relled application link", () => {
    render(<JobList items={[card()]} />);
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Apply" });
    expect(link).toHaveAttribute("href", "https://acme.example/apply");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
