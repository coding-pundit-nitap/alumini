import { describe, expect, it } from "vitest";

import { parseDirectoryQuery } from "./query.ts";

const ok = (input: Record<string, string | string[]>) => {
  const r = parseDirectoryQuery(input);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.query;
};

describe("parseDirectoryQuery", () => {
  it("defaults to name order without a term and relevance with one", () => {
    expect(ok({}).sort).toBe("name");
    expect(ok({ q: "asha" }).sort).toBe("relevance");
    expect(ok({ q: "asha", sort: "name" }).sort).toBe("name");
  });

  it("treats blank form fields as absent", () => {
    const q = ok({ q: "", company: "  ", department: [""], location: "" });
    expect(q).toMatchObject({ department: [], sort: "name" });
    expect(q.q).toBeUndefined();
    expect(q.company).toBeUndefined();
  });

  it("rejects relevance without a term, one-letter terms and inverted ranges", () => {
    expect(parseDirectoryQuery({ sort: "relevance" }).ok).toBe(false);
    expect(parseDirectoryQuery({ q: "a" }).ok).toBe(false);
    expect(
      parseDirectoryQuery({
        graduationYearFrom: "2020",
        graduationYearTo: "2015",
      }).ok
    ).toBe(false);
  });

  it("caps the limit, the skill filters and the year list", () => {
    expect(parseDirectoryQuery({ limit: "51" }).ok).toBe(false);
    expect(
      parseDirectoryQuery({ skills: ["a", "b", "c", "d", "e", "f"] }).ok
    ).toBe(false);
    expect(ok({ limit: "5" }).limit).toBe(5);
  });

  it("reads repeated URL parameters", () => {
    const q = ok({});
    expect(q.limit).toBe(20);
    const r = parseDirectoryQuery(
      new URLSearchParams(
        "department=cse&department=ece&graduationYear=2019&skills=go"
      )
    );
    expect(r.ok && r.query).toMatchObject({
      department: ["cse", "ece"],
      graduationYear: [2019],
      skills: ["go"],
    });
  });
});
