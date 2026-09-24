import { describe, expect, it } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { ReportView } from "../../application/moderation-store";
import { ReportsTable } from "./reports-table";

const row = (over: Partial<ReportView>): ReportView => ({
  id: "00000000-0000-4000-8000-000000000001",
  status: "OPEN",
  targetType: "POST",
  targetId: "00000000-0000-4000-8000-0000000000dd",
  reason: "spam link",
  createdAt: new Date("2026-09-24T10:00:00Z"),
  reporter: { id: "u1", name: "Ravi" },
  resolvedBy: null,
  targetOwnerId: "u2",
  preview: { text: "buy now", deleted: false },
  ...over,
});

describe("ReportsTable", () => {
  it("shows an empty state", () => {
    render(<ReportsTable rows={[]} />);
    expect(screen.getByText(/no reports match/i)).toBeInTheDocument();
  });

  it("links each report and never renders message text", () => {
    render(
      <ReportsTable
        rows={[
          row({}),
          row({
            id: "00000000-0000-4000-8000-000000000002",
            targetType: "MESSAGE",
            preview: null,
          }),
          row({
            id: "00000000-0000-4000-8000-000000000003",
            preview: { text: "gone post", deleted: true },
          }),
        ]}
      />
    );
    expect(screen.getAllByRole("link", { name: /view/i })[0]).toHaveAttribute(
      "href",
      "/admin/reports/00000000-0000-4000-8000-000000000001"
    );
    expect(screen.getByText("buy now")).toBeInTheDocument();
    expect(
      screen.getByText(/open the report to read the message/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/removed/i)).toBeInTheDocument();
  });
});
