import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AttentionTiles } from "./attention-tiles";

const zero = {
  connectionRequests: 0,
  unreadMessages: 0,
  mentorshipRequests: 0,
  unreadNotifications: 0,
};

describe("AttentionTiles (H-8)", () => {
  it("renders nothing when nothing needs attention", () => {
    const { container } = render(<AttentionTiles counts={zero} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides zero tiles and links each tile to its place", () => {
    render(
      <AttentionTiles
        counts={{ ...zero, connectionRequests: 3, unreadNotifications: 1 }}
      />
    );
    expect(
      screen.getByRole("link", { name: /3 connection requests/i })
    ).toHaveAttribute("href", "/connections?tab=incoming");
    expect(
      screen.getByRole("link", { name: /1 unread notification$/i })
    ).toHaveAttribute("href", "/notifications");
    expect(screen.queryByText(/messages/i)).toBeNull();
    expect(screen.queryByText(/mentorship/i)).toBeNull();
  });

  it("shows 50+ at the cap instead of a false exact number", () => {
    render(<AttentionTiles counts={{ ...zero, unreadMessages: 50 }} />);
    expect(
      screen.getByRole("link", { name: /50\+ unread messages/i })
    ).toHaveAttribute("href", "/messages");
  });
});
