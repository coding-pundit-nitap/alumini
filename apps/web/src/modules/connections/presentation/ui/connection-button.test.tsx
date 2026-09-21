import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { ConnectionStatus } from "../../domain/connection";
import { ConnectionButton } from "./connection-button";

const ok = async () => ({ ok: true as const, data: {} });

function setup(
  status: ConnectionStatus,
  over: Partial<Parameters<typeof ConnectionButton>[0]> = {}
) {
  const props = {
    targetUserId: "target",
    status,
    requestAction: vi.fn(ok),
    respondAction: vi.fn(ok),
    removeAction: vi.fn(ok),
    blockAction: vi.fn(ok),
    ...over,
  };
  render(<ConnectionButton {...props} />);
  return props;
}

describe("ConnectionButton", () => {
  it("NONE: Connect sends a request to the profile's member", async () => {
    const props = setup({ state: "NONE" });
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(props.requestAction).toHaveBeenCalledWith("target");
  });

  it("OUTGOING: shows Request sent and cancels by connection id", async () => {
    const props = setup({ state: "OUTGOING", connectionId: "c1" });
    expect(screen.getByText("Request sent")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel request" })
    );
    expect(props.removeAction).toHaveBeenCalledWith("c1");
  });

  it("INCOMING: Accept and Decline answer the request", async () => {
    const props = setup({ state: "INCOMING", connectionId: "c1" });
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(props.respondAction).toHaveBeenCalledWith("c1", "ACCEPT");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(props.respondAction).toHaveBeenCalledWith("c1", "REJECT");
  });

  it("CONNECTED: shows Connected and can remove the connection", async () => {
    const props = setup({ state: "CONNECTED", connectionId: "c1" });
    expect(screen.getByText("Connected")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove connection" })
    );
    expect(props.removeAction).toHaveBeenCalledWith("c1");
  });

  it("BLOCKED_BY_ME: offers Unblock and no Block", async () => {
    const props = setup({ state: "BLOCKED_BY_ME", connectionId: "c1" });
    expect(
      screen.queryByRole("button", { name: "Block" })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect(props.removeAction).toHaveBeenCalledWith("c1");
  });

  it("Block needs a second, confirming click, and can be backed out of", async () => {
    const props = setup({ state: "NONE" });
    await userEvent.click(screen.getByRole("button", { name: "Block" }));
    expect(props.blockAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByRole("button", { name: "Block" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Block" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm block" })
    );
    expect(props.blockAction).toHaveBeenCalledWith("target");
  });

  it("shows the server's safe message when an action fails", async () => {
    setup(
      { state: "NONE" },
      {
        requestAction: vi.fn(async () => ({
          ok: false as const,
          error: { code: "CONNECTION_COOLDOWN", message: "Try again later." },
          requestId: "r",
        })),
      }
    );
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Try again later."
    );
  });
});
