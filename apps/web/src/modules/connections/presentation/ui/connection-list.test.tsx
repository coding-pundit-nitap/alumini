import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import type { ListedConnection } from "../../application/connection-store";
import { ConnectionList } from "./connection-list";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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

  it("loads later pages by cursor and shows each member once", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { ...item(), requestedAt: new Date().toISOString() },
              {
                ...item({
                  id: "c2",
                  user: { id: "u2", fullName: "Ravi K", hasPhoto: false },
                }),
                requestedAt: new Date().toISOString(),
              },
            ],
            page: { nextCursor: null },
          })
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ConnectionList
        items={[item()]}
        tab="incoming"
        respondAction={vi.fn(ok)}
        removeAction={vi.fn(ok)}
        query={{ state: "PENDING", direction: "INCOMING" }}
        nextCursor="CUR"
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Ravi K" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Asha Rao" })).toHaveLength(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "/api/v1/connections?state=PENDING&direction=INCOMING&cursor=CUR"
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("fades a row out as soon as it is acted on, and brings it back with the error if the action fails", async () => {
    const removeAction = vi.fn(async () => ({
      ok: false as const,
      error: { code: "X", message: "That did not work." },
      requestId: "r",
    }));
    render(
      <ConnectionList
        items={[item({ state: "ACCEPTED" })]}
        tab="connections"
        respondAction={vi.fn(ok)}
        removeAction={removeAction}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That did not work."
    );
    expect(screen.getByRole("listitem")).not.toHaveClass("fade-out");
  });

  it("opens the conversation from Message on the connections tab", async () => {
    router.push.mockClear();
    const messageAction = vi.fn(async () => ({
      ok: true as const,
      data: { conversationId: "conv1" },
    }));
    render(
      <ConnectionList
        items={[item({ state: "ACCEPTED" })]}
        tab="connections"
        respondAction={vi.fn(ok)}
        removeAction={vi.fn(ok)}
        messageAction={messageAction}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(messageAction).toHaveBeenCalledWith("u1");
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/messages/conv1")
    );
  });
});
