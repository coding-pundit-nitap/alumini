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
      expect(screen.getAllByText("New connection request")).toHaveLength(2)
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

  it("a failed mark-read reverts only that item, not a concurrent success", async () => {
    let resolveA!: (response: Response) => void;
    const pendingA = new Promise<Response>((resolve) => {
      resolveA = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/a/read")) return pendingA;
        if (String(url).includes("/b/read")) return ok();
        throw new Error(`unexpected fetch: ${url}`);
      })
    );
    render(
      <NotificationInbox
        initialItems={[item("a"), item("b")]}
        initialNextCursor={null}
      />
    );

    const [readA, readB] = screen.getAllByRole("button", {
      name: /mark read/i,
    });
    // a's request is still in flight when b's is sent and succeeds.
    await userEvent.click(readA!);
    await userEvent.click(readB!);
    await waitFor(() =>
      expect(
        screen.queryAllByRole("button", { name: /mark read/i })
      ).toHaveLength(0)
    );

    // a's request now fails.
    resolveA(
      new Response(JSON.stringify({ error: { message: "Nope" } }), {
        status: 500,
      })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/nope/i)
    );
    // Only a's button comes back; b's successful mark-read must survive the rollback.
    const backButtons = screen.getAllByRole("button", { name: /mark read/i });
    expect(backButtons).toHaveLength(1);
  });

  it("marks all read at once, and puts back only those it flipped when that fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => fail({ error: { message: "Nope" } }))
      .mockImplementationOnce(() => ok({ data: { updated: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <NotificationInbox
        initialItems={[item("a"), item("b", new Date().toISOString())]}
        initialNextCursor={null}
      />
    );
    expect(screen.getAllByRole("button", { name: /mark read/i })).toHaveLength(
      1
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Mark all read" })
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/nope/i)
    );
    expect(screen.getAllByRole("button", { name: /mark read/i })).toHaveLength(
      1
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Mark all read" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /mark read/i })).toBeNull()
    );
    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/notifications/read-all",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("says why a page failed to load, with a fallback, and when offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() =>
          fail({ error: { message: "Rate limited." } })
        )
        .mockImplementationOnce(() =>
          Promise.resolve(new Response("not json", { status: 500 }))
        )
        .mockImplementationOnce(() => Promise.reject(new Error("offline")))
    );
    render(
      <NotificationInbox initialItems={[item("a")]} initialNextCursor="CUR" />
    );
    const more = () => screen.getByRole("button", { name: "Load more" });
    await userEvent.click(more());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Rate limited.")
    );
    await userEvent.click(more());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not load more notifications. Please try again."
      )
    );
    await userEvent.click(more());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Check your connection/
      )
    );
  });

  it("puts items back when marking read fails offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline")))
    );
    render(
      <NotificationInbox initialItems={[item("a")]} initialNextCursor={null} />
    );
    await userEvent.click(screen.getByRole("button", { name: /mark read/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not mark as read. Check your connection and try again."
      )
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Mark all read" })
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not mark all as read. Check your connection and try again."
      )
    );
    expect(
      screen.getByRole("button", { name: /mark read/i })
    ).toBeInTheDocument();
  });

  it("loads the next page when the end of the list scrolls into view", async () => {
    let fire: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof fire) {
          fire = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const fetchMock = vi.fn(() =>
      ok({ data: [item("b")], page: { nextCursor: null } })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <NotificationInbox initialItems={[item("a")]} initialNextCursor="CUR" />
    );
    fire([{ isIntersecting: false }]);
    expect(fetchMock).not.toHaveBeenCalled();
    fire([{ isIntersecting: true }]);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications?cursor=CUR")
    );
  });
});
