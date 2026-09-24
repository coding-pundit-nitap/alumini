import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { Bento } from "./bento";

const TITLES = [
  "Directory",
  "Mentorship",
  "Jobs & internships",
  "Events",
  "Messages",
  "Achievements",
];

describe("Bento", () => {
  it("renders six tiles linking to register when signed out", () => {
    render(<Bento signedIn={false} />);
    const region = screen.getByRole("region", { name: "What you can do" });
    for (const name of TITLES) {
      expect(
        within(region).getByRole("heading", { level: 3, name })
      ).toBeInTheDocument();
    }
    const links = within(region).getAllByRole("link");
    expect(links).toHaveLength(6);
    for (const l of links) expect(l).toHaveAttribute("href", "/register");
  });

  it("links to the dashboard when signed in", () => {
    render(<Bento signedIn />);
    for (const l of screen.getAllByRole("link")) {
      expect(l).toHaveAttribute("href", "/dashboard");
    }
  });
});
