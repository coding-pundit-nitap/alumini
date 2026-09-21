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
});
