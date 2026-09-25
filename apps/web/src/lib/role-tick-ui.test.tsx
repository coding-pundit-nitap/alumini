import { describe, expect, it } from "vitest";

import { RoleTick, TickedAvatar } from "@nitap/ui/components/role-tick";

import { render, screen } from "../../tests/support/test-utils";

const tick = { role: "ALUMNI", label: "Alumni", kind: "alumni" as const };

describe("RoleTick", () => {
  it("names the role for screen readers and on hover", () => {
    render(<RoleTick tick={tick} />);
    expect(screen.getByText("Verified Alumni")).toBeInTheDocument();
    expect(screen.getByTitle("Verified Alumni")).toHaveAttribute(
      "data-tick",
      "alumni"
    );
  });

  it("adds nothing around an avatar without a tick", () => {
    const { container } = render(
      <TickedAvatar tick={null}>
        <span>avatar</span>
      </TickedAvatar>
    );
    expect(container.innerHTML).toBe("<span>avatar</span>");
  });
});
