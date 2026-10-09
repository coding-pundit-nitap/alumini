import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobFilters, jobsHref } from "./job-filters";

describe("jobsHref", () => {
  it("drops empty filters", () => {
    expect(jobsHref({})).toBe("/jobs");
    expect(jobsHref({ workMode: "REMOTE", location: "" })).toBe(
      "/jobs?workMode=REMOTE"
    );
  });
});

describe("JobFilters", () => {
  it("keeps the current filters, carries the type hidden, and lights its link", () => {
    const { container } = render(
      <JobFilters
        filters={{
          employmentType: "INTERNSHIP",
          workMode: "REMOTE",
          location: "Pune",
        }}
      />
    );
    expect(screen.getByRole("searchbox", { name: "Location" })).toHaveValue(
      "Pune"
    );
    expect(screen.getByRole("combobox", { name: "Work mode" })).toHaveValue(
      "REMOTE"
    );
    expect(
      container.querySelector('input[type="hidden"][name="employmentType"]')
    ).toHaveValue("INTERNSHIP");
    const types = within(
      screen.getByRole("navigation", { name: "Employment type" })
    );
    expect(types.getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/jobs?employmentType=INTERNSHIP&workMode=REMOTE&location=Pune"
    );
    expect(types.getByRole("link", { name: "All" })).toHaveAttribute(
      "href",
      "/jobs?workMode=REMOTE&location=Pune"
    );
  });

  it("starts empty with All selected", () => {
    const { container } = render(<JobFilters filters={{}} />);
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
