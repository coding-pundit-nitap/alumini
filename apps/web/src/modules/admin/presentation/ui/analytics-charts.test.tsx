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

  const week = (value: number) => [{ week: "2026-09-28", value }];

  it("renders the members section, with a median only once requests were decided", () => {
    const data = {
      byState: { VERIFIED: 120, PENDING: 4, CUSTOM_STATE: 2 },
      signups: week(5),
      byRole: [{ key: "ALUMNI", count: 100 }],
      byGraduationYear: [{ key: "2020", count: { masked: true as const } }],
      verification: { approved: 30, rejected: 2, medianHoursToReview: 5.26 },
    };
    const { unmount } = render(
      <AnalyticsSectionBody section={{ key: "members", status: "ok", data }} />
    );
    expect(screen.getByText("30 / 2")).toBeInTheDocument();
    expect(screen.getByText("5.3 h")).toBeInTheDocument();
    expect(screen.getByText("Alumni")).toBeInTheDocument();
    expect(screen.getByText("Custom state")).toBeInTheDocument();
    unmount();
    render(
      <AnalyticsSectionBody
        section={{
          key: "members",
          status: "ok",
          data: {
            ...data,
            byState: {},
            verification: {
              approved: 0,
              rejected: 0,
              medianHoursToReview: null,
            },
          },
        }}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the jobs, community and donations sections", () => {
    render(
      <>
        <AnalyticsSectionBody
          section={{
            key: "jobs",
            status: "ok",
            data: {
              submitted: week(3),
              byStatus: [{ key: "PENDING_REVIEW", count: 6 }],
              openByEmploymentType: [{ key: "FULL_TIME", count: 7 }],
            },
          }}
        />
        <AnalyticsSectionBody
          section={{
            key: "community",
            status: "ok",
            data: {
              posts: week(10),
              comments: week(20),
              reportsByStatus: [{ key: "OPEN", count: 8 }],
            },
          }}
        />
        <AnalyticsSectionBody
          section={{
            key: "donations",
            status: "ok",
            data: {
              receivedRupees: week(2000),
              raisedPaise: 250050,
              donors: 9,
              donorsByCampaign: [{ key: "Library", count: 9 }],
            },
          }}
        />
      </>
    );
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(screen.getByText("Full time")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("₹2,501")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
  });
});
