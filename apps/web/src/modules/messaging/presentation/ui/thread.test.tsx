import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { Thread, type ThreadMessage } from "./thread";

const ME = "me";
const people = [
  { id: ME, fullName: "Asha", hasPhoto: false },
  { id: "ravi", fullName: "Ravi", hasPhoto: false },
];
const message = (
  seq: number,
  senderId: string,
  body: string
): ThreadMessage => ({
  id: `m${seq}`,
  seq: String(seq),
  senderId,
  body,
  createdAt: new Date(seq * 1000).toISOString(),
});
const NEWEST_FIRST = [
  message(3, "ravi", "third"),
  message(2, ME, "second"),
  message(1, "ravi", "first"),
];

class FakeEventSource {
  static last: FakeEventSource;
  listeners = new Map<string, (event: { data: string }) => void>();
  close = vi.fn();
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(name: string, listener: (event: { data: string }) => void) {
    this.listeners.set(name, listener);
  }
  removeEventListener(name: string) {
    this.listeners.delete(name);
  }
  emit(data: unknown) {
    this.listeners.get("message")?.({ data: JSON.stringify(data) });
  }
}

const respond = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;
let uuid = 0;

beforeEach(() => {
  uuid = 0;
  fetchMock = vi.fn(() => respond({}, 204));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("crypto", { randomUUID: () => `uuid-${(uuid += 1)}` });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = (initial = NEWEST_FIRST) =>
  render(
    <Thread
      conversationId="c1"
      viewerId={ME}
      people={people}
      initialMessages={initial}
      initialNextCursor={null}
    />
  );
const calls = (needle: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(needle));

describe("Thread", () => {
  it("shows messages oldest first with the sender's name", () => {
    setup();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Ravi");
    expect(items[0]).toContain("first");
    expect(items[2]).toContain("third");
  });

  it("renders a body as text, never as markup", () => {
    setup([message(1, "ravi", "<img src=x onerror=alert(1)>")]);
    expect(
      screen.getByText("<img src=x onerror=alert(1)>")
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("marks the newest displayed message read on open", async () => {
    setup();
    await waitFor(() => expect(calls("/read")).toHaveLength(1));
    expect(JSON.parse(calls("/read")[0]![1].body)).toEqual({ upToSeq: "3" });
  });

  it("sends with a client id, appends the reply and clears the draft; a blank draft sends nothing", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/messages")
        ? respond(
            {
              data: {
                id: "m4",
                seq: "4",
                conversationId: "c1",
                senderId: ME,
                body: "hello",
                createdAt: new Date(4000).toISOString(),
              },
            },
            201
          )
        : respond({}, 204)
    );
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(calls("/messages")).toHaveLength(0);

    await userEvent.type(screen.getByLabelText("Message"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("hello");
    expect(JSON.parse(calls("/messages")[0]![1].body)).toEqual({
      body: "hello",
      clientMessageId: "uuid-1",
    });
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("retries a failed send with the SAME client id, so a lost response cannot duplicate it", async () => {
    setup();
    await waitFor(() => expect(calls("/read")).toHaveLength(1)); // let the mount-time mark-read consume its fetch first
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new Error("network"))
    );
    await userEvent.type(screen.getByLabelText("Message"), "again");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fetchMock.mockImplementation(() =>
      respond(
        {
          data: {
            id: "m9",
            seq: "9",
            conversationId: "c1",
            senderId: ME,
            body: "again",
            createdAt: new Date(9000).toISOString(),
          },
        },
        201
      )
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    const ids = calls("/messages").map(
      ([, init]) => JSON.parse(init.body).clientMessageId
    );
    expect(ids).toEqual(["uuid-1", "uuid-1"]);
  });

  it("shows the server's safe message when a send is refused", async () => {
    fetchMock.mockImplementation(() =>
      respond(
        {
          error: {
            code: "MESSAGE_BLOCKED",
            message: "You have blocked this member.",
          },
        },
        409
      )
    );
    setup();
    await userEvent.type(screen.getByLabelText("Message"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have blocked this member."
    );
  });

  it("refetches when a hint for this conversation arrives, and ignores another conversation's", async () => {
    setup();
    await waitFor(() => expect(FakeEventSource.last).toBeDefined());
    expect(FakeEventSource.last.url).toBe("/api/v1/messages/stream");
    fetchMock.mockImplementation((url: string) =>
      String(url).includes("/messages?")
        ? respond({
            data: [message(4, "ravi", "fresh"), ...NEWEST_FIRST],
            page: { limit: 50, nextCursor: null, hasMore: false },
          })
        : respond({}, 204)
    );

    FakeEventSource.last.emit({ conversationId: "other", messageId: "x" });
    expect(calls("/messages?")).toHaveLength(0);
    FakeEventSource.last.emit({ conversationId: "c1", messageId: "m4" });
    await screen.findByText("fresh");
  });

  it("closes the stream when it unmounts", () => {
    const { unmount } = setup();
    unmount();
    expect(FakeEventSource.last.close).toHaveBeenCalled();
  });

  it("loads older messages with the cursor", async () => {
    fetchMock.mockImplementation(() =>
      respond({
        data: [message(0, "ravi", "ancient")],
        page: { limit: 30, nextCursor: null, hasMore: false },
      })
    );
    render(
      <Thread
        conversationId="c1"
        viewerId={ME}
        people={people}
        initialMessages={NEWEST_FIRST}
        initialNextCursor="CUR"
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Load older messages" })
    );
    await screen.findByText("ancient");
    expect(String(calls("cursor=CUR")[0]![0])).toContain(
      "/api/v1/conversations/c1/messages?"
    );
    expect(
      screen.queryByRole("button", { name: "Load older messages" })
    ).toBeNull();
  });

  it("files a report for another member's message and confirms it", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/reports")
        ? respond({ data: { id: "r1", status: "OPEN" } }, 201)
        : respond({}, 204)
    );
    setup();
    expect(
      screen.queryByRole("button", { name: "Report message from Asha" })
    ).toBeNull();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Report message from Ravi" })[0]!
    );
    await userEvent.type(screen.getByLabelText("Reason"), "abusive");
    await userEvent.click(
      screen.getByRole("button", { name: "Submit report" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Report sent.");
    expect(JSON.parse(calls("/reports")[0]![1].body)).toEqual({
      targetType: "MESSAGE",
      targetId: "m1",
      reason: "abusive",
    });
  });
});

describe("hidden messages (spec C12-4)", () => {
  it("renders a tombstone without a Report button", () => {
    render(
      <Thread
        conversationId="c1"
        viewerId={ME}
        people={people}
        initialMessages={[
          { ...message(2, "ravi", "ignored"), body: null, hidden: true },
          message(1, "ravi", "first"),
        ]}
        initialNextCursor={null}
      />
    );
    expect(
      screen.getByText("This message was removed by a moderator.")
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Report message from/ })
    ).toHaveLength(1);
  });

  it("replaces an open message with the tombstone on the next refresh", async () => {
    render(
      <Thread
        conversationId="c1"
        viewerId={ME}
        people={people}
        initialMessages={[message(1, "ravi", "rude words")]}
        initialNextCursor={null}
      />
    );
    expect(screen.getByText("rude words")).toBeInTheDocument();
    fetchMock.mockImplementation((url: string) =>
      String(url).includes("/messages?")
        ? respond({
            data: [{ ...message(1, "ravi", ""), body: null, hidden: true }],
            page: { nextCursor: null },
          })
        : respond({}, 204)
    );
    FakeEventSource.last.emit({ conversationId: "c1" });
    await waitFor(() =>
      expect(
        screen.getByText("This message was removed by a moderator.")
      ).toBeInTheDocument()
    );
    expect(screen.queryByText("rude words")).toBeNull();
  });
});

describe("Thread layout and sending (UI-4)", () => {
  const day = (d: number, h: number) => new Date(2026, 8, d, h).toISOString();

  it("groups messages into days and draws the unread divider after the last read message", () => {
    render(
      <Thread
        conversationId="c1"
        viewerId={ME}
        people={people}
        initialMessages={[
          { ...message(3, "ravi", "new"), createdAt: day(24, 9) },
          { ...message(2, ME, "mine"), createdAt: day(23, 10) },
          { ...message(1, "ravi", "old"), createdAt: day(23, 9) },
        ]}
        initialNextCursor={null}
        initialLastReadSeq="2"
      />
    );
    expect(screen.getAllByRole("region")).toHaveLength(2);
    const divider = screen.getByRole("separator", { name: "Unread messages" });
    expect(divider.nextElementSibling).toHaveTextContent("new");
  });

  it("opens with the start-of-conversation card when there is no older page", () => {
    setup();
    expect(
      screen.getByText(/beginning of your conversation with Ravi/)
    ).toBeInTheDocument();
  });

  it("sends on Enter, keeps Shift+Enter as a newline, and shows the message at once", async () => {
    let finish!: (r: Response) => void;
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/messages")
        ? new Promise<Response>((resolve) => (finish = resolve))
        : respond({}, 204)
    );
    setup();
    const box = screen.getByLabelText("Message");
    await userEvent.type(box, "line one{Shift>}{Enter}{/Shift}two");
    expect(box).toHaveValue("line one\ntwo");
    await userEvent.type(box, "{Enter}");
    expect(await screen.findByText("Sending")).toBeInTheDocument();
    expect(box).toHaveValue("");
    finish(
      new Response(
        JSON.stringify({
          data: {
            id: "m4",
            seq: "4",
            conversationId: "c1",
            senderId: ME,
            body: "line one\ntwo",
            createdAt: new Date(4000).toISOString(),
          },
        }),
        { status: 201 }
      )
    );
    await waitFor(() => expect(screen.queryByText("Sending")).toBeNull());
    expect(calls("/messages")).toHaveLength(1);
  });

  it("folds a very long message behind Read more", async () => {
    const long = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    setup([message(1, "ravi", long)]);
    const toggle = screen.getByRole("button", { name: "Read more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
