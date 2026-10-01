import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AnalyticsSectionBody } from "./analytics-sections";
import { BarBreakdown } from "./bar-breakdown";
import { BarSeries } from "./bar-series";

describe("BarSeries", () => {
  it("prints the total and keeps every point in a screen-reader table", () => {
    render(
      <BarSeries
        label="Posts"
        points={[
          { week: "2026-09-21", value: 3 },
          { week: "2026-09-28", value: 4 },
        ]}
      />
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /posts, per week/i });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("4")).toBeInTheDocument();
  });
});

describe("BarBreakdown", () => {
  it("prints each value beside its label and a masked bucket as < 5", () => {
    render(
      <BarBreakdown
        label="By status"
        buckets={[
          { key: "PUBLISHED", count: 12 },
          { key: "REJECTED", count: { masked: true } },
        ]}
        labelOf={(k) => k.toLowerCase()}
      />
    );
    const rows = screen.getAllByRole("row");
    expect(rows[0]).toHaveTextContent("published12");
    expect(rows[1]).toHaveTextContent("rejected< 5");
  });
});

describe("AnalyticsSectionBody", () => {
  it("says an unavailable section is unavailable", () => {
    render(
      <AnalyticsSectionBody section={{ key: "jobs", status: "unavailable" }} />
    );
    expect(screen.getByText(/unavailable right now/i)).toBeInTheDocument();
  });

  it("renders the events stats", () => {
    render(
      <AnalyticsSectionBody
        section={{
          key: "events",
          status: "ok",
          data: {
            held: 2,
            cancelled: 1,
            registrations: 9,
            averageFillRate: 0.456,
            upcoming: 0,
          },
        }}
      />
    );
    expect(screen.getByText("Registrations")).toBeInTheDocument();
    expect(screen.getByText("46 %")).toBeInTheDocument();
  });
});
