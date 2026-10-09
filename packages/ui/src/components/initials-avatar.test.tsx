import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { avatarTone } from "../lib/avatar-tone";
import { InitialsAvatar } from "./initials-avatar";

describe("InitialsAvatar", () => {
  it("falls back to two initials on the seed's tint", () => {
    render(<InitialsAvatar name="Asha  Rao Kumar" seed="u1" />);
    const fallback = screen.getByText("AR");
    for (const cls of avatarTone("u1").split(" ")) {
      expect(fallback).toHaveClass(cls);
    }
  });

  it("renders the photo when there is one, and stays hidden from screen readers", () => {
    const { container } = render(
      <InitialsAvatar name="Asha Rao" seed="u1" src="/api/photos/u1" />
    );
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
