import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { ListedMentorship } from "../../application/mentorship-store";
import { MentorshipList } from "./mentorship-list";

type MentorshipTab = Parameters<typeof MentorshipList>[0]["tab"];

const item = (over: Partial<ListedMentorship> = {}): ListedMentorship => ({
  id: "m1",
  state: "REQUESTED",
  counterparty: { id: "u1", fullName: "Asha Rao", hasPhoto: false },
  topic: null,
  message: "Could you mentor me?",
  responseNote: null,
  requestedAt: new Date(),
  respondedAt: null,
  startedAt: null,
  endedAt: null,
  ...over,
});
const ok = async () => ({ ok: true as const, data: {} });

function setup(
  tab: MentorshipTab,
  items: ListedMentorship[],
  action: ReturnType<typeof vi.fn> = vi.fn(ok)
) {
  render(
    <MentorshipList
      items={items}
      tab={tab}
      transitionAction={action as never}
    />
  );
  return action;
}
const button = (name: string) => screen.getByRole("button", { name });
const noButton = (name: string) =>
  expect(screen.queryByRole("button", { name })).toBeNull();

describe("MentorshipList", () => {
  it.each([
    ["my-requests", "No requests yet"],
    ["requests", "No requests waiting for you"],
    ["mentees", "No current mentees"],
  ] as const)("says something useful when %s is empty", (tab, text) => {
    setup(tab, []);
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
  });

  it.each([
    ["REQUESTED", "Requested"],
    ["ACCEPTED", "Accepted"],
    ["ACTIVE", "Active"],
    ["COMPLETED", "Completed"],
    ["DECLINED", "Declined"],
    ["CANCELLED", "Cancelled"],
  ] as const)("shows the plain-language chip for %s", (state, label) => {
    setup("my-requests", [item({ state })]);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("my-requests: shows counterparty and message; Cancel request only while REQUESTED", async () => {
    const action = setup("my-requests", [item()]);
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute(
      "href",
      "/members/u1"
    );
    expect(screen.getByText("Could you mentor me?")).toBeInTheDocument();
    await userEvent.click(button("Cancel request"));
    expect(action).toHaveBeenCalledWith("m1", "cancel", undefined);
  });

  it("my-requests: Cancel mentorship on ACCEPTED/ACTIVE needs a confirming second click", async () => {
    const action = setup("my-requests", [item({ state: "ACCEPTED" })]);
    noButton("Cancel request");
    await userEvent.click(button("Cancel mentorship"));
    expect(action).not.toHaveBeenCalled();
    await userEvent.click(button("Confirm cancel"));
    expect(action).toHaveBeenCalledWith("m1", "cancel", undefined);
  });

  it("my-requests: a terminal row has no buttons; a declined row shows the mentor's note", () => {
    setup("my-requests", [
      item({ state: "DECLINED", responseNote: "Sorry, too busy" }),
      item({ id: "m2", state: "COMPLETED" }),
    ]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/Sorry, too busy/)).toBeInTheDocument();
  });

  it("requests: shows the topic; Accept and Decline call the action; Decline takes an optional note", async () => {
    const action = setup("requests", [item({ topic: "sql" })]);
    expect(screen.getByText(/sql/)).toBeInTheDocument();
    await userEvent.click(button("Accept"));
    expect(action).toHaveBeenLastCalledWith("m1", "accept", undefined);

    await userEvent.click(button("Decline"));
    await userEvent.type(screen.getByLabelText(/note/i), "Not this term");
    await userEvent.click(button("Send decline"));
    expect(action).toHaveBeenLastCalledWith("m1", "decline", "Not this term");
  });

  it("requests: a decline with no note sends none, and the note field stops at 500 characters", async () => {
    const action = setup("requests", [item()]);
    await userEvent.click(button("Decline"));
    expect(screen.getByLabelText(/note/i)).toHaveAttribute("maxlength", "500");
    await userEvent.click(button("Send decline"));
    expect(action).toHaveBeenCalledWith("m1", "decline", undefined);
  });

  it("requests: a MENTOR_AT_CAPACITY failure shows the server message inline", async () => {
    setup(
      "requests",
      [item()],
      vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "MENTOR_AT_CAPACITY",
          message: "You have no free mentee slots.",
        },
      }))
    );
    await userEvent.click(button("Accept"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have no free mentee slots."
    );
  });

  it("mentees: Mark as started on ACCEPTED, Mark completed on ACTIVE, Cancel mentorship on both", async () => {
    const action = setup("mentees", [
      item({ id: "a", state: "ACCEPTED" }),
      item({ id: "b", state: "ACTIVE" }),
    ]);
    expect(
      screen.getAllByRole("button", { name: "Cancel mentorship" })
    ).toHaveLength(2);
    await userEvent.click(button("Mark as started"));
    expect(action).toHaveBeenLastCalledWith("a", "start", undefined);
    await userEvent.click(button("Mark completed"));
    expect(action).toHaveBeenLastCalledWith("b", "complete", undefined);
  });

  it("buttons disable while the action is pending", async () => {
    let release: () => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<{ ok: true; data: object }>((resolve) => {
          release = () => resolve({ ok: true, data: {} });
        })
    );
    setup("requests", [item()], action);
    await userEvent.click(button("Accept"));
    expect(button("Accept")).toBeDisabled();
    expect(button("Decline")).toBeDisabled();
    release();
  });
});
