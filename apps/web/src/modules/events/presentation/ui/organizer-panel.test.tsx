import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";

import {
  render,
  screen,
  waitFor,
  within,
} from "../../../../../tests/support/test-utils";
import type { EventDetail, Registrant } from "../../application/event-queries";
import { OrganizerPanel } from "./organizer-panel";

type CancelAction = (
  eventId: string
) => Promise<ActionResult<{ eventId: string }>>;
type MarkAction = (
  eventId: string,
  registrationId: string,
  state: "ATTENDED" | "NO_SHOW"
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
    canManage: true,
    ...over,
  };
}

const registrant = (over: Partial<Registrant> = {}): Registrant => ({
  registrationId: "r1",
  userId: "u1",
  name: "Ada Lovelace",
  state: "REGISTERED",
  registeredAt: new Date("2026-01-15T00:00:00Z"),
  ...over,
});

const okCancel: CancelAction = async () => ({
  ok: true,
  data: { eventId: ID },
});
const okMark: MarkAction = async () => ({
  ok: true,
  data: { registrationId: "r1" },
});

function setup(
  evt: EventDetail,
  registrants: Registrant[],
  cancelEventAction: ReturnType<typeof vi.fn<CancelAction>> = vi.fn(okCancel),
  markAttendanceAction: ReturnType<typeof vi.fn<MarkAction>> = vi.fn(okMark)
) {
  vi.useFakeTimers().setSystemTime(NOW);
  render(
    <OrganizerPanel
      event={evt}
      registrants={registrants}
      cancelEventAction={cancelEventAction}
      markAttendanceAction={markAttendanceAction}
    />
  );
  vi.useRealTimers();
  return { cancelEventAction, markAttendanceAction };
}

beforeEach(() => {
  router.refresh.mockReset();
});

describe("OrganizerPanel", () => {
  it("confirms cancellation via the dialog, then calls cancelEventAction", async () => {
    const user = userEvent.setup();
    const { cancelEventAction } = setup(event(), []);

    await user.click(screen.getByRole("button", { name: "Cancel event" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Cancel this event?")).toBeInTheDocument();
    expect(cancelEventAction).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Cancel event" })
    );
    await waitFor(() => expect(cancelEventAction).toHaveBeenCalledWith(ID));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("disables the Cancel event button once the event is already cancelled", () => {
    setup(event({ status: "CANCELLED" }), []);
    expect(screen.getByRole("button", { name: "Cancel event" })).toBeDisabled();
  });

  it("shows a server error when cancellation is refused", async () => {
    const user = userEvent.setup();
    setup(
      event(),
      [],
      vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "INVALID_STATE_TRANSITION",
          message: "Already cancelled.",
        },
        requestId: "r",
      }))
    );
    await user.click(screen.getByRole("button", { name: "Cancel event" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel event",
      })
    );
    expect(await screen.findByText("Already cancelled.")).toBeInTheDocument();
  });

  it("disables attendance selects before the event starts", () => {
    setup(event({ startsAt: FUTURE }), [registrant()]);
    expect(
      screen.getByText("Attendance can be marked once the event starts.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Mark attendance for Ada Lovelace" })
    ).toBeDisabled();
  });

  it("marks attendance once the event has started", async () => {
    const user = userEvent.setup();
    const { markAttendanceAction } = setup(
      event({ startsAt: PAST, registrationDeadline: PAST }),
      [registrant()]
    );
    const select = screen.getByRole("combobox", {
      name: "Mark attendance for Ada Lovelace",
    });
    expect(select).toBeEnabled();

    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Attended" }));

    await waitFor(() =>
      expect(markAttendanceAction).toHaveBeenCalledWith(ID, "r1", "ATTENDED")
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("does not render an attendance control for a cancelled registration", () => {
    setup(event({ startsAt: PAST }), [registrant({ state: "CANCELLED" })]);
    expect(
      screen.queryByRole("combobox", {
        name: "Mark attendance for Ada Lovelace",
      })
    ).not.toBeInTheDocument();
  });
});
