import { describe, expect, it } from "vitest";

import {
  render,
  screen,
  within,
} from "../../../../../tests/support/test-utils";
import type { EventSummary } from "../../application/event-queries";
import { EventList } from "./event-list";

const event = (over: Partial<EventSummary> = {}): EventSummary => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "Alumni reunion",
  startsAt: new Date("2026-10-01T12:30:00Z"),
  timezone: "Asia/Kolkata",
  location: "Main hall",
  isOnline: false,
  capacity: 100,
  registeredCount: 58,
  spotsRemaining: 42,
  registrationDeadline: new Date("2026-09-30T12:30:00Z"),
  status: "SCHEDULED",
  organizer: { id: "o1", name: "Asha Rao" },
  viewer: { registrationState: null },
  ...over,
});

const card = (title: string) =>
  screen
    .getByRole("link", { name: title })
    .closest<HTMLElement>("[data-slot=card]")!;

describe("EventList", () => {
  it("renders one card per event, the title linking to its detail page", () => {
    render(
      <EventList
        events={[event(), event({ id: "e2", title: "Tech talk" })]}
        loadMoreHref={null}
      />
    );
    expect(
      screen.getByRole("link", { name: "Alumni reunion" })
    ).toHaveAttribute("href", "/events/11111111-1111-4111-8111-111111111111");
    expect(screen.getByRole("link", { name: "Tech talk" })).toHaveAttribute(
      "href",
      "/events/e2"
    );
  });

  it("shows the start time in the event's zone, the location and the spots left", () => {
    render(<EventList events={[event()]} loadMoreHref={null} />);
    const c = within(card("Alumni reunion"));
    expect(
      c.getByText("Thu, Oct 1, 2026, 6:00 PM GMT+5:30")
    ).toBeInTheDocument();
    expect(c.getByText("Main hall")).toBeInTheDocument();
    expect(c.getByText("42 of 100 spots left")).toBeInTheDocument();
    expect(c.queryByText("Full")).not.toBeInTheDocument();
    expect(c.queryByText("Cancelled")).not.toBeInTheDocument();
    expect(c.queryByText("Registered")).not.toBeInTheDocument();
  });

  it("badges Full, Online, Cancelled and Registered", () => {
    render(
      <EventList
        events={[
          event({
            id: "e1",
            title: "Full one",
            spotsRemaining: 0,
            registeredCount: 100,
            isOnline: true,
            location: null,
            viewer: { registrationState: "REGISTERED" },
          }),
          event({ id: "e2", title: "Called off", status: "CANCELLED" }),
          event({
            id: "e3",
            title: "Attended one",
            viewer: { registrationState: "ATTENDED" },
          }),
          event({
            id: "e4",
            title: "Dropped out",
            viewer: { registrationState: "CANCELLED" },
          }),
        ]}
        loadMoreHref={null}
      />
    );
    const full = within(card("Full one"));
    expect(full.getByText("Full")).toBeInTheDocument();
    expect(full.getByText("Online")).toBeInTheDocument();
    expect(full.getByText("Registered")).toBeInTheDocument();
    expect(
      within(card("Called off")).getByText("Cancelled")
    ).toBeInTheDocument();
    expect(
      within(card("Attended one")).getByText("Registered")
    ).toBeInTheDocument();
    expect(
      within(card("Dropped out")).queryByText("Registered")
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no events", () => {
    render(<EventList events={[]} loadMoreHref={null} />);
    expect(screen.getByText("No events here yet")).toBeInTheDocument();
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
  });

  it("links to the next page when there is one", () => {
    render(
      <EventList
        events={[event()]}
        loadMoreHref="/events?tab=past&cursor=abc"
      />
    );
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
      "href",
      "/events?tab=past&cursor=abc"
    );
  });
});
