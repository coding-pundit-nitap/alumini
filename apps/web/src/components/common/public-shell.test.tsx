import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { PublicShell } from "./public-shell";

describe("PublicShell", () => {
  it("shows About, Privacy, Log in and Join when signed out", () => {
    render(<PublicShell signedIn={false}>body</PublicShell>);
    const header = within(screen.getByRole("banner"));

    expect(header.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/#how-it-works"
    );
    expect(header.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(header.getByRole("link", { name: "Join" })).toHaveAttribute(
      "href",
      "/register"
    );
    expect(
      header.queryByRole("link", { name: "Open app" })
    ).not.toBeInTheDocument();
  });

  it("shows only the open-app button when signed in", () => {
    render(<PublicShell signedIn>body</PublicShell>);
    const header = within(screen.getByRole("banner"));

    expect(header.getByRole("link", { name: "Open app" })).toHaveAttribute(
      "href",
      "/post-login"
    );
    expect(
      header.queryByRole("link", { name: "Log in" })
    ).not.toBeInTheDocument();
    expect(
      header.queryByRole("link", { name: "Join" })
    ).not.toBeInTheDocument();
  });

  it("keeps the header nav out of <main> and renders children inside it", () => {
    render(<PublicShell signedIn={false}>page body</PublicShell>);
    const main = within(screen.getByRole("main"));

    expect(main.getByText("page body")).toBeInTheDocument();
    expect(
      main.queryByRole("link", { name: "Log in" })
    ).not.toBeInTheDocument();
  });

  it("footer links Privacy to /#privacy and gates network links on sign-in", () => {
    const { unmount } = render(<PublicShell signedIn={false}>x</PublicShell>);
    let footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/#privacy"
    );
    expect(footer.getByRole("link", { name: "Jobs" })).toHaveAttribute(
      "href",
      "/register"
    );
    expect(footer.getByText(/NIT Arunachal Pradesh$/)).toBeInTheDocument();
    unmount();

    render(<PublicShell signedIn>x</PublicShell>);
    footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Jobs" })).toHaveAttribute(
      "href",
      "/jobs"
    );
  });
});
