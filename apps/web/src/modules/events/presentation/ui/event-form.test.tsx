import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { EventForm } from "./event-form";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ID = "11111111-1111-4111-8111-111111111111";
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

type Action = Parameters<typeof EventForm>[0]["createAction"];
const setup = (
  createAction: Action = vi.fn(async () => ({
    ok: true as const,
    data: { eventId: ID },
  }))
) => {
  render(<EventForm createAction={createAction} />);
  return createAction;
};

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Title"), "Alumni reunion");
  await user.type(
    screen.getByLabelText("Description"),
    "The annual alumni reunion."
  );
  fireEvent.change(screen.getByLabelText("Starts"), {
    target: { value: "2026-10-01T18:00" },
  });
  fireEvent.change(screen.getByLabelText("Registration closes"), {
    target: { value: "2026-09-30T18:00" },
  });
  await user.type(screen.getByLabelText("Location"), "Main hall");
  await user.type(screen.getByLabelText("Capacity"), "100");
}

beforeEach(() => router.push.mockReset());

describe("EventForm", () => {
  it("shows an error on every missing required field and does not call the action", async () => {
    const user = userEvent.setup();
    const action = setup();
    await user.click(screen.getByRole("button", { name: "Create event" }));

    for (const [label, message] of [
      ["Title", "Use at least 3 characters."],
      ["Description", "Use at least 10 characters."],
      ["Starts", "Choose when the event starts."],
      ["Registration closes", "Choose when registration closes."],
      ["Location", "Add a location for an in-person event."],
      ["Capacity", "Enter the number of seats."],
    ] as const) {
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByLabelText(label)).toHaveAttribute(
        "aria-invalid",
        "true"
      );
    }
    expect(action).not.toHaveBeenCalled();
  });

  it("submits the form payload with the browser's zone, then opens the new event", async () => {
    const user = userEvent.setup();
    const action = setup();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action).toHaveBeenCalledWith({
      title: "Alumni reunion",
      description: "The annual alumni reunion.",
      startsLocal: "2026-10-01T18:00",
      deadlineLocal: "2026-09-30T18:00",
      timezone: browserZone,
      isOnline: false,
      location: "Main hall",
      capacity: 100,
    });
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/events/${ID}`)
    );
  });

  it("does not require a location for an online event", async () => {
    const user = userEvent.setup();
    const action = setup();
    await user.click(screen.getByRole("switch", { name: "Online event" }));
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Webinar");
    await user.type(screen.getByLabelText("Description"), "An online talk.");
    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "2026-10-01T18:00" },
    });
    fireEvent.change(screen.getByLabelText("Registration closes"), {
      target: { value: "2026-09-30T18:00" },
    });
    await user.type(screen.getByLabelText("Capacity"), "20");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith(
        expect.objectContaining({ isOnline: true, location: "" })
      )
    );
  });

  it("shows a server field error on its form field", async () => {
    const user = userEvent.setup();
    setup(
      vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "VALIDATION_FAILED",
          message: "The request contains invalid fields.",
          fields: { startsAt: "startsAt must be in the future." },
        },
        requestId: "r",
      }))
    );
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(
      await screen.findByText("startsAt must be in the future.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Starts")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a non-field server error in an alert", async () => {
    const user = userEvent.setup();
    setup(
      vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
        },
        requestId: "r",
      }))
    );
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(
      await screen.findByText("Too many requests. Please try again later.")
    ).toBeInTheDocument();
  });
});
