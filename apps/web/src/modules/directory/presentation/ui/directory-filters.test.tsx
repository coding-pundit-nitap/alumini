import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DirectoryFilters } from "./directory-filters";

const departments = [{ code: "CSE", name: "Computer Science" }];

describe("DirectoryFilters", () => {
  it("keeps the asked-for values in the form and folds the filters away by default", () => {
    render(
      <DirectoryFilters
        params={{
          q: "asha",
          department: "CSE",
          sort: "name",
          company: ["Acme", "Beta"],
        }}
        departments={departments}
      />
    );
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue(
      "asha"
    );
    expect(screen.getByRole("combobox", { name: "Department" })).toHaveValue(
      "CSE"
    );
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue(
      "name"
    );
    expect(screen.getByLabelText("Company")).toHaveValue("Acme");
    expect(screen.getByRole("group")).not.toHaveAttribute("open");
  });

  it("shows one removable chip per applied filter, and Clear all when there are several", () => {
    render(
      <DirectoryFilters
        params={{ q: "asha", department: "CSE", skills: "Go" }}
        departments={departments}
        open
      />
    );
    const applied = within(
      screen.getByRole("list", { name: "Applied filters" })
    );
    expect(
      applied.getByRole("link", { name: "Remove filter: Computer Science" })
    ).toHaveAttribute("href", "/directory?q=asha&skills=Go");
    expect(applied.getByRole("link", { name: "Clear all" })).toHaveAttribute(
      "href",
      "/directory?q=asha"
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("group")).toHaveAttribute("open");
  });

  it("shows no chips or count without filters, and no Clear all for a single one", () => {
    const { unmount } = render(
      <DirectoryFilters params={{}} departments={departments} />
    );
    expect(screen.queryByRole("list", { name: "Applied filters" })).toBeNull();
    unmount();
    render(<DirectoryFilters params={{ location: "Pune" }} departments={[]} />);
    expect(
      screen.getByRole("link", { name: "Remove filter: In Pune" })
    ).toHaveAttribute("href", "/directory");
    expect(screen.queryByRole("link", { name: "Clear all" })).toBeNull();
  });
});
