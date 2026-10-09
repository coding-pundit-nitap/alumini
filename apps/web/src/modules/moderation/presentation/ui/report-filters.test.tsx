import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportFilters } from "./report-filters";

describe("ReportFilters", () => {
  it("defaults to open reports of any type", () => {
    render(<ReportFilters values={{}} />);
    expect(screen.getByLabelText("Status")).toHaveValue("open");
    expect(screen.getByLabelText("Type")).toHaveValue("");
  });

  it("keeps the chosen filters", () => {
    render(
      <ReportFilters values={{ status: "RESOLVED", targetType: "POST" }} />
    );
    expect(screen.getByLabelText("Status")).toHaveValue("RESOLVED");
    expect(screen.getByLabelText("Type")).toHaveValue("POST");
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute(
      "href",
      "/admin/reports"
    );
  });
});
