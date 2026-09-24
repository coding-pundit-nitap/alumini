import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuditTable } from "./audit-table";
import { DashboardTiles } from "./dashboard-tiles";

describe("DashboardTiles", () => {
  it("renders counts, links every queue, and shows an unavailable tile", () => {
    render(
      <DashboardTiles
        tiles={[
          { key: "pendingJobs", status: "ok", value: 4 },
          { key: "openReports", status: "unavailable" },
          {
            key: "members",
            status: "ok",
            value: { byState: { VERIFIED: 9, PENDING: 2 }, newLast7Days: 3 },
          },
        ]}
      />
    );
    expect(
      screen.getByRole("link", { name: /jobs awaiting review/i })
    ).toHaveAttribute("href", "/admin/jobs");
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open reports/i })).toHaveAttribute(
      "href",
      "/admin/reports"
    );
    expect(screen.getByText(/3 new this week/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /verified members/i })
    ).toHaveAttribute("href", "/admin/users");
  });
});

describe("AuditTable", () => {
  it("shows an empty state when nothing matches", () => {
    render(<AuditTable rows={[]} />);
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
  });

  it("renders one row per entry with actor and action", () => {
    render(
      <AuditTable
        rows={[
          {
            id: "a1",
            createdAt: new Date("2026-09-24T10:00:00Z"),
            action: "job.approved",
            targetType: "job",
            targetId: "j1",
            metadata: { postedBy: "u2" },
            requestId: "req-1",
            actor: { id: "u1", name: "Asha", email: "asha@x.test" },
          },
        ]}
      />
    );
    expect(screen.getByText("job.approved")).toBeInTheDocument();
    expect(screen.getByText("asha@x.test")).toBeInTheDocument();
    expect(screen.getByText(/"postedBy": "u2"/)).toBeInTheDocument();
  });
});
