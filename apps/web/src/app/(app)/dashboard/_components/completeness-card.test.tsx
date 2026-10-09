import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompletenessCard } from "./completeness-card";

describe("CompletenessCard", () => {
  it("hides at 100 %", () => {
    const { container } = render(
      <CompletenessCard percent={100} missing={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the score, what is missing and a Finish profile link", () => {
    render(
      <CompletenessCard percent={63} missing={["Photo", "Links", "Skills"]} />
    );
    expect(screen.getByText("Profile 63% complete")).toBeInTheDocument();
    expect(screen.getByText(/Photo, Links, Skills/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Finish profile" })
    ).toHaveAttribute("href", "/profile/details");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "63"
    );
  });
});
