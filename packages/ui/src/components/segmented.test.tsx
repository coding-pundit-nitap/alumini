import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Segmented, segmentedItemVariants } from "./segmented";

describe("Segmented", () => {
  it("renders a pill track and styles the active item apart from the rest", () => {
    render(
      <Segmented aria-label="View" className="extra">
        <a className={segmentedItemVariants({ active: true })}>Feed</a>
        <a className={segmentedItemVariants()}>People</a>
      </Segmented>
    );
    expect(screen.getByLabelText("View")).toHaveClass("rounded-full", "extra");
    expect(screen.getByText("Feed")).toHaveClass("bg-background");
    expect(screen.getByText("People")).toHaveClass("text-muted-foreground");
  });
});
