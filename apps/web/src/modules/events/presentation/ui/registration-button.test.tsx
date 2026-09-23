import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";

import {
  render,
  screen,
  waitFor,
  within,
} from "../../../../../tests/support/test-utils";
import type { EventDetail } from "../../application/event-queries";
import { RegistrationButton } from "./registration-button";

type Action = (
  eventId: string
) => Promise<ActionResult<{ registrationId: string }>>;

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-06-01T00:00:00Z");
const FUTURE = new Date("2026-07-01T00:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");

function event(over: Partial<EventDetail> = {}): EventDetail {
  return {
    id: ID,
    title: "Reunion",
    description: "The annual alumni reunion.",
    startsAt: FUTURE,
    timezone: "UTC",
    location: "Main hall",
    isOnline: false,
    capacity: 100,
    registeredCount: 1,
    spotsRemaining: 99,
    registrationDeadline: FUTURE,
    status: "SCHEDULED",
    organizer: { id: "o1", name: "Org" },
    viewer: { registrationState: null },
    canManage: false,
    ...over,
  };
}

const ok: Action = async () => ({
  ok: true,
  data: { registrationId: "r1" },
});

const setup = (
  evt: EventDetail,
  registerAction: ReturnType<typeof vi.fn<Action>> = vi.fn(ok),
  cancelAction: ReturnType<typeof vi.fn<Action>> = vi.fn(ok)
) => {
  vi.useFakeTimers().setSystemTime(NOW);
  render(
    <RegistrationButton
      event={evt}
      registerAction={registerAction}
      cancelAction={cancelAction}
    />
  );
  vi.useRealTimers();
  return { registerAction, cancelAction };
};

beforeEach(() => {
  router.refresh.mockReset();
});

describe("RegistrationButton", () => {
  it("shows an enabled Register button when the viewer isn't registered", async () => {
    const user = userEvent.setup();
    const { registerAction } = setup(event());
    const button = screen.getByRole("button", { name: "Register" });
    expect(button).toBeEnabled();

    await user.click(button);
    await waitFor(() => expect(registerAction).toHaveBeenCalledWith(ID));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("disables Register with a reason once the event is full", () => {
    setup(event({ spotsRemaining: 0 }));
    const button = screen.getByRole("button", { name: "Register" });
    expect(button).toBeDisabled();
    expect(screen.getByText("This event is full.")).toBeInTheDocument();
  });

  it("disables Register with a reason once the deadline has passed", () => {
    setup(event({ registrationDeadline: PAST }));
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
    expect(screen.getByText("Registration is closed.")).toBeInTheDocument();
  });

  it("disables Register with a reason when the event was cancelled", () => {
    setup(event({ status: "CANCELLED" }));
    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
    expect(screen.getByText("This event was cancelled.")).toBeInTheDocument();
  });

  it("shows nothing once the viewer already attended or no-showed", () => {
    setup(event({ viewer: { registrationState: "ATTENDED" } }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows Cancel registration, confirms via the dialog, then calls cancelAction", async () => {
    const user = userEvent.setup();
    const { cancelAction } = setup(
      event({ viewer: { registrationState: "REGISTERED" } })
    );
    await user.click(
      screen.getByRole("button", { name: "Cancel registration" })
    );
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText("Cancel your registration?")
    ).toBeInTheDocument();
    expect(cancelAction).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Cancel registration" })
    );
    await waitFor(() => expect(cancelAction).toHaveBeenCalledWith(ID));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("disables Cancel once the event has started", () => {
    setup(
      event({
        viewer: { registrationState: "REGISTERED" },
        startsAt: PAST,
        registrationDeadline: PAST,
      })
    );
    expect(
      screen.getByRole("button", { name: "Cancel registration" })
    ).toBeDisabled();
    expect(
      screen.getByText("The event has already started.")
    ).toBeInTheDocument();
  });

  it("shows a server error in an alert when the action refuses", async () => {
    const user = userEvent.setup();
    setup(
      event(),
      vi.fn(async () => ({
        ok: false as const,
        error: { code: "EVENT_FULL", message: "This event is full." },
        requestId: "r",
      }))
    );
    await user.click(screen.getByRole("button", { name: "Register" }));
    expect(await screen.findByText("This event is full.")).toBeInTheDocument();
  });
});
