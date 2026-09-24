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
});
