import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge component", () => {
  it("renders text content properly", () => {
    render(<Badge>New Feature</Badge>);
    expect(screen.getByText("New Feature")).toBeInTheDocument();
  });

  it("renders with variant classes", () => {
    const { container } = render(<Badge variant="destructive">Critical</Badge>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("applies brand variant classes", () => {
    render(<Badge variant="brand">New</Badge>);
    const badge = screen.getByText("New");
    expect(badge.className).toContain("bg-brand/12");
  });
});
