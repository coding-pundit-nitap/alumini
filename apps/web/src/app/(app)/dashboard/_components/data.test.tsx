import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorizationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

const mocks = vi.hoisted(() => ({
  listConnections: vi.fn(),
  listDepartments: vi.fn(),
  listEvents: vi.fn(),
  listPublishedJobs: vi.fn(),
  getMentorProfile: vi.fn(),
  listMentors: vi.fn(),
  listMentorships: vi.fn(),
  listConversations: vi.fn(),
  getUnreadCount: vi.fn(),
  getOwnProfile: vi.fn(),
  can: vi.fn(),
}));

vi.mock("@/composition/connections", () => ({
  listConnections: mocks.listConnections,
}));
vi.mock("@/composition/directory", () => ({
  listDepartments: mocks.listDepartments,
}));
vi.mock("@/composition/events", () => ({ listEvents: mocks.listEvents }));
vi.mock("@/composition/jobs", () => ({
  listPublishedJobs: mocks.listPublishedJobs,
}));
vi.mock("@/composition/mentorship", () => ({
  getMentorProfile: mocks.getMentorProfile,
  listMentors: mocks.listMentors,
  listMentorships: mocks.listMentorships,
}));
vi.mock("@/composition/messaging", () => ({
  listConversations: mocks.listConversations,
}));
vi.mock("@/composition/notifications", () => ({
  getUnreadCount: mocks.getUnreadCount,
}));
vi.mock("@/composition/users", () => ({
  getOwnProfile: mocks.getOwnProfile,
}));
vi.mock("@/modules/auth", () => ({
  can: mocks.can,
  PERMISSIONS: { MENTORSHIP_REQUEST: "mentorship.request" },
}));

import {
  Attention,
  Completeness,
  Events,
  FirstRun,
  Greeting,
  Jobs,
  RoleBlock,
  WidgetStrip,
  Widgets,
} from "./data";

const actor: Actor = {
  userId: "u1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};

const emptyProfile = {
  userId: "u1",
  fullName: "  Asha   Rao ",
  headline: null,
  bio: null,
  location: null,
  department: "Computer Science",
  degree: null,
  graduationYear: 2020,
  photoUploadId: null,
  experience: [],
  education: [],
  skills: [],
  links: [],
  settings: {},
};

const job = { id: "j1", title: "Engineer", company: "Acme", location: "Pune" };
const event = {
  id: "e1",
  title: "Reunion",
  startsAt: new Date("2026-12-01T10:00:00Z"),
  timezone: "Asia/Kolkata",
  isOnline: true,
  location: null,
};

/** Renders what an async server component resolves to. */
async function show(element: Promise<ReactElement | null>) {
  const resolved = await element;
  return render(<>{resolved}</>);
}

beforeEach(() => {
  mocks.getOwnProfile.mockResolvedValue(emptyProfile);
  mocks.listPublishedJobs.mockResolvedValue({ data: [] });
  mocks.listEvents.mockResolvedValue({ data: [] });
  mocks.getMentorProfile.mockResolvedValue(null);
  mocks.listConnections.mockResolvedValue({ data: [] });
  mocks.listConversations.mockResolvedValue({ data: [] });
  mocks.listMentorships.mockResolvedValue({ data: [] });
  mocks.getUnreadCount.mockResolvedValue(0);
  mocks.listDepartments.mockResolvedValue([
    { code: "CSE", name: "Computer Science" },
  ]);
  mocks.listMentors.mockResolvedValue({ data: [] });
  mocks.can.mockReturnValue(false);
});

describe("dashboard data blocks", () => {
  it("greets by first name, or plainly when the profile can't load", async () => {
    await show(Greeting({ actor }));
    expect(screen.getByRole("heading")).toHaveTextContent("Welcome back, Asha");

    mocks.getOwnProfile.mockRejectedValue(new Error("down"));
    const { container } = await show(Greeting({ actor }));
    expect(container).toHaveTextContent(/^Welcome back$/);
  });

  it("shows completeness, or an inline error when the profile fails", async () => {
    await show(Completeness({ actor }));
    expect(screen.getAllByText(/Headline/).length).toBeGreaterThan(0);

    mocks.getOwnProfile.mockRejectedValue(new Error("down"));
    await show(Completeness({ actor }));
    expect(screen.getByText("Couldn't load your profile")).toBeInTheDocument();
  });

  it("lists jobs and events, hides a denied block and flags a failed one", async () => {
    mocks.listPublishedJobs.mockResolvedValue({ data: [job] });
    mocks.listEvents.mockResolvedValue({ data: [event] });
    await show(Jobs({ actor }));
    await show(Events({ actor }));
    expect(screen.getByRole("link", { name: /Engineer/ })).toHaveAttribute(
      "href",
      "/jobs/j1"
    );
    expect(screen.getByRole("link", { name: /Reunion/ })).toHaveTextContent(
      "Online"
    );

    mocks.listPublishedJobs.mockRejectedValue(new AuthorizationError());
    mocks.listEvents.mockRejectedValue(new NotFoundError());
    expect(await Jobs({ actor })).toBeNull();
    expect(await Events({ actor })).toBeNull();

    mocks.listPublishedJobs.mockRejectedValue(new Error("down"));
    mocks.listEvents.mockRejectedValue(new Error("down"));
    await show(Jobs({ actor }));
    await show(Events({ actor }));
    expect(screen.getByText("Couldn't load opportunities")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load events")).toBeInTheDocument();
  });

  it("counts what needs attention, including mentorship requests for a mentor", async () => {
    mocks.listConnections.mockResolvedValue({ data: [{}, {}] });
    mocks.listConversations.mockResolvedValue({
      data: [{ unreadCount: 2 }, { unreadCount: 3 }],
    });
    mocks.getMentorProfile.mockResolvedValue({ userId: "u1" });
    mocks.listMentorships.mockResolvedValue({ data: [{}] });
    mocks.getUnreadCount.mockResolvedValue(4);
    await show(Attention({ actor }));
    expect(
      screen.getByRole("link", { name: /2 connection requests/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /5 unread messages/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /1 mentorship request/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load/)).toBeNull();
  });

  it("says when some counts failed", async () => {
    mocks.getUnreadCount.mockRejectedValue(new Error("down"));
    await show(Attention({ actor }));
    expect(
      screen.getByText("Couldn't load some of what needs your attention")
    ).toBeInTheDocument();
  });

  describe("RoleBlock", () => {
    it("shows a mentor their mentees", async () => {
      mocks.getMentorProfile.mockResolvedValue({ userId: "u1" });
      mocks.listMentorships.mockResolvedValue({
        data: [
          { counterparty: { id: "m1", fullName: "Ravi Kumar" }, topic: null },
          {
            counterparty: { id: "m2", fullName: "Meera" },
            topic: "Careers",
          },
        ],
      });
      await show(RoleBlock({ actor }));
      expect(screen.getByText("Your mentees")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /RK Ravi Kumar Mentorship/ })
      ).toHaveAttribute("href", "/members/m1");
      expect(screen.getByText("Careers")).toBeInTheDocument();
    });

    it("flags a failed mentee list", async () => {
      mocks.getMentorProfile.mockResolvedValue({ userId: "u1" });
      mocks.listMentorships.mockRejectedValue(new Error("down"));
      await show(RoleBlock({ actor }));
      expect(
        screen.getByText("Couldn't load your mentees")
      ).toBeInTheDocument();
    });

    it("suggests mentors from the member's department first", async () => {
      mocks.can.mockReturnValue(true);
      mocks.listMentors.mockImplementation(
        async (args: { department?: string }) =>
          args.department === "CSE"
            ? { data: [{ userId: "x", fullName: "Same Dept", headline: null }] }
            : { data: [] }
      );
      await show(RoleBlock({ actor }));
      expect(screen.getByText("Mentors you might like")).toBeInTheDocument();
      expect(screen.getByText("Same department")).toBeInTheDocument();
    });

    it("falls back to any mentor, by headline or expertise", async () => {
      mocks.can.mockReturnValue(true);
      mocks.getOwnProfile.mockResolvedValue({
        ...emptyProfile,
        department: null,
      });
      mocks.listMentors.mockResolvedValue({
        data: [
          { userId: "a", fullName: "A", headline: "CTO", expertise: "Go" },
          { userId: "b", fullName: "B", headline: null, expertise: "Rust" },
        ],
      });
      await show(RoleBlock({ actor }));
      expect(screen.getByText("CTO")).toBeInTheDocument();
      expect(screen.getByText("Rust")).toBeInTheDocument();
    });

    it("says when there are no mentors, and flags a failed lookup", async () => {
      mocks.can.mockReturnValue(true);
      await show(RoleBlock({ actor }));
      expect(
        screen.getByText("No mentors are taking requests right now.")
      ).toBeInTheDocument();

      mocks.listMentors.mockRejectedValue(new Error("down"));
      await show(RoleBlock({ actor }));
      expect(
        screen.getByText("Couldn't load mentor suggestions")
      ).toBeInTheDocument();
    });

    it("renders nothing for a member who is neither mentor nor mentee", async () => {
      expect(await RoleBlock({ actor })).toBeNull();
      mocks.can.mockReturnValue(true);
      mocks.listMentors.mockRejectedValue(new AuthorizationError());
      expect(await RoleBlock({ actor })).toBeNull();
    });
  });

  describe("FirstRun", () => {
    it("guides a new member with nothing on their dashboard, linking their batch", async () => {
      await show(FirstRun({ actor }));
      expect(
        screen.getByRole("link", { name: /Find people from your batch/ })
      ).toHaveAttribute("href", "/directory?graduationYear=2020");
    });

    it("links the whole directory when the batch is unknown", async () => {
      mocks.getOwnProfile.mockRejectedValue(new Error("down"));
      await show(FirstRun({ actor }));
      expect(
        screen.getByRole("link", { name: /Find people from your batch/ })
      ).toHaveAttribute("href", "/directory");
    });

    it.each([
      [
        "a complete profile",
        () =>
          mocks.getOwnProfile.mockResolvedValue({
            ...emptyProfile,
            headline: "h",
            bio: "b",
            location: "l",
            photoUploadId: "p",
            experience: [{}],
            education: [{}],
            skills: [{}],
            links: [{}],
          }),
      ],
      [
        "open jobs",
        () => mocks.listPublishedJobs.mockResolvedValue({ data: [job] }),
      ],
      [
        "upcoming events",
        () => mocks.listEvents.mockResolvedValue({ data: [event] }),
      ],
      [
        "a failed count",
        () => mocks.getUnreadCount.mockRejectedValue(new Error("x")),
      ],
      [
        "something to attend to",
        () => mocks.getUnreadCount.mockResolvedValue(1),
      ],
    ])("stays hidden with %s", async (_label, arrange) => {
      arrange();
      expect(await FirstRun({ actor })).toBeNull();
    });
  });

  it("streams every block in the rail and in the strip", () => {
    const { container } = render(
      <>
        <Widgets actor={actor} />
        <WidgetStrip actor={actor} />
      </>
    );
    expect(
      container.querySelectorAll("[data-slot='skeleton'], .animate-pulse")
        .length
    ).toBeGreaterThan(0);
  });
});
