import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationInbox } from "./notification-inbox";
import type { NotificationItem } from "./notification-list";

const item = (id: string, readAt: string | null = null): NotificationItem => ({
  id,
  type: "connection.requested",
  readAt,
  createdAt: new Date().toISOString(),
  payload: {},
});

const ok = (body: unknown = null, status = 200) =>
  Promise.resolve(
    body === null
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), { status })
  );
const fail = (body: unknown, status = 500) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NotificationInbox", () => {
  it("load-more appends the next page and stops once nextCursor is null", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("cursor=c1")) {
        return ok({ data: [item("n2")], page: { nextCursor: null } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NotificationInbox initialItems={[item("n1")]} initialNextCursor="c1" />
    );

    await userEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() =>
      expect(screen.getAllByText(/connection requested/i)).toHaveLength(2)
    );
    expect(
      screen.queryByRole("button", { name: /load more/i })
    ).not.toBeInTheDocument();
  });

  it("marks an item read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok())
    );
    render(
      <NotificationInbox initialItems={[item("n1")]} initialNextCursor={null} />
    );
    await userEvent.click(screen.getByRole("button", { name: /mark read/i }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /mark read/i })
      ).not.toBeInTheDocument()
    );
  });

  it("reverts and shows an error when mark-read fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fail({ error: { message: "Nope" } }))
    );
    render(
      <NotificationInbox initialItems={[item("n1")]} initialNextCursor={null} />
    );
    await userEvent.click(screen.getByRole("button", { name: /mark read/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/nope/i)
    );
    expect(
      screen.getByRole("button", { name: /mark read/i })
    ).toBeInTheDocument();
  });
});
