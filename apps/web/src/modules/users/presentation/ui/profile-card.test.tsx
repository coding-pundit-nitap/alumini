import { describe, expect, it } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { ProfileCard } from "./profile-card";

describe("ProfileCard", () => {
  it("renders the reduced view: name and headline, no About, institution or detail sections", () => {
    render(
      <ProfileCard
        view={{ userId: "u", fullName: "Asha Rao", headline: "Engineer" }}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Asha Rao" })
    ).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    expect(screen.queryByText("About")).toBeNull();
    expect(screen.queryByText(/Batch of/)).toBeNull();
    expect(screen.queryByText("Experience")).toBeNull();
    expect(screen.queryByText("Education")).toBeNull();
    expect(screen.queryByText("Skills")).toBeNull();
    expect(screen.queryByText("Links")).toBeNull();
  });

  it("renders every section that is present", () => {
    render(
      <ProfileCard
        view={{
          userId: "u",
          fullName: "Asha Rao",
          headline: null,
          location: "Tirupati",
          bio: "Line one\nLine two",
          institution: {
            department: "Computer Science",
            degree: "B.Tech",
            graduationYear: 2019,
          },
        }}
      />
    );
    expect(screen.getByText("Tirupati")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByText(/Computer Science/)).toBeInTheDocument();
    expect(screen.getByText(/Batch of 2019/)).toBeInTheDocument();
  });

  it("renders each present detail section, current-role-first and no id anywhere", () => {
    render(
      <ProfileCard
        view={{
          userId: "u",
          fullName: "Asha Rao",
          headline: null,
          experience: [
            {
              company: "Acme",
              industry: null,
              designation: "Engineer",
              startDate: "2020-01-01",
              endDate: null,
              isCurrent: true,
            },
          ],
          education: [
            {
              institution: "IIT Madras",
              qualification: "M.Tech",
              fieldOfStudy: null,
              startYear: 2019,
              endYear: 2021,
            },
          ],
          skills: [{ skill: "TypeScript" }, { skill: "Go" }],
          links: [{ type: "GITHUB", url: "https://github.com/asha" }],
        }}
      />
    );
    expect(screen.getByText("Experience")).toBeInTheDocument();
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByText(/Present/)).toBeInTheDocument();
    expect(screen.getByText("Education")).toBeInTheDocument();
    expect(screen.getByText(/IIT Madras/)).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Go")).toBeInTheDocument();
    expect(screen.getByText("Links")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /github\.com\/asha/ });
    expect(link).toHaveAttribute("href", "https://github.com/asha");
    expect(link).toHaveAttribute("rel", expect.stringContaining("nofollow"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("ugc"));
  });

  it("omits a section entirely when it is absent from the view (hidden by privacy)", () => {
    render(
      <ProfileCard
        view={{
          userId: "u",
          fullName: "Asha Rao",
          headline: null,
          education: [
            {
              institution: "IIT Madras",
              qualification: "M.Tech",
              fieldOfStudy: null,
              startYear: 2019,
              endYear: null,
            },
          ],
        }}
      />
    );
    expect(screen.getByText("Education")).toBeInTheDocument();
    expect(screen.queryByText("Experience")).toBeNull();
    expect(screen.queryByText("Skills")).toBeNull();
    expect(screen.queryByText("Links")).toBeNull();
  });

  it("does not render an empty section when the visible list is empty", () => {
    render(
      <ProfileCard
        view={{ userId: "u", fullName: "Asha Rao", headline: null, skills: [] }}
      />
    );
    expect(screen.queryByText("Skills")).toBeNull();
  });

  it("renders the photo when photoUrl is present", () => {
    render(
      <ProfileCard
        view={{
          userId: "u",
          fullName: "Asha Rao",
          headline: null,
          photoUrl: "/api/photos/u",
        }}
      />
    );
    expect(screen.getByRole("img", { name: /asha rao/i })).toHaveAttribute(
      "src",
      "/api/photos/u"
    );
  });

  it("omits the photo entirely when photoUrl is absent", () => {
    render(
      <ProfileCard
        view={{ userId: "u", fullName: "Asha Rao", headline: null }}
      />
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the tick with a way to change it, actions, and every link type", () => {
    render(
      <ProfileCard
        view={{
          userId: "u",
          fullName: "Asha Rao",
          headline: null,
          links: [
            { type: "LINKEDIN", url: "https://linkedin.com/in/asha" },
            { type: "TWITTER", url: "https://x.com/asha" },
            { type: "GITHUB", url: "https://github.com/asha" },
            { type: "WEBSITE", url: "https://asha.dev" },
            { type: "OTHER" as never, url: "https://example.org/asha" },
          ],
        }}
        tick={{ role: "ALUMNI", label: "Alumni", kind: "alumni" }}
        tickHref="/profile/badge"
        actions={<button>Connect</button>}
      />
    );
    expect(screen.getByRole("link", { name: "Change tick" })).toHaveAttribute(
      "href",
      "/profile/badge"
    );
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /asha|example/ })).toHaveLength(
      5
    );
    expect(screen.getByText("in")).toBeInTheDocument();
    expect(screen.getByText("𝕏")).toBeInTheDocument();
  });

  it("shows only what the schooling has, and past roles and courses with their dates", () => {
    render(
      <ProfileCard
        view={{
          userId: "u",
          fullName: "Asha Rao",
          headline: null,
          institution: { department: null, degree: null, graduationYear: 2019 },
          experience: [
            {
              company: "Old Co",
              industry: "Software",
              designation: "Intern",
              startDate: "2018-01-01",
              endDate: "2018-07-01",
              isCurrent: false,
            },
            {
              company: "Unknown end",
              industry: null,
              designation: "Contractor",
              startDate: "2017-01-01",
              endDate: null,
              isCurrent: false,
            },
          ],
          education: [
            {
              institution: "NIT AP",
              qualification: "B.Tech",
              fieldOfStudy: "CSE",
              startYear: 2014,
              endYear: null,
            },
          ],
        }}
        tick={{ role: "ALUMNI", label: "Alumni", kind: "alumni" }}
      />
    );
    expect(screen.getByText("Batch of 2019")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change tick" })).toBeNull();
    expect(screen.getByText(/· Software/)).toBeInTheDocument();
    expect(screen.getByText(/B.Tech, CSE/)).toBeInTheDocument();
    expect(screen.getByText(/2014 – present/)).toBeInTheDocument();
  });

  it("shows a degree without a batch, and no schooling line when the institution is empty", () => {
    const { unmount } = render(
      <ProfileCard
        view={{
          userId: "u",
          fullName: "Asha Rao",
          headline: null,
          institution: {
            department: null,
            degree: "M.Tech",
            graduationYear: null,
          },
        }}
      />
    );
    expect(screen.getByText("M.Tech")).toBeInTheDocument();
    expect(screen.queryByText(/Batch of/)).toBeNull();
    unmount();
    render(
      <ProfileCard
        view={{
          userId: "u",
          fullName: "Asha Rao",
          headline: null,
          institution: { department: null, degree: null, graduationYear: null },
        }}
      />
    );
    expect(screen.queryByRole("list")).toBeNull();
  });
});
