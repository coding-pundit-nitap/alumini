import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { GroupForm } from "./group-form";

const people = Array.from({ length: 4 }, (_, i) => ({
  id: `u${i}`,
  fullName: `Member ${i}`,
  hasPhoto: false,
}));
beforeEach(() => push.mockClear());

describe("GroupForm", () => {
  it("needs at least two members before it can be submitted", async () => {
    render(<GroupForm candidates={people} createAction={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Create group" });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Member 0"));
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Member 1"));
    expect(submit).toBeEnabled();
  });

  it("creates the group with the ticked members and opens it", async () => {
    const createAction = vi.fn(async () => ({
      ok: true as const,
      data: { conversationId: "g1" },
    }));
    render(<GroupForm candidates={people} createAction={createAction} />);
    await userEvent.type(
      screen.getByLabelText("Group name (optional)"),
      "Crew"
    );
    await userEvent.click(screen.getByLabelText("Member 0"));
    await userEvent.click(screen.getByLabelText("Member 2"));
    await userEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/messages/g1"));
    expect(createAction).toHaveBeenCalledWith({
      title: "Crew",
      memberIds: ["u0", "u2"],
    });
  });

  it("omits an empty title, shows a refusal and has an empty state", async () => {
    const createAction = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "PARTICIPANT_UNAVAILABLE",
        message: "That member cannot be added to this conversation.",
      },
      requestId: "r",
    }));
    const { unmount } = render(
      <GroupForm candidates={people} createAction={createAction} />
    );
    await userEvent.click(screen.getByLabelText("Member 0"));
    await userEvent.click(screen.getByLabelText("Member 1"));
    await userEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "cannot be added"
    );
    expect(createAction).toHaveBeenCalledWith({ memberIds: ["u0", "u1"] });
    unmount();
    render(<GroupForm candidates={[]} createAction={createAction} />);
    expect(
      screen.getByText("Connect with at least two members to start a group.")
    ).toBeInTheDocument();
  });
});
