import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaneHeader, ThreadHeader } from "./thread-header";

const people = [
  { id: "me", fullName: "Asha", hasPhoto: false },
  { id: "r", fullName: "Ravi", hasPhoto: false },
];

describe("ThreadHeader", () => {
  it("names a direct message by the other member", () => {
    render(
      <ThreadHeader
        conversation={{ title: null, participants: people }}
        viewerId="me"
        isGroup={false}
        actions={<button>More</button>}
      />
    );
    expect(screen.getByRole("heading", { name: "Ravi" })).toBeInTheDocument();
    expect(screen.getByText("Direct message")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All messages" })).toHaveAttribute(
      "href",
      "/messages"
    );
  });

  it("names a group by its title and size; a bare pane header has no subtitle", () => {
    render(
      <>
        <ThreadHeader
          conversation={{ title: "Batch 2020", participants: people }}
          viewerId="me"
          isGroup
        />
        <PaneHeader title="New message" />
      </>
    );
    expect(screen.getByText("Group · 2 members")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "New message" }).nextSibling
    ).toBeNull();
  });
});
