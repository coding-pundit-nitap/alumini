import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { RequestDialog } from "./request-dialog";

type Action = Parameters<typeof RequestDialog>[0]["requestAction"];

const mentor = { userId: "m1", fullName: "Ada Mentor", spotsLeft: 2 };

function setup(
  over: {
    spotsLeft?: number;
    requestAction?: Action;
  } = {}
) {
  const requestAction =
    over.requestAction ?? vi.fn<Action>(async () => ({ ok: true, data: {} }));
  render(
    <RequestDialog
      mentor={{ ...mentor, spotsLeft: over.spotsLeft ?? mentor.spotsLeft }}
      requestAction={requestAction}
    />
  );
  return requestAction;
}

describe("RequestDialog", () => {
  it("opens on click", async () => {
    setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Request mentorship" })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disables the trigger and says so when no spots are left", () => {
    setup({ spotsLeft: 0 });
    expect(
      screen.getByRole("button", { name: "Request mentorship" })
    ).toBeDisabled();
    expect(screen.getByText("No spots left")).toBeInTheDocument();
  });

  it("submits { message, topic } and omits a blank topic", async () => {
    const action = setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Request mentorship" })
    );
    await userEvent.type(screen.getByLabelText("Message"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(action).toHaveBeenLastCalledWith("m1", { message: "Hello" });

    await userEvent.click(
      screen.getByRole("button", { name: "Request mentorship" })
    );
    await userEvent.type(screen.getByLabelText("Message"), "Hi again");
    await userEvent.type(screen.getByLabelText("Topic (optional)"), "sql");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(action).toHaveBeenLastCalledWith("m1", {
      message: "Hi again",
      topic: "sql",
    });
  });

  it("shows the server's message on failure and stays open", async () => {
    setup({
      requestAction: vi.fn(async () => ({
        ok: false as const,
        error: { code: "MENTORSHIP_REQUEST_EXISTS", message: "Already asked." },
        requestId: "r",
      })),
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Request mentorship" })
    );
    await userEvent.type(screen.getByLabelText("Message"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Already asked."
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("caps the message at 500 characters with a live counter", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Request mentorship" })
    );
    const field = screen.getByLabelText("Message");
    expect(field).toHaveAttribute("maxlength", "500");
    expect(screen.getByText("0/500")).toBeInTheDocument();
    await userEvent.type(field, "abc");
    expect(screen.getByText("3/500")).toBeInTheDocument();
  });
});
