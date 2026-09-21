import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { ListedConnection } from "../../application/connection-store";
import { ConnectionList } from "./connection-list";

const item = (over: Partial<ListedConnection> = {}): ListedConnection => ({
  id: "c1",
  state: "PENDING",
  direction: "INCOMING",
  user: { id: "u1", fullName: "Asha Rao", hasPhoto: false },
  requestedAt: new Date(),
  respondedAt: null,
  ...over,
});
const ok = async () => ({ ok: true as const, data: {} });

function setup(
  tab: Parameters<typeof ConnectionList>[0]["tab"],
  items: ListedConnection[]
) {
  const respondAction = vi.fn(ok);
  const removeAction = vi.fn(ok);
  render(
    <ConnectionList
      items={items}
      tab={tab}
      respondAction={respondAction}
      removeAction={removeAction}
    />
  );
  return { respondAction, removeAction };
}

describe("ConnectionList", () => {
  it.each([
    ["connections", "You have no connections yet"],
    ["incoming", "No requests waiting for you."],
    ["outgoing", "You have no pending requests."],
    ["blocked", "You have not blocked anyone."],
  ] as const)("says something useful when the %s tab is empty", (tab, text) => {
    setup(tab, []);
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
  });

  it("incoming: links to the member and accepts or declines by connection id", async () => {
    const { respondAction } = setup("incoming", [item()]);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute(
      "href",
      "/members/u1"
    );
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(respondAction).toHaveBeenCalledWith("c1", "ACCEPT");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(respondAction).toHaveBeenCalledWith("c1", "REJECT");
  });

  it.each([
    ["connections", "Remove"],
    ["outgoing", "Cancel request"],
    ["blocked", "Unblock"],
  ] as const)(
    "%s: one %s button that removes by connection id",
    async (tab, label) => {
      const { removeAction } = setup(tab, [item({ direction: "OUTGOING" })]);
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(removeAction).toHaveBeenCalledWith("c1");
    }
  );

  it("blocked: the name is plain text, not a link to a profile they can no longer open", () => {
    setup("blocked", [item({ state: "BLOCKED" })]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
  });
});
