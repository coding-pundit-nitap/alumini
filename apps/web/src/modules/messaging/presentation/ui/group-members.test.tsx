import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { GroupMembers } from "./group-members";

const person = (id: string, fullName: string) => ({
  id,
  fullName,
  hasPhoto: false,
});
const people = [
  person("me", "Asha"),
  person("ravi", "Ravi"),
  person("meera", "Meera"),
];
const ok = async () => ({ ok: true as const, data: {} as never });
beforeEach(() => vi.clearAllMocks());

function setup(
  viewerId: string,
  over: Partial<Parameters<typeof GroupMembers>[0]> = {}
) {
  const props = {
    conversationId: "c1",
    viewerId,
    createdById: "me",
    people,
    candidates: [person("dev", "Dev")],
    addAction: vi.fn(ok),
    removeAction: vi.fn(ok),
    ...over,
  };
  render(<GroupMembers {...props} />);
  return props;
}

describe("GroupMembers", () => {
  it("lets the creator remove others and add a connection, then refreshes", async () => {
    const props = setup("me");
    expect(screen.queryByRole("button", { name: "Leave group" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Asha" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove Ravi" }));
    await waitFor(() =>
      expect(props.removeAction).toHaveBeenCalledWith("c1", "ravi")
    );
    await userEvent.selectOptions(screen.getByLabelText("Add member"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(props.addAction).toHaveBeenCalledWith("c1", "dev")
    );
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("gives a non-creator only Leave group, which returns to the inbox", async () => {
    const props = setup("ravi", { candidates: [] });
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(screen.queryByLabelText("Add member")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Leave group" }));
    await waitFor(() =>
      expect(props.removeAction).toHaveBeenCalledWith("c1", "ravi")
    );
    expect(nav.push).toHaveBeenCalledWith("/messages");
  });

  it("shows the safe message when a change is refused", async () => {
    setup("me", {
      addAction: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "GROUP_FULL",
          message: "This group has reached its member limit.",
        },
        requestId: "r",
      })),
    });
    await userEvent.selectOptions(screen.getByLabelText("Add member"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("member limit");
  });
});
