import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { AlumniSummary } from "../../application/search-directory";
import { AlumniList } from "./alumni-list";

const person = (over: Partial<AlumniSummary> = {}): AlumniSummary => ({
  id: "u1",
  fullName: "Asha Rao",
  headline: "Builds bridges",
  department: "Civil Engineering",
  degree: "B.Tech",
  graduationYear: 2019,
  location: "Pune",
  currentCompany: "L&T",
  currentDesignation: "Engineer",
  ...over,
});

describe("AlumniList", () => {
  it("links each person to their profile with their details, and marks you", () => {
    render(
      <AlumniList
        people={[person(), person({ id: "me", fullName: "Me Self" })]}
        viewerId="me"
      />
    );
    const link = screen.getByRole("link", { name: /Asha Rao/ });
    expect(link).toHaveAttribute("href", "/members/u1");
    expect(link).toHaveTextContent("Builds bridges");
    expect(link).toHaveTextContent("Engineer at L&T");
    expect(link).toHaveTextContent("Civil Engineering '19");
    expect(link).toHaveTextContent("Pune");
    expect(link).not.toHaveTextContent("You");
    expect(screen.getByRole("link", { name: /Me Self/ })).toHaveTextContent(
      "You"
    );
  });

  it("says nothing matched, and offers to clear filters when there are some", () => {
    const { rerender } = render(<AlumniList people={[]} />);
    expect(
      screen.getByText("No members match these filters.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    rerender(<AlumniList people={[]} clearHref="/directory?q=ab" />);
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/directory?q=ab"
    );
  });

  it("without in-place loading, Load more is a plain link to the next page", () => {
    render(
      <AlumniList
        people={[person()]}
        nextCursor="CUR"
        nextHref="/directory?q=ab&cursor=CUR"
      />
    );
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
      "href",
      "/directory?q=ab&cursor=CUR"
    );
  });

  it("loads the next page in place with the same search, and offers a retry when it fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        Response.json({
          data: [person(), person({ id: "u2", fullName: "Ravi K" })],
          page: { limit: 20, nextCursor: null, hasMore: false },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AlumniList
        people={[person()]}
        query="q=ab&department=CSE"
        nextCursor="CUR"
        nextHref="/directory?q=ab&department=CSE&cursor=CUR"
      />
    );
    await userEvent.click(screen.getByRole("link", { name: "Load more" }));
    expect(await screen.findByText("Couldn't load more.")).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Ravi K/ })).toBeVisible();
    expect(screen.getAllByRole("link", { name: /Asha Rao/ })).toHaveLength(1);
    expect(fetchMock.mock.calls[1]![0]).toBe(
      "/api/v1/alumni?q=ab&department=CSE&cursor=CUR"
    );
    expect(screen.queryByRole("link", { name: "Load more" })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("shows only the details a person has", () => {
    render(
      <AlumniList
        people={[
          person({
            headline: null,
            currentCompany: null,
            currentDesignation: "Founder",
            department: null,
            graduationYear: null,
            location: null,
          }),
          person({
            id: "u2",
            fullName: "Bare",
            headline: null,
            currentCompany: null,
            currentDesignation: null,
            department: null,
            graduationYear: 2020,
            location: null,
          }),
          person({
            id: "u3",
            fullName: "Nothing",
            headline: null,
            currentCompany: null,
            currentDesignation: null,
            department: null,
            graduationYear: null,
            location: null,
          }),
        ]}
      />
    );
    const asha = screen.getByRole("link", { name: /Asha Rao/ });
    expect(asha).toHaveTextContent("Founder");
    expect(asha).not.toHaveTextContent(" at ");
    expect(screen.getByRole("link", { name: /Bare/ })).toHaveTextContent("'20");
    expect(
      screen.getByRole("link", { name: /Nothing/ }).querySelectorAll("svg")
    ).toHaveLength(1);
  });

  it("loads the next page when the end of the list scrolls into view", async () => {
    let fire: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof fire) {
          fire = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [], page: { nextCursor: null } })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AlumniList
        people={[person()]}
        query="q=ab"
        nextCursor="CUR"
        nextHref="/directory?q=ab&cursor=CUR"
      />
    );
    fire([{ isIntersecting: false }]);
    expect(fetchMock).not.toHaveBeenCalled();
    fire([{ isIntersecting: true }]);
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/alumni?q=ab&cursor=CUR")
    );
    vi.unstubAllGlobals();
  });
});
