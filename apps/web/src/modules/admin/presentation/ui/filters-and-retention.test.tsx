import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AuditFilters } from "./audit-filters";
import { RetentionTable } from "./retention-table";

describe("AuditFilters", () => {
  it("keeps the current filters", () => {
    render(
      <AuditFilters
        values={{ action: "job.approved", from: "2026-10-01T00:00" }}
      />
    );
    expect(screen.getByLabelText("Action")).toHaveValue("job.approved");
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-01T00:00");
    expect(screen.getByLabelText("To (exclusive)")).toHaveValue("");
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute(
      "href",
      "/admin/audit"
    );
  });
});

describe("RetentionTable", () => {
  const base = {
    id: "s",
    retentionDays: 1825,
    approvedBy: null,
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    updatedBy: null,
    defaultDays: 90,
    minDays: 30,
    maxDays: 3650,
    enforced: true,
  };

  it("shows each category's period, sign-off and last change", () => {
    render(
      <RetentionTable
        settings={[
          { ...base, category: "notifications" },
          {
            ...base,
            category: "custom",
            enforced: false,
            approvedBy: "Registrar",
            updatedBy: { id: "a", name: "Admin" },
          },
        ]}
        action={vi.fn()}
      />
    );
    const notifications = within(
      screen.getByRole("rowheader", { name: /Notifications/ }).closest("tr")!
    );
    expect(notifications.getByText("Placeholder")).toBeInTheDocument();
    expect(notifications.getByText("Default")).toBeInTheDocument();
    expect(notifications.getByText("1,825")).toBeInTheDocument();
    const custom = within(
      screen.getByRole("rowheader", { name: /custom/ }).closest("tr")!
    );
    expect(custom.getByText("Not enforced yet")).toBeInTheDocument();
    expect(custom.getByText("Registrar")).toBeInTheDocument();
    expect(custom.getByText(/by Admin$/)).toBeInTheDocument();
  });
});
