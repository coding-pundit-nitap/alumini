import { describe, expect, it } from "vitest";

import { chipsFor, clearFiltersHref } from "./directory-filters";

const departments = [{ code: "CSE", name: "Computer Science" }];

describe("directory filter chips", () => {
  it("gives each filter a chip that removes only it (and the cursor), naming departments", () => {
    const params = {
      q: "asha",
      department: "CSE",
      skills: ["go", "rust"],
      sort: "name",
      location: "",
      cursor: "CUR",
    };
    expect(chipsFor(params, departments)).toEqual([
      {
        key: "department=CSE",
        label: "Computer Science",
        href: "/directory?q=asha&skills=go&skills=rust&sort=name",
      },
      {
        key: "skills=go",
        label: "Skill go",
        href: "/directory?q=asha&department=CSE&skills=rust&sort=name",
      },
      {
        key: "skills=rust",
        label: "Skill rust",
        href: "/directory?q=asha&department=CSE&skills=go&sort=name",
      },
    ]);
  });

  it("removing the last filter goes back to the bare directory", () => {
    expect(chipsFor({ company: "L&T" }, departments)[0]!.href).toBe(
      "/directory"
    );
  });

  it("clears filters but keeps the search text, and has nothing to clear without filters", () => {
    expect(clearFiltersHref({ q: "asha", location: "Pune" })).toBe(
      "/directory?q=asha"
    );
    expect(clearFiltersHref({ location: "Pune" })).toBe("/directory");
    expect(clearFiltersHref({ q: "asha", sort: "name" })).toBeNull();
  });
});
