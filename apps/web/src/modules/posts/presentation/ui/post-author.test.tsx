import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PostAuthorCard } from "./post-author";

const author = {
  id: "a1",
  fullName: "Asha Rao",
  headline: null,
  hasPhoto: true,
};

describe("PostAuthorCard", () => {
  it("links another member's profile and falls back when there is no headline", () => {
    render(<PostAuthorCard author={author} currentUserId="u2" />);
    expect(screen.getByText("Member of the network")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View profile" })).toHaveAttribute(
      "href",
      "/members/a1"
    );
  });

  it("links the viewer's own profile", () => {
    render(
      <PostAuthorCard
        author={{ ...author, headline: "SDE" }}
        currentUserId="a1"
      />
    );
    expect(screen.getByText("SDE")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View your profile" })
    ).toHaveAttribute("href", "/profile");
  });
});
