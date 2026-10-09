import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoleTick, TickedAvatar } from "./role-tick";

const tick = { label: "Alumni", kind: "alumni" as const };

describe("RoleTick", () => {
  it("names the role for hover and screen readers, coloured by kind", () => {
    const { container } = render(<RoleTick tick={tick} size="sm" />);
    expect(screen.getByText("Verified Alumni")).toHaveClass("sr-only");
    expect(container.firstChild).toHaveAttribute("title", "Verified Alumni");
    expect(container.querySelector("svg")).toHaveClass(
      "fill-brand",
      "size-3.5"
    );
  });
});

describe("TickedAvatar", () => {
  it("adds nothing without a tick", () => {
    const { container } = render(
      <TickedAvatar tick={null}>
        <img alt="photo" />
      </TickedAvatar>
    );
    expect(container.innerHTML).toBe('<img alt="photo">');
  });

  it("pins the tick to the corner, closer in on a large avatar", () => {
    const { container, rerender } = render(
      <TickedAvatar tick={tick}>
        <img alt="photo" />
      </TickedAvatar>
    );
    expect(container.querySelector("[data-tick]")).toHaveClass("-right-1");
    rerender(
      <TickedAvatar tick={{ label: "Faculty", kind: "faculty" }} size="lg">
        <img alt="photo" />
      </TickedAvatar>
    );
    expect(container.querySelector("[data-tick]")).toHaveClass("right-0.5");
    expect(container.querySelector("svg")).toHaveClass(
      "fill-success",
      "size-7"
    );
  });
});
