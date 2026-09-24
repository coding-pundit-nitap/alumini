import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CtaButtons } from "./cta-buttons";

describe("CtaButtons", () => {
  it("offers join and log in to visitors", () => {
    render(<CtaButtons signedIn={false} />);
    expect(
      screen.getByRole("link", { name: /Join the network/ })
    ).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(
      screen.queryByRole("link", { name: "Go to dashboard" })
    ).not.toBeInTheDocument();
  });

  it("offers only the dashboard to signed-in, unverified visitors", () => {
    render(<CtaButtons signedIn />);
    expect(
      screen.getByRole("link", { name: "Go to dashboard" })
    ).toHaveAttribute("href", "/dashboard");
    expect(
      screen.queryByRole("link", { name: /Join/ })
    ).not.toBeInTheDocument();
  });
});
